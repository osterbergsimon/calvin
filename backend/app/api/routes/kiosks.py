"""Kiosk registry + per-kiosk config endpoints (per-device settings — dd9.2/dd9.3)."""

import hashlib
import json

from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel, ValidationError

from app.api.routes.config import ConfigUpdate, build_global_config
from app.security.route_policy import KIOSK_SELF_WRITE_KEYS, is_admin
from app.services import display_check, kiosk_bundle, kiosk_registry
from app.services.kiosk_registry import (
    _KIOSK_ID_RE,
    agent_update_requested,
    device_config_version,
    get_overrides,
    merge_into_overrides,
    merge_overrides,
    public_overrides,
    set_overrides,
)
from app.utils.errors import internal_error
from app.utils.public_url import public_base_url

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
    _check_floor_under_limit(body.overrides)
    _checked_overrides(body.overrides)
    await set_overrides(kiosk_id, body.overrides)
    return {"id": kiosk_id, "overrides": body.overrides}


def _check_floor_under_limit(layer: dict) -> None:
    """422 when the layer's ``brightnessFloor`` is above its ``brightnessLimit``."""

    def pick(*keys):
        for key in keys:
            value = layer.get(key)
            if isinstance(value, int) and not isinstance(value, bool):
                return value
        return None

    floor = pick("brightnessFloor", "brightness_floor")
    limit = pick("brightnessLimit", "brightness_limit")
    if floor is not None and limit is not None and floor > limit:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "floor_above_limit",
                "message": f"The lowest level ({floor}) cannot be above the limit ({limit}).",
            },
        )


def _checked_overrides(overrides: dict) -> None:
    """Refuse an oversized or wrongly typed layer before anything is written."""
    if len(json.dumps(overrides)) > _MAX_OVERRIDES_BYTES:
        raise HTTPException(status_code=400, detail="Overrides payload too large")
    # Type-check declared config keys via the shared update schema. Unknown keys
    # are still allowed (plugin and future settings), but a declared key with a
    # bad value is a 400 here instead of a stored value that breaks the screen.
    try:
        ConfigUpdate(**overrides)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Invalid overrides") from exc


@router.patch("/kiosks/{kiosk_id}/overrides")
async def patch_kiosk_overrides(kiosk_id: str, body: OverridesBody, request: Request):
    """Merge keys into a kiosk's override layer (a screen's own write, F2).

    Additive and partial: keys already in the layer stay, nothing is removed.
    Without an admin session only :data:`KIOSK_SELF_WRITE_KEYS` may be written,
    so the dashboard's ⋯ Hide controls toggle works on a kiosk that was never
    signed in. Any other key is a 403 for that caller.
    """
    _valid_id_or_400(kiosk_id)
    if not is_admin(request):
        refused = sorted(set(body.overrides) - KIOSK_SELF_WRITE_KEYS)
        if refused:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "override_needs_admin",
                    "message": (
                        f"Changing {', '.join(refused)} on a screen needs an admin "
                        "sign-in. This screen can only change its own controls."
                    ),
                },
            )
    stored = await get_overrides(kiosk_id)
    if stored is not None:
        _check_floor_under_limit({**stored, **body.overrides})
    _checked_overrides(body.overrides)
    merged = await merge_into_overrides(kiosk_id, body.overrides)
    if merged is None:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return {"id": kiosk_id, "overrides": merged}


