"""Kiosk registry + per-kiosk config endpoints (per-device settings — dd9.2/dd9.3)."""

import hashlib
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel, ValidationError

from app.api.routes.config import ConfigUpdate, build_global_config
from app.security import kiosk_auth
from app.security.admin_auth import get_admin_store, lock_kiosk_sessions
from app.security.route_policy import (
    KIOSK_SELF_WRITE_KEYS,
    admin_error,
    direct_peer_ip,
    is_admin,
    is_loopback_peer,
    permission_routes,
    request_api_key,
)
from app.services import display_check, kiosk_bundle, kiosk_registry, kiosk_view, screen_power
from app.services.kiosk_pairing import pairing_store
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
from app.utils.utc import utcnow

router = APIRouter()

_MAX_OVERRIDES_BYTES = 64 * 1024


def _valid_id_or_400(kiosk_id: str) -> None:
    if not _KIOSK_ID_RE.fullmatch(kiosk_id):
        raise HTTPException(status_code=400, detail="Invalid kiosk id")


class OverridesBody(BaseModel):
    overrides: dict


@router.get("/kiosks")
async def get_kiosks(request: Request, response: Response):
    """List known kiosks (id, hostname, last-seen, lastAppliedVersion).

    A gated row's presence fields (``powerHold``, ``displayCheckActive`` and the
    layer's ``screenNow``) go only to an admin or to that screen itself; the
    list has no kiosk id in its path, so only the screen's cookie unlocks its
    own row and a bearer unlocks none (calvin-0xns).
    """
    mode = await kiosk_view.pairing_mode()
    admin = is_admin(request)
    cookie_id = await kiosk_auth.kiosk_cookie_id(request)
    rows = await kiosk_registry.list_kiosks()
    for row in rows:
        visible = kiosk_view.can_see_presence(
            admin=admin,
            principal=cookie_id,
            kiosk_id=row["id"],
            paired=row["paired"],
            mode=mode,
        )
        if not visible:
            kiosk_view.strip_list_row(row)
            row["presenceHidden"] = True
    response.headers["Cache-Control"] = "private, no-cache"
    response.headers["Vary"] = "Cookie, Authorization"
    return {"kiosks": rows}


@router.get("/kiosks/{kiosk_id}/overrides")
async def get_kiosk_overrides(kiosk_id: str, request: Request):
    """Return a kiosk's raw override layer (not merged). 404 if kiosk unknown."""
    _valid_id_or_400(kiosk_id)
    overrides = await get_overrides(kiosk_id)
    if overrides is None:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    visible = await _can_see_this_screen_presence(request, kiosk_id)
    if not visible:
        kiosk_view.strip_layer_presence(overrides)
        return {"id": kiosk_id, "overrides": overrides, "presenceHidden": True}
    return {"id": kiosk_id, "overrides": overrides}


async def _can_see_this_screen_presence(request: Request, kiosk_id: str) -> bool:
    """Presence rules for a route whose kiosk id is in the path."""
    return kiosk_view.can_see_presence(
        admin=is_admin(request),
        principal=await kiosk_auth.kiosk_principal(request),
        kiosk_id=kiosk_id,
        paired=await kiosk_registry.get_credential_hash(kiosk_id) is not None,
        mode=await kiosk_view.pairing_mode(),
    )


@router.put("/kiosks/{kiosk_id}/overrides")
async def put_kiosk_overrides(kiosk_id: str, body: OverridesBody):
    """Replace a kiosk's override layer (upsert). Validated + size-capped."""
    _valid_id_or_400(kiosk_id)
    _check_floor_under_limit(merge_overrides(await build_global_config(), body.overrides))
    _checked_overrides(body.overrides)
    layer = await _without_superseded_screen_now(kiosk_id, body.overrides)
    await set_overrides(kiosk_id, layer)
    return {"id": kiosk_id, "overrides": layer}


