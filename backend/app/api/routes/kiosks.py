"""Kiosk registry + per-kiosk config endpoints (per-device settings — dd9.2/dd9.3)."""

import json

from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel

from app.api.routes.config import ConfigUpdate, build_global_config
from app.services import kiosk_registry
from app.services.kiosk_registry import (
    _KIOSK_ID_RE,
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
    ConfigUpdate(**body.overrides)
    await set_overrides(kiosk_id, body.overrides)
    return {"id": kiosk_id, "overrides": body.overrides}


@router.get("/kiosks/{kiosk_id}/config")
async def get_kiosk_config(kiosk_id: str, request: Request, khost: str | None = None):
    """Return a kiosk's effective (merged) config; records the kiosk; ETag + 304."""
    _valid_id_or_400(kiosk_id)
    try:
        await kiosk_registry.record_kiosk(kiosk_id, hostname=khost)
    except Exception as exc:
        logger.warning(f"Failed to record kiosk {kiosk_id!r}: {exc}")

    base = await build_global_config()
    overrides = await get_overrides(kiosk_id)
    merged = merge_overrides(base, overrides)
    version = device_config_version(merged)

    if request.headers.get("If-None-Match") == version:
        return Response(status_code=304, headers={"ETag": version})

    merged["deviceConfigVersion"] = version
    return Response(
        content=json.dumps(merged),
        media_type="application/json",
        headers={"ETag": version},
    )
