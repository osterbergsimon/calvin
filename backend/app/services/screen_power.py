"""Screen power modes and the screen's power command (calvin-2ifv, calvin-25g9).

Pure helpers for the screen-power route and the kiosk config poll:

- :func:`effective_mode` is the screen's ``screenPower`` (Schedule, Always on or
  External), derived from ``displayScheduleEnabled`` when it was never written.
  :func:`sync_mode_keys` writes the mode and that switch in step.
- :func:`active_command` decides whether a stored command is in force: one
  given in another mode, or a Schedule command whose boundary has passed, is
  absent. It never writes; the route clears the column on the next write.
- :func:`desired_on` is the display agent's own precedence (hold, then "Screen
  now" until the first schedule boundary after it was set, then the schedule),
  ported from ``deploy/kiosk-agent/calvin_display_agent.py`` so the route can say
  what the agent will do. It never claims the panel *is* off: the agent does not
  report that.
- :func:`project_mode` puts the mode into a config response as the screen's
  agent obeys it: ``screenHold``/``screenNow`` for a new agent, and the
  projected ``screenNow`` an older one already follows.
- :class:`ChangeLimiter` caps how often one caller may change screens.
"""

import time as time_module
from collections import deque
from datetime import UTC, datetime, time, timedelta
from typing import Any, Literal, cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ScreenMode = Literal["schedule", "always_on", "external"]

_HOLD_KEYS = ("screen_hold", "screenHold")
_NOW_KEYS = ("screen_now", "screenNow")

# Screen power modes (calvin-25g9): one plain choice per screen.
MODES: tuple[ScreenMode, ...] = ("schedule", "always_on", "external")
_MODE_KEYS = ("screen_power", "screenPower")
_SWITCH_KEYS = ("display_schedule_enabled", "displayScheduleEnabled")

# A command can only be given in a mode that has commands; Always on has none.
COMMAND_MODES: tuple[str, ...] = ("schedule", "external")


def _get(cfg: dict, *keys: str, default: Any = None) -> Any:
    """First non-None value among keys (the agent's ``cfg_get``)."""
    for key in keys:
        if cfg.get(key) is not None:
            return cfg[key]
    return default


def _should_be_on(now_t: time, on_t: time, off_t: time) -> bool:
    if off_t < on_t:
        return now_t >= on_t or now_t < off_t
    return on_t <= now_t < off_t


def mode_value(value: object) -> ScreenMode | None:
    """One of :data:`MODES`, or None for anything else (a stale stored value)."""
    if isinstance(value, str) and value in MODES:
        return cast(ScreenMode, value)
    return None


def derived_mode(cfg: dict) -> ScreenMode:
    """The mode an absent ``screenPower`` means: the schedule switch decides.

    With the schedule on it is ``schedule``; with it off it is ``always_on``,
    which is exactly what every install did before the mode existed.
    """
    enabled = _get(cfg, *_SWITCH_KEYS, default=False)
    return "schedule" if bool(enabled) else "always_on"


def effective_mode(cfg: dict) -> ScreenMode:
    """The screen's ``screenPower``: the stored value, else derived from the switch."""
    return mode_value(_get(cfg, *_MODE_KEYS)) or derived_mode(cfg)


def effective_mode_for(base: dict, layer: dict | None) -> ScreenMode:
    """The screen's mode from its own layer, else from the household config.

    A layer written before the mode existed carries only
    ``displayScheduleEnabled``; it must decide that screen's mode even though
    the merged household config has a ``screenPower`` of its own. The screen's
    explicit mode wins over its switch, and its switch over the household.
    """
    layer = layer or {}
    explicit = mode_value(_get(layer, *_MODE_KEYS))
    if explicit is not None:
        return explicit
    if any(key in layer for key in _SWITCH_KEYS):
        return derived_mode(layer)
    return effective_mode(base)


def set_mode_spellings(cfg: dict, mode: ScreenMode) -> None:
    """Write the mode under both spellings, so no reader can disagree (calvin-25g9).

    The household config stores ``screen_power`` while a merged response can
    carry both; ``effective_mode`` reads the snake first, so a reader that sees
    only the camel spelling would derive a different mode.
    """
    for key in _MODE_KEYS:
        cfg[key] = mode