async def _without_superseded_screen_now(kiosk_id: str, layer: dict) -> dict:
    """No layer write may bring back a screen choice a power change replaced.

    A hold replaces the manual choice, and ending one does too: both remove
    ``screenNow`` from the layer. A Settings page opened before the change still
    carries the old choice and sends it with any save, and its kiosk-list
    refresh can miss a hold that was set and cleared between two polls, so
    "while held" alone is not enough (calvin-2ifv review, calvin-ldeu). The
    server keeps the time of the last power change, so a ``screenNow`` set after
    it -- a person's own fresh choice -- is kept.
    """
    hold, changed_at = await kiosk_registry.power_state(kiosk_id)
    if hold is not None:
        # The hold wins while it lasts; it is projected on the next poll.
        return kiosk_registry.without_screen_now(layer)
    return screen_power.drop_superseded_screen_now(layer, changed_at)


@router.delete("/kiosks/{kiosk_id}")
async def delete_kiosk(kiosk_id: str):
    """Remove a screen and everything stored for it (admin).

    Deletes the registry row with its overrides, calibration, pending update
    request and display-check state. 404 for an unknown kiosk; 409 while a
    display check is active on it.

    Removal does not block the device: a kiosk that is still running registers
    again on its next real poll (one that sends its hostname or agent version),
    so remove only screens that have been decommissioned.
    """
    _valid_id_or_400(kiosk_id)
    try:
        removed = await kiosk_registry.remove_kiosk(kiosk_id)
    except display_check.RunActiveError:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "display_check_active",
                "message": "A display check is running on this screen. Stop it first.",
            },
        )
    if not removed:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    # A removed screen's pending pairings die with its row (calvin-0xns).
    pairing_store.drop_kiosk(kiosk_id)
    return {"id": kiosk_id, "removed": True}


def _check_floor_under_limit(layer: dict) -> None:
    """422 when the EFFECTIVE (household + override) floor is above the limit."""

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
        layer = {**stored, **body.overrides}
        _check_floor_under_limit(merge_overrides(await build_global_config(), layer))
    _checked_overrides(body.overrides)
    partial = await _without_superseded_screen_now(kiosk_id, body.overrides)
    merged = await merge_into_overrides(kiosk_id, partial)
    if merged is None:
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return {"id": kiosk_id, "overrides": merged}


# -- screen power held from home automation (calvin-2ifv) -------------------

# The Screens list counts a kiosk online while it polled in the last 120 s.
_ONLINE_S = 120


class ScreenPowerBody(BaseModel):
    power: Literal["on", "off", "schedule"]


class ScreenPowerView(BaseModel):
    id: str
    power: Literal["on", "off", "schedule"]
    held: bool
    setAt: str | None  # noqa: N815 - wire name
    by: Literal["automation", "settings"] | None
    desiredOn: bool  # noqa: N815 - what the agent will do, not what the panel reports
    online: bool
    agentHolds: bool | None  # noqa: N815 - False: this screen's agent is too old to hold
    paired: bool


async def _power_status_or_404(kiosk_id: str) -> dict:
    _valid_id_or_400(kiosk_id)
    status = await kiosk_registry.power_status(kiosk_id)
    if status is None:
        # Never create a row from this route: a bare id must not register a ghost.
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    return status


async def _screen_power_view(kiosk_id: str, status: dict) -> ScreenPowerView:
    hold = status["hold"]
    merged = merge_overrides(await build_global_config(), status["overrides"])
    screen_power.strip_holds(merged)
    screen_power.project_hold(merged, hold)
    # A gated screen that is not paired receives no hold (calvin-0xns), not even
    # the projected screenNow: its agent follows the schedule, and desiredOn
    # says what the agent will do. Paired screens keep the projection.
    receives_hold = None
    if (
        kiosk_view.is_gated(status["paired"], await kiosk_view.pairing_mode())
        and not status["paired"]
    ):
        receives_hold = False
    agent_cfg = screen_power.agent_view(merged, status["agentHolds"], receives_hold)
    last_seen = status["lastSeen"]
    return ScreenPowerView(
        id=kiosk_id,
        power=hold["power"] if hold else "schedule",
        held=hold is not None,
        setAt=hold["setAt"] if hold else None,
        by=hold["by"] if hold else None,
        desiredOn=screen_power.desired_on(agent_cfg, screen_power.now_in(agent_cfg)),
        online=last_seen is not None and (utcnow() - last_seen).total_seconds() < _ONLINE_S,
        agentHolds=status["agentHolds"],
        paired=status["paired"],
    )


