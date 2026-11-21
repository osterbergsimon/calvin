"""Registry of known kiosks (per-device settings model — calvin-dd9.2)."""

import hashlib
import json
import re
import sqlite3
import time
from datetime import datetime
from typing import TYPE_CHECKING, Any

from loguru import logger
from sqlalchemy.exc import IntegrityError as SAIntegrityError

from app.models.db_models import KioskDB
from app.schemas.config_update import sanitize_overrides
from app.services import display_check, screen_power
from app.utils.db_retry import retry_on_db_locked
from app.utils.utc import as_utc, utcnow

if TYPE_CHECKING:
    from app.services.kiosk_view import PairingMode

# Shape allowlist for kiosk ids. Covers the default `<hostname>-<6hex>` ids and
# friendly operator-chosen names like `kitchen`. Anything else (whitespace,
# path separators, control chars, URL-encoded junk) is rejected before any DB
# write to bound growth and neutralise garbage/hostile input.
_KIOSK_ID_RE = re.compile(r"[A-Za-z0-9._-]{1,64}")

# Config keys a device-side agent physically applies (rotation, schedule, and
# reserved future backlight/output/mode). Used to compute a cheap per-kiosk
# version so the agent can detect device-physical changes without diffing full
# config. Extend this as dd9.1 follow-ups (brightness/output) land.
DEVICE_PHYSICAL_KEYS: tuple[str, ...] = (
    "orientation",
    "orientationFlipped",
    "applyDisplayRotation",
    "displayScheduleEnabled",
    "displaySchedule",
    "displayBrightness",
    "displayOutput",
    "displayResolution",
)

# Ormar/`databases` surface the raw sqlite3 error on a PK/UNIQUE conflict; other
# backends may raise the SQLAlchemy wrapper. Catch both so the create-race
# fallthrough works regardless of the underlying driver.
_INTEGRITY_ERRORS = (sqlite3.IntegrityError, SAIntegrityError)

# Each kiosk's config is polled about once a minute, and more than one poller
# (the device agent and the kiosk browser) reports the same kiosk id. When a poll
# reports nothing new and the stored last_seen is younger than this, the row is
# not rewritten, which de-duplicates those concurrent pollers. The Screens list
# shows a kiosk online while last_seen is under 120 s old, so a skipped write plus
# one poll gap (30 + 60 s) still reads as online. If a poll is missed, last_seen
# can be up to 150 s old (30 + 60 + 60 s) and the screen briefly reads offline.
LAST_SEEN_WRITE_INTERVAL_S = 30

_UPDATE_FLAG_KEY = (
    "_agentUpdateRequested"  # stored in overrides; host-internal, not a device setting
)


def agent_update_requested(overrides: dict | None) -> bool:
    return bool((overrides or {}).get(_UPDATE_FLAG_KEY))


def public_overrides(overrides: dict | None) -> dict:
    """Return an override layer safe to hand to the UI.

    Host-internal agent keys never belong in a device setting, so they are
    stripped before the layer leaves the server (CLV-36). Values that no longer
    validate are dropped too, so a stale layer cannot break a screen's config
    load (settings-scope §7 item 8). Returns a new dict.
    """
    ov = dict(overrides or {})
    ov.pop(_UPDATE_FLAG_KEY, None)
    return sanitize_overrides(ov)


# The display stacks the kiosk agent can run (deploy/kiosk-agent/calvin_display_agent.py).
# The agent reports one on its config poll so the Screens list can say what a
# kiosk actually runs; an older agent sends nothing and reads as unknown.
DISPLAY_STACKS: tuple[str, ...] = ("x11", "wayland", "cog")


def _normalized_display_stack(stack: str | None) -> str | None:
    """Only a known stack name from the agent is stored; anything else is ignored."""
    if not isinstance(stack, str):
        return None
    value = stack.strip().lower()
    return value if value in DISPLAY_STACKS else None


# What the agent can report about Wi-Fi power saving (calvin-grwq). "on" is the
# unwanted state; "configured" means set off but not verifiable (no iw); "unknown"
# a radio nothing could read; "none" no Wi-Fi (any more), which clears an old state.
WIFI_POWER_SAVE_STATES: tuple[str, ...] = ("on", "off", "configured", "unknown", "none")


def _normalized_wifi_power_save(value: str | None) -> str | None:
    """Only a known state from the agent is stored; anything else is ignored."""
    if not isinstance(value, str):
        return None
    state = value.strip().lower()
    return state if state in WIFI_POWER_SAVE_STATES else None


# Features the display agent can report on its config poll (``kfeat``,
# calvin-2ifv). "hold": it obeys ``screenHold`` until it changes. "pair": it can
# make and send its own pairing secret (calvin-0xns). An agent poll without the
# flag stores "" (cannot hold); never polled since reads as unknown.
HOLD_FEATURE = "hold"
PAIR_FEATURE = "pair"
AGENT_FEATURES: tuple[str, ...] = (HOLD_FEATURE, PAIR_FEATURE)


def _normalized_agent_features(value: str | None) -> str:
    """The known features in ``value`` (comma-separated), sorted; "" for none."""
    if not isinstance(value, str) or len(value) > 255:
        return ""
    found = {part.strip().lower() for part in value.split(",")}
    return ",".join(sorted(found & set(AGENT_FEATURES)))


def agent_holds(agent_features: str | None) -> bool | None:
    """True/False once an agent reported; None when no agent has polled since."""
    if agent_features is None:
        return None
    return HOLD_FEATURE in agent_features.split(",")


def agent_pairs(agent_features: str | None) -> bool | None:
    """True/False once an agent reported it can pair; None when it never polled."""
    if agent_features is None:
        return None
    return PAIR_FEATURE in agent_features.split(",")


# A command is {power, setAt, by, mode[, keyName]}. ``by`` is the kind of
# writer, never a key name: it reaches the public kiosk list. ``keyName`` is
# stored at the time of the command and is only shown to an admin session
# (calvin-25g9).
COMMAND_POWERS: tuple[str, ...] = ("on", "off")
COMMAND_WRITERS: tuple[str, ...] = ("automation", "settings")
COMMAND_MODES: tuple[str, ...] = ("schedule", "external")
_SCREEN_NOW_KEYS = ("screenNow", "screen_now")