def sync_mode_keys(layer: dict, *, snake: bool = False) -> dict:
    """Return ``layer`` with ``screenPower`` and the schedule switch in step.

    Only when the write carries one of them. A mode is stored with
    ``displayScheduleEnabled`` true only for ``schedule``, so a restore onto, or
    a downgrade to, an older backend still behaves sensibly (calvin-25g9). When a
    write carries both, the mode wins. The schedule itself is never touched.

    ``snake`` selects the household config's stored spelling
    (``screen_power``/``display_schedule_enabled``); the default is the
    camelCase the API and a screen's override layer use. The other spelling is
    dropped so one setting cannot drift between two keys.
    """
    mode_key = "screen_power" if snake else "screenPower"
    switch_key = "display_schedule_enabled" if snake else "displayScheduleEnabled"
    other_mode = "screenPower" if snake else "screen_power"
    other_switch = "displayScheduleEnabled" if snake else "display_schedule_enabled"
    if not any(key in layer for key in (mode_key, other_mode, switch_key, other_switch)):
        return layer
    mode = mode_value(layer.get(mode_key, layer.get(other_mode))) or derived_mode(layer)
    synced = {key: value for key, value in layer.items() if key not in (other_mode, other_switch)}
    synced[mode_key] = mode
    synced[switch_key] = mode == "schedule"
    return synced


def _parse_instant(value: object) -> datetime | None:
    if not value:
        return None
    try:
        instant = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return instant if instant.tzinfo is not None else instant.replace(tzinfo=UTC)


def _first_boundary_after(cfg: dict, moment: datetime) -> datetime | None:
    if not _get(cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False):
        return None
    schedule = _get(cfg, "display_schedule", "displaySchedule", default=[]) or []
    by_day = {d.get("day"): d for d in schedule if isinstance(d, dict) and d.get("enabled")}
    candidates = []
    for offset in range(0, 9):  # today + 8 days covers any weekly gap
        day = (moment + timedelta(days=offset)).date()
        entry = by_day.get(day.weekday())
        if not entry:
            continue
        for key in ("onTime", "offTime"):
            try:
                hh, mm = map(int, str(entry.get(key)).split(":"))
                at = datetime(day.year, day.month, day.day, hh, mm, tzinfo=moment.tzinfo)
            except (ValueError, AttributeError):
                continue
            if at > moment:
                candidates.append(at)
    return min(candidates) if candidates else None


def held_power(cfg: dict) -> bool | None:
    """True/False from a hold in the config, None when absent or malformed."""
    hold = _get(cfg, *_HOLD_KEYS)
    if not isinstance(hold, dict) or hold.get("power") not in ("on", "off"):
        return None
    return bool(hold["power"] == "on")


def _screen_now_power(cfg: dict, now: datetime) -> bool | None:
    override = _get(cfg, *_NOW_KEYS)
    if not isinstance(override, dict):
        return None
    power = str(override.get("power") or "").lower()
    set_at = _parse_instant(override.get("setAt"))
    if power not in ("on", "off") or set_at is None:
        return None
    expiry = _first_boundary_after(cfg, set_at.astimezone(now.tzinfo))
    if expiry is not None and now >= expiry:
        return None
    return power == "on"


def desired_on(cfg: dict, now: datetime) -> bool:
    """What the display agent will do at ``now`` (an aware datetime)."""
    held = held_power(cfg)
    if held is not None:
        return held
    manual = _screen_now_power(cfg, now)
    if manual is not None:
        return manual
    if not _get(cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False):
        return True
    schedule = _get(cfg, "display_schedule", "displaySchedule", default=[]) or []
    entry = next(
        (d for d in schedule if isinstance(d, dict) and d.get("day") == now.weekday()), None
    )
    if not entry or not entry.get("enabled", False):
        return True
    try:
        oh, om = map(int, str(entry.get("onTime", "06:00")).split(":"))
        fh, fm = map(int, str(entry.get("offTime", "22:00")).split(":"))
        return _should_be_on(now.time(), time(oh, om), time(fh, fm))
    except (ValueError, AttributeError):
        return True


def now_in(cfg: dict) -> datetime:
    """Now in the screen's timezone (config ``timezone``), else the local zone."""
    name = _get(cfg, "timezone")
    if isinstance(name, str) and name:
        try:
            return datetime.now(ZoneInfo(name))
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return datetime.now().astimezone()


def command_until(command: dict | None, cfg: dict, now: datetime) -> datetime | None:
    """The boundary at which a Schedule command ends, or None (design decision 7).

    None in another mode, for no command, and when no boundary comes within the
    next 8 days.
    """
    if not isinstance(command, dict) or command.get("mode") != "schedule":
        return None
    set_at = _parse_instant(command.get("setAt"))
    if set_at is None:
        return None
    return _first_boundary_after(cfg, set_at.astimezone(now.tzinfo))


def active_command(
    command: dict | None,
    cfg: dict,
    now: datetime,
    mode: ScreenMode | None = None,
) -> dict | None:
    """The command in force at ``now``, or None (design decisions 4 and 5).

    A command belongs to the mode it was given in: one whose mode differs from
    the screen's effective mode is absent. A Schedule command is also absent
    once the first schedule boundary after ``setAt`` has passed. Nothing is
    written here: the route clears such a command on its next write, so Settings
    and home automation never show a stale "set by" after the schedule took over.

    ``mode`` is the mode the caller already computed for this screen (the layer
    first, then the household). Passing it matters when a merged config carries
    both spellings; without it the derivation reads the snake one and can
    disagree with the answer (calvin-25g9 review).
    """
    effective = mode or effective_mode(cfg)
    if not isinstance(command, dict) or command.get("mode") != effective:
        return None
    if command.get("mode") == "schedule":
        if _parse_instant(command.get("setAt")) is None:
            return None
        expiry = command_until(command, cfg, now)
        if expiry is not None and now >= expiry:
            return None
    return command