async def _may_read_screen_power(request: Request, kiosk_id: str) -> None:
    """Who may read a gated screen's power: admin, ``screens.power``, itself.

    The route is public by default, so this is the handler-level gate. A plain
    read key gets ``insufficient_scope`` (it is for dashboard scripts, not
    presence) and an anonymous caller gets the usual ``admin_required``
    (calvin-0xns, design §7).
    """
    if is_admin(request):
        return
    key = request_api_key(request)
    if key is not None:
        route_id = ("GET", "/api/kiosks/{kiosk_id}/screen-power")
        if route_id in permission_routes(key):
            return
        raise HTTPException(
            status_code=403,
            detail={
                "code": "insufficient_scope",
                "message": "This API key can't do that. It needs the screens.power scope.",
            },
        )
    if await kiosk_auth.kiosk_principal(request) == kiosk_id:
        return
    raise admin_error(get_admin_store().is_configured())


@router.get("/kiosks/{kiosk_id}/screen-power", response_model=ScreenPowerView)
async def get_screen_power(kiosk_id: str, request: Request):
    """A screen's power: held on or off, or following its schedule."""
    status = await _power_status_or_404(kiosk_id)
    if kiosk_view.is_gated(status["paired"], await kiosk_view.pairing_mode()):
        await _may_read_screen_power(request, kiosk_id)
    return await _screen_power_view(kiosk_id, status)


@router.put("/kiosks/{kiosk_id}/screen-power", response_model=ScreenPowerView)
async def put_screen_power(kiosk_id: str, body: ScreenPowerBody, request: Request):
    """Hold a screen on or off until changed, or send it back to its schedule.

    Open to an admin session, an admin key, and a limited key with the
    ``screens.power`` permission (``PERMISSION_ROUTES``). A request that changes
    nothing writes nothing and does not count toward the change limit.
    """
    status = await _power_status_or_404(kiosk_id)
    hold = status["hold"]
    if body.power == "schedule":
        changes = hold is not None or any(
            key in status["overrides"] for key in ("screenNow", "screen_now")
        )
    else:
        changes = hold is None or hold["power"] != body.power
    if not changes:
        return await _screen_power_view(kiosk_id, status)

    key = request_api_key(request)
    caller = f"key:{key['id']}" if key is not None else "session"
    wait = screen_power.change_limiter.check(caller)
    if wait:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": f"Too many changes. Try again in {wait} seconds.",
                "retry_after": wait,
            },
            headers={"Retry-After": str(wait)},
        )
    if body.power == "schedule":
        await kiosk_registry.clear_power_hold(kiosk_id)
    else:
        by = "automation" if key is not None else "settings"
        await kiosk_registry.set_power_hold(kiosk_id, body.power, by)
    screen_power.change_limiter.record(caller)
    # The key's name only: never its secret (the log patcher also redacts keys).
    who = f"API key {key['name']!r}" if key is not None else "an admin session"
    logger.info(f"Screen {kiosk_id!r} power set to {body.power} by {who}")
    return await _screen_power_view(kiosk_id, await _power_status_or_404(kiosk_id))


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
    """Refuse a target above the limit (the ceiling): the agent's conversion step does
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
    top = max(0, saved)
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


class StopBody(BaseModel):
    # True when this calibration's Save landed before the stop (Done, or close).
    saved: bool = False
    # The run this stop is for (calvin-hn1e). Omitted by older callers: then the
    # active run is stopped. A different id is ignored.
    runId: str | None = None  # noqa: N815 - wire name, like the other display-check bodies


@router.post("/kiosks/{kiosk_id}/display-check/stop")
async def stop_display_check(kiosk_id: str, body: StopBody | None = None):
    """Ask the agent to end the active run safely (admin)."""
    _valid_id_or_400(kiosk_id)
    try:
        saved = bool(body and body.saved)
        return await _ceilinged(
            kiosk_id,
            await display_check.stop_run(kiosk_id, saved, body.runId if body else None),
        )
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
    update: dict = {"brightnessLimit": limit}
    stored = await get_overrides(kiosk_id) or {}
    floor = stored.get("brightnessFloor", stored.get("brightness_floor"))
    if isinstance(floor, int) and not isinstance(floor, bool) and floor > limit:
        update["brightnessFloor"] = limit  # the floor never sits above the limit
    overrides = await merge_into_overrides(kiosk_id, update)
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
async def post_display_check_report(
    kiosk_id: str, body: display_check.AgentReport, request: Request
):
    """The display agent's report on a run. Dropped unless it names the stored run."""
    _valid_id_or_400(kiosk_id)
    # On a gated screen the run id is public, so the screen's own secret is
    # what protects the report (calvin-0xns, design §8).
    await kiosk_auth.require_screen_itself(request, kiosk_id)
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
        script = kiosk_bundle.render_install_script(
            public_base_url(request), pair_code=request.query_params.get("pair")
        )
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