def _set_at_text(moment: datetime) -> str:
    """The wire form of a command's time: UTC ISO-8601, seconds, trailing ``Z``."""
    return as_utc(moment).isoformat(timespec="seconds").replace("+00:00", "Z")


def _valid_command(raw: object) -> dict | None:
    """A stored power command in its full shape, or None when absent or malformed.

    A command without a valid mode (a hold written before the mode existed) is
    malformed: it is treated as absent, like an expired one.
    """
    if not isinstance(raw, dict):
        return None
    power, set_at, by, mode = raw.get("power"), raw.get("setAt"), raw.get("by"), raw.get("mode")
    if power not in COMMAND_POWERS or not isinstance(set_at, str) or by not in COMMAND_WRITERS:
        return None
    if mode not in COMMAND_MODES:
        return None
    command = {"power": power, "setAt": set_at, "by": by, "mode": mode}
    key_name = raw.get("keyName")
    if isinstance(key_name, str) and key_name.strip():
        command["keyName"] = key_name.strip()
    return command


# How many addresses are remembered per kiosk, and for how long. A few cover a
# DHCP change or a Wi-Fi/Ethernet switch; the cap stops one caller filling the
# column, and the lifetime keeps a stale lease from naming the wrong kiosk. A
# live kiosk polls every few seconds, so its address is refreshed far inside it.
_MAX_PEER_IPS = 4
PEER_IP_TTL_S = 2 * 3600
_PEER_IP_REFRESH_S = 15 * 60


def _now() -> float:
    return time.time()


def _live_peers(raw: object, now: float) -> dict[str, float]:
    """The stored ``{address: last seen}`` minus anything past its lifetime."""
    if not isinstance(raw, dict):
        return {}
    return {
        ip: float(seen)
        for ip, seen in raw.items()
        if isinstance(ip, str) and isinstance(seen, (int, float)) and now - seen <= PEER_IP_TTL_S
    }


def _with_peer(raw: object, peer_ip: str, now: float) -> dict[str, float] | None:
    """The peer map after seeing ``peer_ip`` now, or ``None`` when nothing needs writing."""
    live = _live_peers(raw, now)
    seen = live.get(peer_ip)
    if seen is not None and now - seen < _PEER_IP_REFRESH_S and live == raw:
        return None
    live[peer_ip] = now
    newest = sorted(live.items(), key=lambda item: item[1])[-_MAX_PEER_IPS:]
    return dict(newest)


async def _pairing_mode() -> "PairingMode":
    """The household mode, read from its own table (never a screen's layer)."""
    from app.services.kiosk_view import pairing_mode

    return await pairing_mode()


def _is_gated(paired: bool, mode: "PairingMode") -> bool:
    from app.services.kiosk_view import is_gated

    return is_gated(paired, mode)


async def kiosk_for_peer(peer_ip: str | None, now: float | None = None) -> str | None:
    """The kiosk whose polls most recently came from this address, if any (calvin-q4o8).

    Used to decide that a sign-in happens AT a kiosk. The address is the TCP
    peer, never ``X-Forwarded-*``, and callers skip it for proxied requests. When
    two kiosks have had the same address (a reused lease) the newer one wins, and
    an address nobody has used for two hours is forgotten.

    On a gated screen only an address its own authenticated poll wrote counts, so
    a poll forged before pairing cannot make the attacker's sign-in kiosk-length
    (calvin-0xns, design §7).
    """
    if not peer_ip:
        return None
    current = _now() if now is None else now
    mode = await _pairing_mode()
    best: tuple[float, str] | None = None
    for row in await KioskDB.objects.all():
        peers = (
            _auth_peers(row.id, current)
            if _is_gated(row.credential_hash is not None, mode)
            else _live_peers(row.peer_ips, current)
        )
        seen = peers.get(peer_ip)
        if seen is not None and (best is None or seen > best[0]):
            best = (seen, row.id)
    return best[1] if best else None


async def kiosk_has_peer(kiosk_id: str, peer_ip: str | None, now: float | None = None) -> bool:
    """True when this kiosk's polls recently came from ``peer_ip``.

    A gated screen only counts addresses its own authenticated polls came from.
    """
    if not peer_ip:
        return False
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    if row is None:
        return False
    current = _now() if now is None else now
    if _is_gated(row.credential_hash is not None, await _pairing_mode()):
        return peer_ip in _auth_peers(kiosk_id, current)
    return peer_ip in _live_peers(row.peer_ips, current)


# Whether the screen's latest browser poll carried a valid kiosk cookie
# (calvin-0xns, design §6). Only polls from an address in the row's ``peer_ips``
# are remembered, and only the agent's own answer reports it. In memory: a
# restart just reads "unknown", which never restarts a browser.
BROWSER_SEEN_TTL_S = 180
browser_seen: dict[str, tuple[float, bool]] = {}

# Addresses whose polls proved they were the screen itself (calvin-0xns, §7:
# "for a gated screen, peer_ips holds only addresses its authenticated polls
# came from"). Written only from an authenticated poll, so an address recorded
# before pairing -- or before required mode was turned on -- stops counting the
# moment the screen is gated, without a row scan or a schema change. In memory,
# like ``browser_seen``: the agent's next authenticated poll (seconds) refills
# it, and an empty map only means "no kiosk-length sign-in here yet".
auth_peer_ips: dict[str, dict[str, float]] = {}

# Whether the screen's latest agent poll carried the screen's own secret
# (calvin-0xns, §7 ``desiredOn``). ``(when, authenticated)``; unknown reads as
# "not authenticated", so a gated screen whose old agent never proves itself is
# reported as following its schedule instead of a hold it never receives.
agent_polls: dict[str, tuple[float, bool]] = {}


def _note_auth_peer(kiosk_id: str, peer_ip: str | None, now: float | None = None) -> None:
    """Remember that ``peer_ip`` polled as this screen, and prune stale peers."""
    if not peer_ip:
        return
    current = _now() if now is None else now
    peers = _live_peers(auth_peer_ips.get(kiosk_id), current)
    peers[peer_ip] = current
    auth_peer_ips[kiosk_id] = dict(sorted(peers.items(), key=lambda item: item[1])[-_MAX_PEER_IPS:])


def _auth_peers(kiosk_id: str, now: float | None = None) -> dict[str, float]:
    return _live_peers(auth_peer_ips.get(kiosk_id), _now() if now is None else now)


