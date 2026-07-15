"""Kiosk registry + per-kiosk config endpoints (per-device settings — dd9.2/dd9.3)."""

import json

from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel, ValidationError

from app.api.routes.config import ConfigUpdate, build_global_config
from app.services import kiosk_bundle, kiosk_registry
from app.services.kiosk_registry import (
    _KIOSK_ID_RE,
    agent_update_requested,
    device_config_version,
    get_overrides,
    merge_overrides,
    set_overrides,
)

router = APIRouter()

_MAX_OVERRIDES_BYTES = 64 * 1024


def _valid_id_or_400(kiosk_id: str) -> None:
    if not _KIOSK_ID_RE.fullmatch(kiosk_id):
        raise HTTPException(status_code=400, detail="Invalid kiosk id")


class OverridesBody(BaseModel):
    overrides: dict


@router.get("/kiosks")
async def get_kiosks():
    """List known kiosks (id, hostname, last-seen, lastAppliedVersion)."""
    return {"kiosks": await kiosk_registry.list_kiosks()}


@router.get("/kiosks/{kiosk_id}/overrides")
async def get_kiosk_overrides(kiosk_id: str):
    """Return a kiosk's raw override layer (not merged). 404 if kiosk unknown."""
    _valid_id_or_400(kiosk_id)
    overrides = await get_overrides(kiosk_id)
    if overrides is None:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return {"id": kiosk_id, "overrides": overrides}


@router.put("/kiosks/{kiosk_id}/overrides")
async def put_kiosk_overrides(kiosk_id: str, body: OverridesBody):
    """Replace a kiosk's override layer (upsert). Validated + size-capped."""
    _valid_id_or_400(kiosk_id)
    if len(json.dumps(body.overrides)) > _MAX_OVERRIDES_BYTES:
        raise HTTPException(status_code=400, detail="Overrides payload too large")
    # Type-check known config keys via the existing model (extra keys allowed).
    try:
        ConfigUpdate(**body.overrides)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Invalid overrides") from exc
    await set_overrides(kiosk_id, body.overrides)
    return {"id": kiosk_id, "overrides": body.overrides}


@router.post("/kiosks/{kiosk_id}/update")
async def post_kiosk_update(kiosk_id: str):
    """Flag a kiosk to self-update its agent on the next poll. 404 if unknown."""
    _valid_id_or_400(kiosk_id)
    ok = await kiosk_registry.request_agent_update(kiosk_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return {"id": kiosk_id, "requested": True}


@router.get("/kiosks/agent/manifest")
async def get_agent_manifest():
    """Serve the kiosk bundle manifest (version + per-file hashes)."""
    return kiosk_bundle.build_manifest()


@router.get("/kiosks/agent/files/{name}")
async def get_agent_file(name: str):
    """Serve one allowlisted bundle file's raw bytes. 404 for anything else."""
    try:
        data = kiosk_bundle.read_bundle_file(name)
    except (KeyError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Unknown bundle file")
    return Response(content=data, media_type="application/octet-stream")


@router.get("/kiosks/{kiosk_id}/config")
async def get_kiosk_config(
    kiosk_id: str, request: Request,
    khost: str | None = None, kagent: str | None = None, kstat: str | None = None,
):
    """Return a kiosk's effective (merged) config; records the kiosk + its agent report."""
    _valid_id_or_400(kiosk_id)
    # Compute available version BEFORE record_kiosk so we can pass it in,
    # enabling auto-clear of the update flag when agent_version == available_version.
    # Falls back to "" when bundle files are unavailable (e.g. dev without Pi deploy tree).
    try:
        available = kiosk_bundle.bundle_version()
    except Exception:
        available = ""
    try:
        await kiosk_registry.record_kiosk(
            kiosk_id, hostname=khost, agent_version=kagent, agent_status=kstat,
            available_version=available,
        )
    except Exception as exc:
        logger.warning(f"Failed to record kiosk {kiosk_id!r}: {exc}")

    base = await build_global_config()
    overrides = await get_overrides(kiosk_id)
    merged = merge_overrides(base, overrides)
    merged.pop("_agentUpdateRequested", None)  # never expose the host-internal flag verbatim
    version = device_config_version(merged)
    update_requested = agent_update_requested(overrides)

    etag = f"{version}.{available}.{int(update_requested)}"
    if request.headers.get("If-None-Match") == etag:
        return Response(status_code=304, headers={"ETag": etag})

    merged["deviceConfigVersion"] = version
    merged["agentAvailableVersion"] = available
    merged["agentUpdateRequested"] = update_requested
    return Response(
        content=json.dumps(merged),
        media_type="application/json",
        headers={"ETag": etag},
    )