@router.post("/kiosks/{kiosk_id}/screen-sleep")
async def kiosk_screen_sleep(kiosk_id: str, request: Request):
    """The screen went to sleep: end this kiosk's admin sessions (calvin-q4o8).

    Called by the display agent. It carries no credential, but it is only accepted
    from an address that kiosk's own polls came from, so someone else on the network
    cannot sign a kiosk out. It can only sign a kiosk out, never in.
    """
    _valid_id_or_400(kiosk_id)
    if not await kiosk_registry.kiosk_exists(kiosk_id):
        raise HTTPException(status_code=404, detail="Unknown kiosk")
    gated = kiosk_view.is_gated(
        await kiosk_registry.get_credential_hash(kiosk_id) is not None,
        await kiosk_view.pairing_mode(),
    )
    # Every KIOSK_ROUTES handler asks the shared gate; it passes on an ungated
    # screen, which then keeps today's peer check (calvin-0xns).
    await kiosk_auth.require_screen_itself(request, kiosk_id)
    if not gated and not await kiosk_registry.kiosk_has_peer(kiosk_id, direct_peer_ip(request)):
        raise HTTPException(status_code=403, detail="Only the kiosk itself can report this")
    lock_kiosk_sessions(kiosk_id)
    logger.info(f"Kiosk {kiosk_id!r} screen asleep: its admin sessions ended")
    return {"ok": True}


@router.post("/screen-sleep")
async def local_screen_sleep(request: Request):
    """The all-in-one kiosk's screen went to sleep: end its admin sessions.

    The all-in-one display has no kiosk id; its sign-ins are id-less kiosk
    sessions, and its agent runs on this machine, so only a direct loopback caller
    is accepted. It can only sign a screen out.
    """
    if not is_loopback_peer(request):
        raise HTTPException(status_code=403, detail="Only this machine can report this")
    lock_kiosk_sessions(None)
    logger.info("Local screen asleep: its admin sessions ended")
    return {"ok": True}