@router.post("/kiosks/{kiosk_id}/update")
async def post_kiosk_update(kiosk_id: str):
    """Flag a kiosk to self-update its agent on the next poll. 404 if unknown."""
    _valid_id_or_400(kiosk_id)
    ok = await kiosk_registry.request_agent_update(kiosk_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return {"id": kiosk_id, "requested": True}


async def _screen_settings(kiosk_id: str) -> dict:
    """What the ceiling needs from the screen's merged settings."""
    overrides = await get_overrides(kiosk_id)
    merged = merge_overrides(await build_global_config(), overrides or {})
    return _settings_of(merged)


def _settings_of(merged: dict) -> dict:
    def pick(*keys):
        for key in keys:
            if key in merged:
                return merged[key]
        return None

    return {
        "limit": pick("brightnessLimit", "brightness_limit"),
        "step": pick("brightnessStep", "brightness_step"),
        "conversion": pick("brightnessConversion", "brightness_conversion"),
    }


async def _ceilinged(kiosk_id: str, view: dict | None) -> dict | None:
    if view is None:
        return None
    return display_check.with_ceiling(view, await _screen_settings(kiosk_id))


@router.get("/kiosks/{kiosk_id}/display-check")
async def get_display_check(kiosk_id: str):
    """The latest display-check run for a kiosk (expiry applied), or ``null``."""
    _valid_id_or_400(kiosk_id)
    if await get_overrides(kiosk_id) is None:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return {
        "run": await _ceilinged(kiosk_id, await display_check.get_run_view(kiosk_id)),
        "findings": await display_check.get_findings(kiosk_id),
    }


async def _check_value_under_limit(
    kiosk_id: str, body: display_check.StartRequest | display_check.StepRequest
) -> None:
    """Refuse a target above ``limit - 2 * step``: the agent's conversion step does
    not apply the limit itself, so 100 on a limited screen would ramp past it."""
    if body.value is None:
        return
    overrides = await get_overrides(kiosk_id)
    if overrides is None:
        return  # unknown kiosk: start_run answers 404
    merged = merge_overrides(await build_global_config(), overrides)
    saved = merged.get("brightnessLimit", merged.get("brightness_limit"))
    if not isinstance(saved, int) or isinstance(saved, bool):
        return
    limit = saved
    step = merged.get("brightnessStep", merged.get("brightness_step"))
    step = step if isinstance(step, int) and not isinstance(step, bool) else 2
    top = max(0, limit - 2 * min(max(step, 1), 5))
    if body.value > top:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "value_above_limit",
                "message": f"This screen's limit allows at most {top}.",
                "max": top,
            },
        )


async def _check_value_under_ceiling(kiosk_id: str, body: display_check.StepRequest) -> None:
    """Refuse a ``conversion`` target above the active run's ceiling (calvin-c805).

    ``start`` begins a new run, so it has no ceiling yet and the previous run is
    never consulted; only ``step`` is checked.
    """
    if body.step != "conversion" or body.value is None:
        return
    run = await display_check.get_run_view(kiosk_id)
    if not run or not run["active"]:
        return  # change_step answers 404
    top = display_check.allowed_max(run, await _screen_settings(kiosk_id), body.value)
    if top is not None and body.value > top:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "value_above_ceiling",
                "message": f"This check may not go above {top}.",
                "max": top,
            },
        )


@router.post("/kiosks/{kiosk_id}/display-check/start")
async def start_display_check(kiosk_id: str, body: display_check.StartRequest):
    """Ask a kiosk's agent to run a display-check step (admin). One active run per kiosk."""
    _valid_id_or_400(kiosk_id)
    await _check_value_under_limit(kiosk_id, body)
    try:
        return await _ceilinged(kiosk_id, await display_check.start_run(kiosk_id, body))
    except display_check.UnknownKioskError:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    except display_check.RunActiveError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "display_check_active",
                "message": "A display check is already running on this screen.",
                "run": exc.run,
            },
        )


@router.post("/kiosks/{kiosk_id}/display-check/step")
async def change_display_check_step(kiosk_id: str, body: display_check.StepRequest):
    """Move the active run to another step/value (admin); the job is re-offered."""
    _valid_id_or_400(kiosk_id)
    await _check_value_under_limit(kiosk_id, body)
    await _check_value_under_ceiling(kiosk_id, body)
    try:
        return await _ceilinged(kiosk_id, await display_check.change_step(kiosk_id, body))
    except (display_check.UnknownKioskError, display_check.NoActiveRunError):
        raise HTTPException(status_code=404, detail="No display check is running")
    except display_check.StoppingError:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "display_check_stopping",
                "message": "The display check is stopping; start a new one when it has ended.",
            },
        )