def note_agent_poll(kiosk_id: str, authenticated: bool, now: float | None = None) -> None:
    """Remember whether the agent's latest poll proved it was this screen."""
    agent_polls[kiosk_id] = (_now() if now is None else now, bool(authenticated))


def agent_polls_authenticated(kiosk_id: str) -> bool:
    """True when the screen's agent last polled with the screen's own secret."""
    entry = agent_polls.get(kiosk_id)
    return bool(entry and entry[1])


def _forget_view_state(kiosk_id: str) -> None:
    """Drop the in-memory evidence for a screen (pairing, removal)."""
    browser_seen.pop(kiosk_id, None)
    auth_peer_ips.pop(kiosk_id, None)
    agent_polls.pop(kiosk_id, None)


def note_browser_seen(kiosk_id: str, carried_cookie: bool, now: float | None = None) -> None:
    """Remember whether the screen's browser poll carried its own credential."""
    browser_seen[kiosk_id] = (_now() if now is None else now, bool(carried_cookie))


def browser_state(kiosk_id: str, now: float | None = None) -> str:
    """``"paired"``, ``"unpaired"`` or ``"unknown"`` for the screen's browser.

    ``"unknown"`` when no browser poll was accepted in the last
    :data:`BROWSER_SEEN_TTL_S`, and when no browser poll was ever accepted.
    """
    entry = browser_seen.get(kiosk_id)
    if entry is None:
        return "unknown"
    seen, carried_cookie = entry
    if (_now() if now is None else now) - seen > BROWSER_SEEN_TTL_S:
        return "unknown"
    return "paired" if carried_cookie else "unpaired"


async def kiosk_exists(kiosk_id: str) -> bool:
    return await KioskDB.objects.get_or_none(id=kiosk_id) is not None


def valid_kiosk_id(kiosk_id: str | None) -> bool:
    return kiosk_id is not None and _KIOSK_ID_RE.fullmatch(kiosk_id) is not None


def _normalized_viewport(viewport: dict | None) -> dict | None:
    """Accept only a sane ``{w, h}`` pair of positive ints. Anything else is None."""
    if not isinstance(viewport, dict):
        return None
    w, h = viewport.get("w"), viewport.get("h")
    if not isinstance(w, int) or not isinstance(h, int):
        return None
    if w <= 0 or h <= 0 or w > 20000 or h > 20000:
        return None
    return {"w": w, "h": h}


_HEARTBEAT_COLUMNS = [
    "hostname",
    "last_seen",
    "agent_version",
    "agent_update_status",
    "agent_update_message",
    "viewport",
    "display_stack",
    "wifi_power_save",
    "peer_ips",
    "agent_features",
]


@retry_on_db_locked()
async def record_kiosk(
    kiosk_id: str,
    hostname: str | None = None,
    agent_version: str | None = None,
    agent_status: str | None = None,
    agent_message: str | None = None,
    available_version: str | None = None,
    viewport: dict | None = None,
    display_stack: str | None = None,
    wifi_power_save: str | None = None,
    peer_ip: str | None = None,
    agent_features: str | None = None,
    authenticated: bool = False,
) -> None:
    """Upsert a kiosk's registry row. No-op when kiosk_id is empty/None.

    ``agent_features`` is stored only on an agent poll (one with
    ``agent_version``): the kiosk browser's own poll must not erase it.
    ``authenticated`` says the caller proved it was this screen; only such a
    poll makes its address count on a gated screen (calvin-0xns).
    """
    if not kiosk_id:
        return
    if not _KIOSK_ID_RE.fullmatch(kiosk_id):
        logger.warning(f"Ignoring malformed kiosk_id: {kiosk_id!r}")
        return
    if hostname is not None and len(hostname) > 255:
        hostname = hostname[:255]
    # It is free text from the kiosk; the column caps it at 255.
    if agent_message is not None and len(agent_message) > 255:
        agent_message = agent_message[:255]
    viewport = _normalized_viewport(viewport)
    display_stack = _normalized_display_stack(display_stack)
    wifi_power_save = _normalized_wifi_power_save(wifi_power_save)
    features = _normalized_agent_features(agent_features) if agent_version is not None else None

    now = utcnow()
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        try:
            await KioskDB.objects.create(
                id=kiosk_id,
                hostname=hostname,
                last_seen=now,
                agent_version=agent_version,
                agent_update_status=agent_status,
                agent_update_message=agent_message,
                viewport=viewport,
                display_stack=display_stack,
                wifi_power_save=wifi_power_save,
                peer_ips={peer_ip: _now()} if peer_ip else None,
                agent_features=features,
            )
            logger.info(f"Registered new kiosk: {kiosk_id!r} (hostname={hostname!r})")
            if authenticated:
                _note_auth_peer(kiosk_id, peer_ip)
            await _adopt_global_settings()
            return
        except _INTEGRITY_ERRORS:
            # Lost a create race: another request inserted this id between our
            # get_or_none and create. Fall through to the update path.
            logger.debug(
                f"Create race for kiosk {kiosk_id!r} in record_kiosk; updating existing row"
            )
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                # Extremely unlikely (row vanished again); nothing safe to do.
                return

    changed = False
    clear_flag = False
    if hostname and existing.hostname != hostname:
        existing.hostname = hostname
        changed = True
    if agent_version is not None and existing.agent_version != agent_version:
        existing.agent_version = agent_version
        changed = True
    if agent_status is not None and existing.agent_update_status != agent_status:
        existing.agent_update_status = agent_status
        changed = True
    if agent_message is not None and existing.agent_update_message != agent_message:
        existing.agent_update_message = agent_message
        changed = True
    if viewport is not None and existing.viewport != viewport:
        existing.viewport = viewport
        changed = True
    if display_stack is not None and existing.display_stack != display_stack:
        existing.display_stack = display_stack
        changed = True
    if peer_ip:
        peers = _with_peer(existing.peer_ips, peer_ip, _now())
        if peers is not None:
            existing.peer_ips = peers
            changed = True
        if authenticated:
            _note_auth_peer(kiosk_id, peer_ip)
    if wifi_power_save is not None and existing.wifi_power_save != wifi_power_save:
        existing.wifi_power_save = wifi_power_save
        changed = True
    if features is not None and existing.agent_features != features:
        existing.agent_features = features
        changed = True
    # Auto-clear the update flag only once the agent confirms it runs the AVAILABLE
    # (target) version — clearing on any reported version would cancel a just-issued
    # request before the agent ever sees it.
    if (
        agent_version is not None
        and available_version is not None
        and agent_version == available_version
        and existing.overrides
    ):
        ov = dict(existing.overrides)
        if ov.pop(_UPDATE_FLAG_KEY, None) is not None:
            existing.overrides = without_screen_now(ov)
            changed = True
            clear_flag = True
    if (
        not changed
        and existing.last_seen is not None
        and (now - as_utc(existing.last_seen)).total_seconds() < LAST_SEEN_WRITE_INTERVAL_S
    ):
        return
    existing.last_seen = now
    # Never the display-check columns: the kiosk's own poll rewrites its row about
    # every 1.5 s during a check and must not put back a stale copy of the run.
    # The layer only when the update flag was cleared; that write also drops a
    # legacy ``screenNow`` (calvin-25g9).
    columns = [*_HEARTBEAT_COLUMNS, "overrides"] if clear_flag else _HEARTBEAT_COLUMNS
    await existing.update(_columns=columns)