@router.get("/kiosks/{kiosk_id}/config")
async def get_kiosk_config(
    kiosk_id: str,
    request: Request,
    khost: str | None = None,
    kagent: str | None = None,
    kstat: str | None = None,
    kmsg: str | None = None,
    kstack: str | None = None,
    kwifi: str | None = None,
    kfeat: str | None = None,
    vw: int | None = None,
    vh: int | None = None,
):
    """Return a kiosk's effective (merged) config; records the kiosk + its agent report.

    ``vw``/``vh`` are the kiosk's CSS viewport (``window.innerWidth/innerHeight``,
    reported at load and on resize) so the layout editor can preview a screen at
    its real aspect ratio (CLV-36). ``kfeat`` is what the display agent
    understands, comma-separated (``hold``: it obeys ``screenHold``).

    A held screen power (calvin-2ifv) is projected as ``screenHold`` and as
    ``screenNow``, so an agent too old to hold still obeys it until the next
    scheduled change. The stored layer is not changed.

    Only a real poll is recorded (registers a new kiosk and bumps last-seen): one
    that carries ``khost`` (the kiosk browser) or ``kagent`` (the display agent).
    A bare fetch (curl, a typo'd id, the Settings UI reading a screen) gets the
    config but changes nothing, so it can neither create a ghost nor make a dead
    screen look online (calvin-7aqu).
    """
    _valid_id_or_400(kiosk_id)
    principal = await kiosk_auth.kiosk_principal(request)
    admin = is_admin(request)
    paired = await kiosk_registry.get_credential_hash(kiosk_id) is not None
    mode = await kiosk_view.pairing_mode()
    gated = kiosk_view.is_gated(paired, mode)
    sees_presence = kiosk_view.can_see_presence(
        admin=admin,
        principal=principal,
        kiosk_id=kiosk_id,
        paired=paired,
        mode=mode,
    )
    # Compute available version BEFORE record_kiosk so we can pass it in,
    # enabling auto-clear of the update flag when agent_version == available_version.
    # Falls back to None when bundle files are unavailable (e.g. dev without Pi deploy tree).
    # None is safe: the auto-clear guard requires both versions non-None before comparing.
    try:
        available = kiosk_bundle.bundle_version()
    except Exception:
        available = None
    try:
        # A gated screen only writes its row when the caller is that screen
        # itself (calvin-0xns); a forged poll writes nothing, not even peer_ips.
        if (khost or kagent) and (not gated or principal == kiosk_id):
            await kiosk_registry.record_kiosk(
                kiosk_id,
                hostname=khost,
                agent_version=kagent,
                agent_status=kstat,
                agent_message=kmsg,
                available_version=available,
                viewport={"w": vw, "h": vh} if vw is not None and vh is not None else None,
                display_stack=kstack,
                wifi_power_save=kwifi,
                peer_ip=direct_peer_ip(request),
                agent_features=kfeat,
            )
    except Exception as exc:
        logger.warning(f"Failed to record kiosk {kiosk_id!r}: {exc}")

    # Whether the screen's own browser still has its cookie (calvin-0xns): only
    # a browser poll from one of the screen's recorded addresses counts, so a
    # forged poll cannot make the agent restart the browser.
    if khost and not kagent:
        if await kiosk_registry.kiosk_has_peer(kiosk_id, direct_peer_ip(request)):
            kiosk_registry.note_browser_seen(kiosk_id, principal == kiosk_id)

    base = await build_global_config()
    overrides = await get_overrides(kiosk_id)
    merged = merge_overrides(base, overrides)
    merged.pop("_agentUpdateRequested", None)  # never expose the host-internal flag verbatim
    screen_power.strip_holds(merged)  # only the hold column holds a screen
    screen_power.project_hold(merged, await kiosk_registry.get_power_hold(kiosk_id))
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

    # Presence is projected first and then stripped (calvin-0xns): the
    # projection stays as it is, only who receives it changed.
    if not sees_presence:
        kiosk_view.strip_presence(merged)
        merged["presenceHidden"] = True

    auth: dict = {
        "state": "paired" if principal == kiosk_id else "unpaired",
        "mode": mode,
        "hasAgent": await kiosk_registry.agent_seen(kiosk_id)
        or pairing_store.has_agent_pending(kiosk_id),
    }
    if principal == kiosk_id:
        # Only the screen itself may know whether its browser still has the cookie.
        auth["browser"] = kiosk_registry.browser_state(kiosk_id)
    merged["kioskAuth"] = auth

    content = json.dumps(merged)

    # The ETag must cover the whole body, not just deviceConfigVersion: a
    # browser kiosk revalidates with If-None-Match, and a 304 for a changed
    # non-device setting (focus light, theme, ...) leaves it rendering its
    # cached old config (calvin-fufd). The display agent reads
    # deviceConfigVersion from the body and does not use the ETag.
    etag = hashlib.sha256(content.encode("utf-8")).hexdigest()[:32]
    headers = {
        "ETag": etag,
        # The answer differs by credential, so it must never be cached by a
        # shared cache, while the ETag still works per caller (calvin-0xns).
        "Cache-Control": "private, no-cache",
        "Vary": "Cookie, Authorization",
    }
    if request.headers.get("If-None-Match") == etag:
        response = Response(status_code=304, headers=headers)
    else:
        response = Response(content=content, media_type="application/json", headers=headers)
    # A cookie older than 30 days is re-signed on the config read (Part A review).
    kiosk_auth.renew_kiosk_cookie(request, response)
    return response