@router.post("/kiosks/{kiosk_id}/display-check/stop")
async def stop_display_check(kiosk_id: str):
    """Ask the agent to end the active run safely (admin)."""
    _valid_id_or_400(kiosk_id)
    try:
        return await _ceilinged(kiosk_id, await display_check.stop_run(kiosk_id))
    except (display_check.UnknownKioskError, display_check.NoActiveRunError):
        raise HTTPException(status_code=404, detail="No display check is running")


@router.post("/kiosks/{kiosk_id}/display-check/save-limit")
async def save_display_check_limit(kiosk_id: str):
    """Save the limit the latest calibration fault implies as ``brightnessLimit`` (admin)."""
    _valid_id_or_400(kiosk_id)
    try:
        # A calibration fault implies a limit (calvin-c805).
        limit = await display_check.fault_limit_for_save(
            kiosk_id, display_check._settings(await _screen_settings(kiosk_id))[1]
        )
    except display_check.UnknownKioskError:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    except display_check.NoLimitError:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "no_limit",
                "message": "The latest display check did not find a limit.",
            },
        )
    overrides = await merge_into_overrides(kiosk_id, {"brightnessLimit": limit})
    if overrides is None:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    logger.info(f"Saved brightness limit {limit} for kiosk {kiosk_id!r}")
    return {"id": kiosk_id, "brightnessLimit": limit, "overrides": public_overrides(overrides)}


@router.post("/kiosks/{kiosk_id}/display-check/menu-at-start")
async def post_display_check_menu_at_start(kiosk_id: str, body: display_check.MenuAtStartRequest):
    """The Brightness the screen's own menu showed before the check began (admin)."""
    _valid_id_or_400(kiosk_id)
    try:
        run = await display_check.set_menu_at_start(kiosk_id, body.menu)
    except (display_check.UnknownKioskError, display_check.NoActiveRunError):
        raise HTTPException(status_code=404, detail="No display check is running")
    return await _ceilinged(kiosk_id, run)


@router.post("/kiosks/{kiosk_id}/display-check/verdict")
async def post_display_check_verdict(kiosk_id: str, body: display_check.VerdictRequest):
    """The owner's answer to "did the screen change?" (admin). Returns the findings."""
    _valid_id_or_400(kiosk_id)
    try:
        return await display_check.set_writes_verdict(kiosk_id, body.writes)
    except display_check.UnknownKioskError:
        raise HTTPException(status_code=404, detail="Unknown kiosk")


@router.post("/kiosks/{kiosk_id}/display-check")
async def post_display_check_report(kiosk_id: str, body: display_check.AgentReport):
    """The display agent's report on a run. Dropped unless it names the stored run."""
    _valid_id_or_400(kiosk_id)
    try:
        await display_check.record_report(kiosk_id, body)
    except (
        display_check.UnknownKioskError,
        display_check.UnknownRunError,
        display_check.RunEndedError,
    ):
        raise HTTPException(status_code=409, detail="Not the current display check")
    return {"accepted": True}


@router.get("/kiosks/agent/manifest")
async def get_agent_manifest():
    """Serve the signed kiosk bundle manifest (version + per-file hashes + HMAC signature)."""
    try:
        return kiosk_bundle.build_signed_manifest()
    except OSError as exc:
        # Broken/incomplete server checkout (missing bundle file): degrade like the
        # config poll does instead of a 500 stack (calvin-exe).
        raise internal_error(
            "kiosk_bundle_unavailable",
            "The kiosk bundle is unavailable on this server.",
            status_code=503,
            error=exc,
        ) from exc