def public_command(command: dict | None) -> dict | None:
    """The command without the API key's name (it is for an admin session only)."""
    if not isinstance(command, dict):
        return None
    return {key: value for key, value in command.items() if key != "keyName"}


def strip_holds(merged: dict) -> None:
    """Drop any hold that did not come from the hold column.

    Only ``kiosks.power_hold`` holds a screen: a ``screenHold`` in a layer, the
    household config or a restored backup must not, or it would hold a screen
    invisibly and ride along in backups.
    """
    for key in _HOLD_KEYS:
        merged.pop(key, None)


def without_screen_now(layer: dict) -> dict:
    """The layer minus any stored ``screenNow``/``screen_now``.

    Settings no longer writes one, and the server strips both from every layer
    write (calvin-25g9). Returns a new dict.
    """
    return {key: value for key, value in layer.items() if key not in _NOW_KEYS}


def agent_view(
    merged: dict,
    agent_holds: bool | None,
    receives_hold: bool | None = None,
) -> dict:
    """The config as this screen's agent obeys it.

    An agent that reported it cannot hold ignores ``screenHold`` and follows the
    projected ``screenNow`` to the next boundary. Unknown (``None``) is taken as
    a new agent: it is what any screen will do once it updates.

    ``receives_hold`` is whether the hold reaches this screen's agent at all: a
    gated, unpaired screen gets none (calvin-0xns), so it follows its schedule
    and ``desiredOn`` says so. It defaults to what ``agent_holds`` implies.
    Returns a copy.
    """
    view = dict(merged)
    if agent_holds is False:
        strip_holds(view)
    if receives_hold is False:
        # A gated, unpaired screen gets no hold at all, not even the projected
        # ``screenNow`` an older agent would otherwise follow (calvin-0xns).
        strip_holds(view)
        for key in _NOW_KEYS:
            view.pop(key, None)
    return view


def _drop_command_keys(payload: dict) -> None:
    for key in (*_NOW_KEYS, *_HOLD_KEYS):
        payload.pop(key, None)


def _set_command_keys(payload: dict, command: dict, *, hold: bool) -> None:
    value = {"power": command["power"], "setAt": command["setAt"]}
    for key in _NOW_KEYS:
        payload[key] = dict(value)
    if hold:
        for key in _HOLD_KEYS:
            payload[key] = dict(value)


def project_mode(merged: dict, mode: str, command: dict | None) -> None:
    """Put the mode into a config response as the screen's agent obeys it.

    Schedule: the schedule switch as stored, and the command as ``screenNow``
    (an older agent follows it to the next boundary). Always on: the switch off
    and no command. External: the switch off, and the command as both
    ``screenNow`` (an older agent, which has no boundary to stop at) and
    ``screenHold`` (a new one). A screen set to External with no command yet is
    on, because the projected switch is off and nothing else switches it.

    Both spellings are written, as the agent reads both. The stored layer and
    the household config never change; ``by`` and the key's name stay out of the
    response.
    """
    if mode == "always_on":
        for key in _SWITCH_KEYS:
            merged[key] = False
        _drop_command_keys(merged)
        return
    if mode == "external":
        for key in _SWITCH_KEYS:
            merged[key] = False
        _drop_command_keys(merged)
        if command is not None:
            _set_command_keys(merged, command, hold=True)
        return
    # Schedule: the switch is exactly what the screen stores.
    _drop_command_keys(merged)
    if command is not None:
        _set_command_keys(merged, command, hold=False)


class ChangeLimiter:
    """At most ``limit`` changes per ``window`` seconds per caller (in memory)."""

    def __init__(self, limit: int = 30, window: float = 60.0) -> None:
        self.limit = limit
        self.window = window
        self._changes: dict[str, deque[float]] = {}

    def _recent(self, caller: str, now: float) -> deque[float]:
        changes = self._changes.setdefault(caller, deque())
        while changes and now - changes[0] >= self.window:
            changes.popleft()
        return changes

    def check(self, caller: str, now: float | None = None) -> int:
        """Seconds to wait before the next change; 0 when one is allowed now."""
        current = time_module.monotonic() if now is None else now
        changes = self._recent(caller, current)
        if len(changes) < self.limit:
            return 0
        return max(1, int(changes[0] + self.window - current + 0.999))

    def record(self, caller: str, now: float | None = None) -> None:
        current = time_module.monotonic() if now is None else now
        self._recent(caller, current).append(current)

    def reset(self) -> None:
        self._changes.clear()


change_limiter = ChangeLimiter()