def _to_utc_iso(dt: datetime | None) -> str | None:
    """Serialize a stored last_seen as an explicit-UTC ISO string.

    Values are stored as naive UTC text and the model reads them back aware
    (see :mod:`app.utils.utc`). The ISO string keeps the ``+00:00`` offset so
    a JS client (``Date.parse``) cannot misread a tz-less string as local time
    and show a just-seen kiosk as stale (calvin-dd9.16).
    """
    if dt is None:
        return None
    return as_utc(dt).isoformat()


async def list_kiosks() -> list[dict]:
    """Return known kiosks, newest-seen first, with their public overrides.

    Overrides and viewport ride along so the UI can name a screen, draw its
    start-page thumbnail and preview it without one request per kiosk (CLV-36).
    """
    rows = await KioskDB.objects.order_by("-last_seen").all()
    return [
        {
            "id": row.id,
            "hostname": row.hostname,
            "lastSeen": _to_utc_iso(row.last_seen),
            "lastAppliedVersion": row.last_applied_version,
            "agentVersion": row.agent_version,
            "agentUpdateStatus": row.agent_update_status,
            "agentUpdateMessage": row.agent_update_message,
            "agentUpdateRequested": agent_update_requested(row.overrides),
            "overrides": public_overrides(row.overrides),
            "viewport": _normalized_viewport(row.viewport),
            "displayStack": row.display_stack,
            "wifiPowerSave": None if row.wifi_power_save == "none" else row.wifi_power_save,
            "displayCheck": display_check.findings_view(row.display_check_findings),
            "displayCheckActive": bool(
                (display_check.view_of(row.display_check) or {}).get("active")
            ),
            "powerHold": screen_power.public_command(_valid_command(row.power_hold)),
            "agentHolds": agent_holds(row.agent_features),
            "paired": row.credential_hash is not None,
            "pairedAt": _set_at_text(row.paired_at) if row.paired_at is not None else None,
            "agentPairs": agent_pairs(row.agent_features),
        }
        for row in rows
    ]


# -- the screen's pairing credential (calvin-0xns) --------------------------


async def agent_seen(kiosk_id: str) -> bool:
    """Whether a display agent has ever polled for this screen."""
    if not valid_kiosk_id(kiosk_id):
        return False
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    return row is not None and row.agent_version is not None


async def get_credential_hash(kiosk_id: str) -> str | None:
    """The SHA-256 hex of the screen's active pairing secret, or None."""
    if not valid_kiosk_id(kiosk_id):
        return None
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    return row.credential_hash if row is not None else None


@retry_on_db_locked()
async def create_paired_kiosk(
    kiosk_id: str,
    secret_hash: str,
    hostname: str | None = None,
    now: datetime | None = None,
) -> bool:
    """Pair a screen that has no row yet; False when the id already exists.

    Used by the install-code path, where the code may only ever give someone a
    screen of their own: create-if-absent, never an update. A concurrent
    approval or a second install code that registers the id between the caller's
    check and this insert makes the create fail, so neither pairing is
    overwritten. ``last_seen`` stays the schema's "never polled" value: the row
    is paired, not seen.
    """
    if not valid_kiosk_id(kiosk_id):
        logger.warning(f"Refusing to pair a malformed kiosk_id: {kiosk_id!r}")
        return False
    moment = as_utc(now) if now is not None else utcnow()
    try:
        await KioskDB.objects.create(
            id=kiosk_id,
            hostname=hostname,
            last_seen=None,
            credential_hash=secret_hash,
            paired_at=moment,
        )
    except _INTEGRITY_ERRORS:
        return False
    _forget_view_state(kiosk_id)
    await _adopt_global_settings()
    return True


@retry_on_db_locked()
async def set_credential(
    kiosk_id: str,
    secret_hash: str,
    hostname: str | None = None,
    now: datetime | None = None,
) -> None:
    """Store an approved secret's hash for a screen, creating its row if needed.

    Column-scoped, so a concurrent heartbeat is not overwritten. ``hostname`` is
    used only when the row is created; a poll fills it in afterwards anyway.
    """
    if not valid_kiosk_id(kiosk_id):
        logger.warning(f"Refusing to set a credential for malformed kiosk_id: {kiosk_id!r}")
        return
    moment = as_utc(now) if now is not None else utcnow()
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        try:
            await KioskDB.objects.create(
                id=kiosk_id,
                hostname=hostname,
                last_seen=None,  # approval is not a poll: see create_paired_kiosk
                credential_hash=secret_hash,
                paired_at=moment,
            )
        except _INTEGRITY_ERRORS:
            # Lost a create race; fall through and write the columns only.
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                return
        else:
            _forget_view_state(kiosk_id)
            await _adopt_global_settings()
            return
    existing.credential_hash = secret_hash
    existing.paired_at = moment
    # A screen becomes gated the moment it is paired: anything recorded about
    # its addresses or browser before that no longer counts (calvin-0xns §7).
    existing.peer_ips = {}
    _forget_view_state(kiosk_id)
    await existing.update(_columns=["credential_hash", "paired_at", "peer_ips"])