@router.get("/kiosks/agent/files/{name}")
async def get_agent_file(name: str):
    """Serve one allowlisted bundle file's raw bytes. 404 for anything else."""
    try:
        data = kiosk_bundle.read_bundle_file(name)
    except (KeyError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Unknown bundle file")
    return Response(content=data, media_type="application/octet-stream")


@router.get("/kiosks/install.sh")
async def get_install_script(request: Request):
    """One-command kiosk installer with this server's URL baked in.

    Usage on a fresh Pi: ``curl -fsSL http://<server>:8000/api/kiosks/install.sh | sudo bash``
    """
    try:
        script = kiosk_bundle.render_install_script(public_base_url(request))
    except OSError as exc:
        raise internal_error(
            "kiosk_installer_unavailable",
            "The kiosk installer is unavailable on this server.",
            status_code=503,
            error=exc,
        ) from exc
    return Response(content=script, media_type="text/x-shellscript")


@router.get("/kiosks/installer/{name}")
async def get_installer_file(name: str):
    """Serve one allowlisted setup script for the installer. 404 for anything else."""
    try:
        data = kiosk_bundle.read_installer_file(name)
    except (KeyError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Unknown installer file")
    return Response(content=data, media_type="text/x-shellscript")


@router.get("/kiosks/{kiosk_id}/config")
async def get_kiosk_config(
    kiosk_id: str,
    request: Request,
    khost: str | None = None,
    kagent: str | None = None,
    kstat: str | None = None,
    kmsg: str | None = None,
    kstack: str | None = None,
    vw: int | None = None,
    vh: int | None = None,
):
    """Return a kiosk's effective (merged) config; records the kiosk + its agent report.

    ``vw``/``vh`` are the kiosk's CSS viewport (``window.innerWidth/innerHeight``,
    reported at load and on resize) so the layout editor can preview a screen at
    its real aspect ratio (CLV-36).
    """
    _valid_id_or_400(kiosk_id)
    # Compute available version BEFORE record_kiosk so we can pass it in,
    # enabling auto-clear of the update flag when agent_version == available_version.
    # Falls back to None when bundle files are unavailable (e.g. dev without Pi deploy tree).
    # None is safe: the auto-clear guard requires both versions non-None before comparing.
    try:
        available = kiosk_bundle.bundle_version()
    except Exception:
        available = None
    try:
        await kiosk_registry.record_kiosk(
            kiosk_id,
            hostname=khost,
            agent_version=kagent,
            agent_status=kstat,
            agent_message=kmsg,
            available_version=available,
            viewport={"w": vw, "h": vh} if vw is not None and vh is not None else None,
            display_stack=kstack,
        )
    except Exception as exc:
        logger.warning(f"Failed to record kiosk {kiosk_id!r}: {exc}")

    base = await build_global_config()
    overrides = await get_overrides(kiosk_id)
    merged = merge_overrides(base, overrides)
    merged.pop("_agentUpdateRequested", None)  # never expose the host-internal flag verbatim
    version = device_config_version(merged)
    update_requested = agent_update_requested(overrides)

    merged["deviceConfigVersion"] = version
    merged["agentAvailableVersion"] = available
    merged["agentUpdateRequested"] = update_requested
    job = display_check.job_for_config(await display_check.get_run(kiosk_id), _settings_of(merged))
    if job is not None:
        # Both spellings, like every other key the agent reads (snake_case first).
        merged["displayCheck"] = job
        merged["display_check"] = job
    content = json.dumps(merged)

    # The ETag must cover the whole body, not just deviceConfigVersion: a
    # browser kiosk revalidates with If-None-Match, and a 304 for a changed
    # non-device setting (focus light, theme, ...) leaves it rendering its
    # cached old config (calvin-fufd). The display agent reads
    # deviceConfigVersion from the body and does not use the ETag.
    etag = hashlib.sha256(content.encode("utf-8")).hexdigest()[:32]
    if request.headers.get("If-None-Match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return Response(content=content, media_type="application/json", headers={"ETag": etag})
