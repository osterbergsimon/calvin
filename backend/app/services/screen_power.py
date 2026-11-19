"""Screen power held from home automation or Settings (calvin-2ifv).

Pure helpers for the screen-power route and the kiosk config poll:

- :func:`desired_on` is the display agent's own precedence (hold, then "Screen
  now" until the first schedule boundary after it was set, then the schedule),
  ported from ``deploy/kiosk-agent/calvin_display_agent.py`` so the route can say
  what the agent will do. It never claims the panel *is* off: the agent does not
  report that.
- :func:`project_hold` puts a hold into a config response: ``screenHold`` for an
  agent that can hold, and ``screenNow`` so an older agent still obeys it until
  the next scheduled change.
- :func:`drop_superseded_screen_now` keeps a stale Settings page from sending an
  old manual choice back after a power change replaced it (calvin-ldeu).
- :class:`ChangeLimiter` caps how often one caller may change screens.
"""

import time as time_module
from collections import deque
from datetime import UTC, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_HOLD_KEYS = ("screen_hold", "screenHold")
_NOW_KEYS = ("screen_now", "screenNow")


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


def _screen_now_is_fresh(value: object, changed_at: datetime) -> bool:
    """True when this ``screenNow`` was set strictly after ``changed_at``."""
    if not isinstance(value, dict):
        return False
    set_at = _parse_instant(value.get("setAt"))
    return set_at is not None and set_at > changed_at


def drop_superseded_screen_now(layer: dict, changed_at: datetime | None) -> dict:
    """The layer minus any ``screenNow`` that a screen-power change superseded.

    A manual "Screen now" is set at a moment (``setAt``), and a hold set or
    cleared later replaced it: both remove ``screenNow`` from the layer. A page
    that did not see that change still carries the old choice and sends it back
    with any save, so only a ``screenNow`` strictly newer than the change is a
    person's fresh choice (calvin-ldeu). ``None`` means no change is known and
    nothing is dropped. Returns a new dict.
    """
    if changed_at is None:
        return layer
    kept = dict(layer)
    for key in _NOW_KEYS:
        if key in kept and not _screen_now_is_fresh(kept[key], changed_at):
            kept.pop(key)
    return kept


def strip_holds(merged: dict) -> None:
    """Drop any hold that did not come from the hold column.

    Only ``kiosks.power_hold`` holds a screen: a ``screenHold`` in a layer, the
    household config or a restored backup must not, or it would hold a screen
    invisibly and ride along in backups.
    """
    for key in _HOLD_KEYS:
        merged.pop(key, None)


def agent_view(merged: dict, agent_holds: bool | None) -> dict:
    """The config as this screen's agent obeys it.

    An agent that reported it cannot hold ignores ``screenHold`` and follows the
    projected ``screenNow`` to the next boundary. Unknown (``None``) is taken as
    a new agent: it is what any screen will do once it updates. Returns a copy.
    """
    view = dict(merged)
    if agent_holds is False:
        strip_holds(view)
    return view


def project_hold(merged: dict, hold: dict | None) -> None:
    """Put a hold into a config response (both spellings, as the agent reads both).

    The stored override layer never changes; ``by`` stays out of the response.
    """
    if hold is None:
        return
    value = {"power": hold["power"], "setAt": hold["setAt"]}
    for key in (*_HOLD_KEYS, *_NOW_KEYS):
        merged[key] = dict(value)


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