@retry_on_db_locked()
async def clear_credential(kiosk_id: str) -> bool | None:
    """Unpair a screen: clear its hash and approval time.

    ``None`` for an unknown (or malformed) screen; otherwise whether anything
    changed, so unpairing an unpaired screen is a successful no-op.
    """
    if not valid_kiosk_id(kiosk_id):
        return None
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    if row is None:
        return None
    if row.credential_hash is None and row.paired_at is None:
        return False
    row.credential_hash = None
    row.paired_at = None
    _forget_view_state(kiosk_id)
    await row.update(_columns=["credential_hash", "paired_at"])
    return True


# -- screens the owner removed (calvin-0xns, design §2 and §12) --------------

REMOVED_KIOSK_KEY = "kioskRemoved"
REMOVED_KIOSK_CAP = 50


async def removed_kiosk_ids() -> list[str]:
    """The ids of removed screens, oldest first, at most :data:`REMOVED_KIOSK_CAP`.

    Absent reads as ``[]``; a value that is not a list of strings reads as ``[]``
    (with a warning), and bad entries are dropped. It never raises, because a
    restore must never fail on it and an upgraded server starts with nothing
    removed.
    """
    from app.services.config_service import config_service

    try:
        raw = await config_service.get_value(REMOVED_KIOSK_KEY)
    except Exception as exc:  # noqa: BLE001 - this list must never break a caller
        logger.warning(f"Could not read {REMOVED_KIOSK_KEY}: {exc}")
        return []
    if raw is None:
        return []
    if not isinstance(raw, list):
        logger.warning(f"Ignoring malformed {REMOVED_KIOSK_KEY}: it is not a list of ids")
        return []
    ids: list[str] = []
    dropped = 0
    for entry in raw:
        if not isinstance(entry, str) or not entry:
            dropped += 1
            continue
        if entry not in ids:
            ids.append(entry)
    if dropped:
        logger.warning(f"Ignoring {dropped} malformed entr(y/ies) in {REMOVED_KIOSK_KEY}")
    return ids[-REMOVED_KIOSK_CAP:]


@retry_on_db_locked()
async def note_kiosk_removed(kiosk_id: str) -> list[str]:
    """Record a removed screen's id, oldest first, dropping the oldest over the cap."""
    from app.services.config_service import config_service

    current = await removed_kiosk_ids()
    if not valid_kiosk_id(kiosk_id) or kiosk_id in current:
        return current
    updated = (current + [kiosk_id])[-REMOVED_KIOSK_CAP:]
    await config_service.set_value(REMOVED_KIOSK_KEY, updated, value_type="json")
    return updated


@retry_on_db_locked()
async def forget_kiosk_removed(kiosk_id: str) -> None:
    """A screen the owner added back is no longer called removed."""
    from app.services.config_service import config_service

    current = await removed_kiosk_ids()
    if kiosk_id not in current:
        return
    await config_service.set_value(
        REMOVED_KIOSK_KEY,
        [entry for entry in current if entry != kiosk_id],
        value_type="json",
    )


@retry_on_db_locked()
async def remove_kiosk(kiosk_id: str) -> bool:
    """Delete a kiosk's row and with it everything keyed by it.

    The overrides (calibration, the pending update request) and the display-check
    run and findings are columns of the same row, so one delete clears them all.
    Returns False for an unknown kiosk; raises ``display_check.RunActiveError``
    while a display check is active on it.
    """
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        return False
    # The display-check start path holds this lock, so a run cannot begin between
    # the active check and the delete: the 409 guarantee holds.
    async with display_check._kiosk_lock(kiosk_id):
        row = await KioskDB.objects.get_or_none(id=kiosk_id)
        if row is None:
            return False
        current = display_check.view_of(row.display_check)
        if current and current["active"]:
            raise display_check.RunActiveError(current)
        await row.delete()
    _forget_view_state(kiosk_id)
    logger.info(f"Removed kiosk {kiosk_id!r}")
    return True


@retry_on_db_locked()
async def request_agent_update(kiosk_id: str) -> bool:
    """Flag a kiosk for agent update. False if the kiosk is unknown/malformed."""
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        return False
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        return False
    ov = dict(existing.overrides or {})
    ov[_UPDATE_FLAG_KEY] = True
    existing.overrides = ov
    existing.agent_update_status = "updating"
    await existing.update()
    return True


_CAMEL_BOUNDARY_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


def _spelling_signature(key: str) -> str:
    """Token shared by the snake_case and camelCase spellings of one setting."""
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _alternate_spelling(key: str) -> str:
    """Return the other spelling of a config key (camelCase <-> snake_case)."""
    if "_" in key:
        head, *rest = key.split("_")
        return head + "".join(part[:1].upper() + part[1:] for part in rest if part)
    return _CAMEL_BOUNDARY_RE.sub("_", key).lower()


def merge_overrides(base: dict, overrides: dict | None) -> dict:
    """Shallow top-level merge: each override key replaces that base key wholesale.

    No recursion, no array merge. Returns a new dict; `base` is not mutated.

    Per-screen overrides may arrive in either spelling: the Settings UI writes
    camelCase while the stored household config and the kiosk agent use
    snake_case (the agent reads snake first). An override therefore replaces
    both spellings of its setting, so it wins regardless of which one the
    reader asks for first (CLV-101). Host-internal keys (leading ``_``) are
    exempt.
    """
    if not overrides:
        return dict(base)
    merged = {**base, **overrides}
    for key, value in overrides.items():
        if key.startswith("_"):
            continue
        signature = _spelling_signature(key)
        spellings = [
            existing
            for existing in merged
            if not existing.startswith("_") and _spelling_signature(existing) == signature
        ]
        if len(spellings) < 2:
            twin = _alternate_spelling(key)
            if twin != key and not twin.startswith("_"):
                spellings.append(twin)
        for spelling in spellings:
            merged[spelling] = value
    return merged


def device_config_version(merged: dict) -> str:
    """Stable 16-char hex digest of the device-physical subset of a merged config.

    Same inputs -> same version; any DEVICE_PHYSICAL_KEYS change -> new version;
    non-device-physical changes do not bump it.
    """
    subset = {k: merged.get(k) for k in DEVICE_PHYSICAL_KEYS}
    blob = json.dumps(subset, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


async def get_overrides(kiosk_id: str) -> dict | None:
    """Return a kiosk's raw override layer, or None if the kiosk is unknown.

    Invalid values left in storage are dropped with a warning, so an old or
    hand-edited layer cannot break a config load (settings-scope §7 item 8).
    """
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    if row is None:
        return None
    return sanitize_overrides(row.overrides, kiosk_id=kiosk_id)


_GLOBAL_NAME_KEYS = ("displayName", "display_name")

# The three controls that used to be household-wide now have a per-screen value
# (calvin-hi6w). Each entry is (canonical key written per screen, both global
# spellings read). The canonical keys are the ones the Settings UI writes.
_SCREEN_CONTROL_KEYS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("showUI", ("show_ui", "showUI")),
    ("clockBarShowInKiosk", ("clock_bar_show_in_kiosk", "clockBarShowInKiosk")),
    ("tapAnywhereReveal", ("tap_anywhere_reveal", "tapAnywhereReveal")),
)

# Marks the one-time copy as done, like displaySettingsMigrated (CLV-49). Kept
# in the config so it survives a restart; a restore from an older backup (no
# marker) migrates that backup's screens, while a post-migration backup keeps
# the marker and a screen reset to Default stays on the global fallback.
_SCREEN_CONTROLS_MIGRATED_KEY = "screenControlsMigrated"


def _has_own_control(overrides: dict | None, spellings: tuple[str, ...]) -> bool:
    """True when a screen already carries a value, in either spelling."""
    ov = overrides or {}
    return any(spelling in ov and ov[spelling] is not None for spelling in spellings)


def _has_screen_name(overrides: dict | None) -> bool:
    value = (overrides or {}).get("displayName")
    return isinstance(value, str) and bool(value.strip())


@retry_on_db_locked()
async def migrate_global_room_name() -> None:
    """Copy the retired global room name onto every unnamed screen (CLV-84, CLV-111).

    The room name is per-screen now: a screen's own ``displayName`` override.
    A value left in the global config is copied to each screen that has no name
    of its own; screens that already have one keep it. The global keys are then
    deleted, which makes a second run a no-op. With no screens registered yet
    there is nothing to copy it to, so the old key is kept; it runs again at
    startup and whenever a new screen row is created (see
    :func:`_adopt_global_settings`), so the first screen to register after an
    upgrade still gets the name.
    """
    from app.services.config_service import config_service

    global_name = ""
    for key in _GLOBAL_NAME_KEYS:
        value = await config_service.get_value(key)
        if isinstance(value, str) and value.strip():
            global_name = value.strip()
            break
    if not global_name:
        return

    # Narrow race: two concurrent runs (registration, restore) can both read
    # the global name here and both copy it before either deletes the key.
    # Harmless: each writes the same name onto unnamed screens only, and the
    # second key delete is a no-op.
    rows = await KioskDB.objects.all()
    if not rows:
        logger.info("Kept the global room name until a screen registers")
        return

    for row in rows:
        if _has_screen_name(row.overrides):
            continue
        # Narrow race: a set_overrides landing between the read above and the
        # write below is lost, as this writes back the stale overrides snapshot.
        # The window is one row update during a one-off migration.
        overrides = dict(row.overrides or {})
        overrides["displayName"] = global_name
        row.overrides = overrides
        # Write only this column so a concurrent record_kiosk heartbeat
        # (last_seen, agent_*) is not overwritten by this stale snapshot.
        await row.update(_columns=["overrides"])
        logger.info(f"Copied the global room name onto screen {row.id!r}")

    for key in _GLOBAL_NAME_KEYS:
        await config_service.delete_value(key)
    logger.info("Retired the global room name")


@retry_on_db_locked()
async def migrate_global_screen_controls() -> None:
    """Copy the global show-UI controls onto every screen without one (calvin-hi6w).

    Hiding the controls, keeping the clock bar while hidden and tap-to-reveal
    used to be household settings. They are per-screen now: a screen's own
    value wins, while the global stays as the fallback for a screen that has
    none. This one-time migration takes the current global value and writes it
    onto each screen that has no value of its own, so an existing wall keeps
    behaving as it did. With no screens registered there is nothing to copy it
    to, so the globals stay and the first run with a screen does the copy (see
    :func:`_adopt_global_settings`).

    One-time: after that copy the done marker is stored, so a screen reset to
    Default, a screen registering later or a restore of a post-migration backup
    all use the global fallback instead of being filled in again. A value
    already stored in either spelling counts as the screen's own.
    """
    from app.services.config_service import config_service

    if await config_service.get_value(_SCREEN_CONTROLS_MIGRATED_KEY) is True:
        return

    globals_: dict[str, Any] = {}
    for canonical, spellings in _SCREEN_CONTROL_KEYS:
        for spelling in spellings:
            value = await config_service.get_value(spelling)
            if value is not None:
                globals_[canonical] = value
                break
    if not globals_:
        return

    rows = await KioskDB.objects.all()
    if not rows:
        logger.info("Kept the global screen controls until a screen registers")
        return

    for row in rows:
        overrides = dict(row.overrides or {})
        changed = False
        for canonical, spellings in _SCREEN_CONTROL_KEYS:
            if canonical not in globals_ or _has_own_control(overrides, spellings):
                continue
            overrides[canonical] = globals_[canonical]
            changed = True
        if not changed:
            continue
        row.overrides = overrides
        # Write only this column so a concurrent record_kiosk heartbeat
        # (last_seen, agent_*) is not overwritten by this stale snapshot.
        await row.update(_columns=["overrides"])
        logger.info(f"Copied the global screen controls onto screen {row.id!r}")

    await config_service.set_value(_SCREEN_CONTROLS_MIGRATED_KEY, True)
    logger.info("Retired the one-time per-screen control migration")


async def _adopt_global_settings() -> None:
    """Run the global-to-per-screen migrations after a screen row is created.

    Best effort: a failure is logged and never fails the registration; the
    global keys stay, so the next new screen or restart retries them.
    """
    try:
        await migrate_global_room_name()
    except Exception as exc:  # noqa: BLE001 - registration must not fail on this
        logger.warning(f"Could not copy the global room name to a new screen: {exc}")
    try:
        await migrate_global_screen_controls()
    except Exception as exc:  # noqa: BLE001 - registration must not fail on this
        logger.warning(f"Could not copy the global screen controls to a new screen: {exc}")


# The photo frame used to be one global setting. It is per screen now
# (calvin-3xz9). Each entry is (canonical key written per screen, both global
# spellings read); the canonical keys are the ones the Settings UI writes.
_PHOTO_FRAME_KEYS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("photoFrameEnabled", ("photo_frame_enabled", "photoFrameEnabled")),
    ("photoFrameTimeout", ("photo_frame_timeout", "photoFrameTimeout")),
)

# Marks the one-time copy as done, like screenControlsMigrated (calvin-hi6w).
# Kept in the config so a restart, a screen reset to Default, a screen
# registering later and a restore of a post-migration backup all leave the
# screen on the global fallback instead of being filled in again.
PHOTO_FRAME_MIGRATED_KEY = "photoFrameMigrated"


@retry_on_db_locked()
async def migrate_global_photo_frame() -> None:
    """Copy the retired global photo frame onto every screen without one (calvin-3xz9).

    The global ``photo_frame_enabled``/``photo_frame_timeout`` become each
    screen's own override where it has none; a screen that already chose keeps
    its value. The global keys are kept (not deleted): a browser that is not a
    known screen, and a screen that registers later, still reads them as the
    fallback.

    One-time: after the copy the done marker is stored, so a screen reset to
    Default, a screen registering later or a restore of a post-migration backup
    all use the global fallback instead of being filled in again. With no
    screens registered the marker is still stored: there is nothing to copy,
    and later screens are served by the global fallback.
    """
    from app.services.config_service import config_service

    if await config_service.get_value(PHOTO_FRAME_MIGRATED_KEY) is True:
        return

    globals_: dict[str, Any] = {}
    for canonical, spellings in _PHOTO_FRAME_KEYS:
        for spelling in spellings:
            value = await config_service.get_value(spelling)
            if value is not None:
                globals_[canonical] = value
                break
    if not globals_:
        # Nothing to copy, but this run still completes the one-time migration.
        # A startup unit test may call this before the config table exists; the
        # next real startup will set it.
        try:
            await config_service.set_value(PHOTO_FRAME_MIGRATED_KEY, True)
            logger.info("No global photo frame to copy; marked the migration done")
        except Exception as exc:  # noqa: BLE001 - no config table yet
            logger.warning(f"Could not mark the photo-frame migration done: {exc}")
        return

    rows = await KioskDB.objects.all()
    for row in rows:
        overrides = dict(row.overrides or {})
        changed = False
        for canonical, spellings in _PHOTO_FRAME_KEYS:
            if canonical not in globals_ or _has_own_control(overrides, spellings):
                continue
            overrides[canonical] = globals_[canonical]
            changed = True
        if not changed:
            continue
        row.overrides = overrides
        # Write only this column so a concurrent record_kiosk heartbeat
        # (last_seen, agent_*) is not overwritten by this stale snapshot.
        await row.update(_columns=["overrides"])
        logger.info(f"Copied the global photo frame onto screen {row.id!r}")

    await config_service.set_value(PHOTO_FRAME_MIGRATED_KEY, True)
    logger.info("Retired the one-time per-screen photo-frame migration")


@retry_on_db_locked()
async def set_overrides(kiosk_id: str, overrides: dict) -> None:
    """Upsert the kiosk row and replace its overrides. No-op on malformed id.

    Every layer write drops ``screenNow`` (calvin-25g9): the screen's command
    lives in its own column and reaches an agent through the projection.
    """
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        logger.warning(f"Refusing to set overrides for malformed kiosk_id: {kiosk_id!r}")
        return
    overrides = without_screen_now(overrides)
    now = utcnow()
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        try:
            await KioskDB.objects.create(id=kiosk_id, last_seen=now, overrides=overrides)
            await _adopt_global_settings()
            return
        except _INTEGRITY_ERRORS:
            # Lost a create race: another request inserted this id between our
            # get_or_none and create. Fall through to the update path.
            logger.debug(
                f"Create race for kiosk {kiosk_id!r} in set_overrides; updating existing row"
            )
            existing = await KioskDB.objects.get_or_none(id=kiosk_id)
            if existing is None:
                # Extremely unlikely (row vanished again); nothing safe to do.
                return
    existing.overrides = overrides
    # Only this column: a stale whole-row write would put back an old display-check run.
    await existing.update(_columns=["overrides"])


@retry_on_db_locked()
async def merge_into_overrides(kiosk_id: str, partial: dict) -> dict | None:
    """Merge ``partial`` into a known kiosk's override layer and return it.

    Additive only: keys already in the layer survive and nothing is removed, so
    a partial write can never wipe a screen's settings. ``None`` means the
    kiosk is unknown (or its id is malformed); callers answer 404 rather than
    creating a row from a partial write.
    """
    if not kiosk_id or not _KIOSK_ID_RE.fullmatch(kiosk_id):
        return None
    existing = await KioskDB.objects.get_or_none(id=kiosk_id)
    if existing is None:
        return None
    merged = dict(existing.overrides or {})
    merged.update(partial)
    merged = without_screen_now(merged)
    if merged != (existing.overrides or {}):
        existing.overrides = merged
        # Only this column: a concurrent heartbeat (last_seen, agent_*) must not
        # be overwritten by this snapshot.
        await existing.update(_columns=["overrides"])
    return merged


# -- the screen's power command (calvin-2ifv, calvin-25g9) -------------------


def without_screen_now(overrides: dict) -> dict:
    """The layer minus any stored ``screenNow``/``screen_now`` (calvin-25g9)."""
    return {key: value for key, value in overrides.items() if key not in _SCREEN_NOW_KEYS}


def _without_screen_now(overrides: dict | None) -> dict | None:
    """The layer minus any ``screenNow``; None when nothing needed removing."""
    layer = dict(overrides or {})
    if not any(key in layer for key in _SCREEN_NOW_KEYS):
        return None
    return without_screen_now(layer)


async def get_power_command(kiosk_id: str) -> dict | None:
    """The screen's stored command, or None (none, malformed or unknown)."""
    if not valid_kiosk_id(kiosk_id):
        return None
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    return _valid_command(row.power_hold) if row is not None else None


async def power_status(kiosk_id: str) -> dict | None:
    """What the screen-power route needs about a known screen, or None.

    ``{"command", "paired", "lastSeen", "agentHolds", "overrides"}``; the command
    keeps its ``keyName`` for the admin-only answer, and ``overrides`` is the raw
    (sanitized) layer.
    """
    if not valid_kiosk_id(kiosk_id):
        return None
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    if row is None:
        return None
    return {
        "command": _valid_command(row.power_hold),
        "paired": row.credential_hash is not None,
        "lastSeen": as_utc(row.last_seen) if row.last_seen is not None else None,
        "agentHolds": agent_holds(row.agent_features),
        "overrides": sanitize_overrides(row.overrides, kiosk_id=kiosk_id),
    }


@retry_on_db_locked()
async def set_power_command(
    kiosk_id: str,
    power: str,
    by: str,
    mode: str,
    key_name: str | None = None,
    now: datetime | None = None,
) -> dict | None:
    """Store the screen's command in the mode it was given in; None if unknown.

    Also drops any legacy ``screenNow`` from the layer (calvin-25g9), so only the
    command column ever switches a screen. Only these two columns are written.
    """
    if power not in COMMAND_POWERS or by not in COMMAND_WRITERS or mode not in COMMAND_MODES:
        raise ValueError("power must be on/off, by automation/settings, mode schedule/external")
    if not valid_kiosk_id(kiosk_id):
        return None
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    if row is None:
        return None
    moment = as_utc(now) if now is not None else utcnow()
    command = {
        "power": power,
        "setAt": _set_at_text(moment),
        "by": by,
        "mode": mode,
    }
    if isinstance(key_name, str) and key_name.strip():
        command["keyName"] = key_name.strip()
    row.power_hold = command
    columns = ["power_hold"]
    layer = _without_screen_now(row.overrides)
    if layer is not None:
        row.overrides = layer
        columns.append("overrides")
    await row.update(_columns=columns)
    return command


@retry_on_db_locked()
async def clear_power_command(kiosk_id: str) -> bool | None:
    """Back to the schedule: clear the command and any legacy ``screenNow``.

    Returns whether anything changed; None for an unknown screen.
    """
    if not valid_kiosk_id(kiosk_id):
        return None
    row = await KioskDB.objects.get_or_none(id=kiosk_id)
    if row is None:
        return None
    layer = _without_screen_now(row.overrides)
    columns = []
    if _valid_command(row.power_hold) is not None:
        row.power_hold = None
        columns.append("power_hold")
    if layer is not None:
        row.overrides = layer
        columns.append("overrides")
    if columns:
        await row.update(_columns=columns)
    return bool(columns)


@retry_on_db_locked()
async def migrate_strip_screen_now() -> int:
    """Drop a stored ``screenNow`` from every screen's layer once (calvin-25g9).

    Settings used to write one into the layer; the command column replaced it,
    so a value that is still stored would be projected and could switch a
    screen invisibly. Idempotent: rows without the keys are not written, so
    running it again (startup, then a restore) changes nothing. Returns how many
    rows it changed.
    """
    changed = 0
    for row in await KioskDB.objects.all():
        layer = _without_screen_now(row.overrides)
        if layer is None:
            continue
        row.overrides = layer
        await row.update(_columns=["overrides"])
        changed += 1
    if changed:
        logger.info(f"Dropped a stored Screen now from {changed} screen(s)")
    return changed


@retry_on_db_locked()
async def clear_commands_for_mode_change(old_cfg: dict, new_cfg: dict) -> int:
    """Clear a command on every screen whose effective mode this write changed.

    Decision 5: changing the mode ends the command, so leaving and re-entering
    External cannot bring an old off back. A screen with its own mode keys keeps
    its mode (and its command); the others follow the household and lose the
    command when the household mode moved. Schedule and the layer spellings are
    read exactly as :func:`screen_power.effective_mode_for` reads them.
    Returns how many commands it cleared.
    """
    cleared = 0
    for row in await KioskDB.objects.all():
        layer = sanitize_overrides(row.overrides, kiosk_id=row.id)
        before = screen_power.effective_mode_for(old_cfg, layer)
        after = screen_power.effective_mode_for(new_cfg, layer)
        if before == after or _valid_command(row.power_hold) is None:
            continue
        row.power_hold = None
        await row.update(_columns=["power_hold"])
        cleared += 1
    if cleared:
        logger.info(f"Cleared a screen power command on {cleared} screen(s) after a mode change")
    return cleared


@retry_on_db_locked()
async def clear_mode_mismatched_commands(household: dict) -> int:
    """Clear stored commands that the screen's effective mode no longer allows.

    The restore counterpart of the write-time clear: a backup does not carry
    the command column, so a pre-restore command can belong to a mode the
    restored config no longer has. Dropping it keeps it from reviving when the
    mode later returns. Returns how many it cleared.
    """
    cleared = 0
    for row in await KioskDB.objects.all():
        command = _valid_command(row.power_hold)
        if command is None:
            continue
        layer = sanitize_overrides(row.overrides, kiosk_id=row.id)
        if command["mode"] == screen_power.effective_mode_for(household, layer):
            continue
        row.power_hold = None
        await row.update(_columns=["power_hold"])
        cleared += 1
    if cleared:
        logger.info(f"Cleared {cleared} stored screen power command(s) after a restore")
    return cleared


@retry_on_db_locked()
async def migrate_drop_invalid_modes() -> int:
    """Drop a stored mode that is not one of the three, and warn (calvin-25g9).

    A backup can carry anything. Removing the value falls back to the mode
    derived from ``displayScheduleEnabled`` instead of breaking the config, and
    the warning names what was dropped. Idempotent. Returns how many values it
    dropped across the household config and every layer.
    """
    from app.services.config_service import config_service

    dropped = 0
    for key in ("screen_power", "screenPower"):
        value = await config_service.get_value(key)
        if value is None or screen_power.mode_value(value) is not None:
            continue
        logger.warning(
            f"Dropping invalid household screen power {value!r}; deriving it from the schedule"
        )
        await config_service.delete_value(key)
        dropped += 1
    for row in await KioskDB.objects.all():
        layer = dict(row.overrides or {})
        changed = False
        for key in ("screen_power", "screenPower"):
            value = layer.get(key)
            if value is None or screen_power.mode_value(value) is not None:
                continue
            logger.warning(f"Dropping invalid screen power {value!r} on screen {row.id!r}")
            del layer[key]
            changed = True
        if changed:
            row.overrides = layer
            await row.update(_columns=["overrides"])
            dropped += 1
    return dropped
