#!/usr/bin/env python3
"""Calvin display-power agent for remote-backend (Mode B) kiosks.

Reads the display schedule from a remote Calvin backend and powers the local
panel on/off to match. Mirrors backend display_power_service semantics. Pure
Python 3 stdlib — no third-party deps (the kiosk Pi has no venv).
"""
import os
import subprocess
from datetime import datetime, time, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - py<3.9
    ZoneInfo = None


def cfg_get(cfg, *keys, default=None):
    """First non-None value among keys (snake_case preferred, camelCase fallback)."""
    for k in keys:
        if k in cfg and cfg[k] is not None:
            return cfg[k]
    return default


def _should_be_on(now_t, on_t, off_t):
    """Mirror of backend _should_display_be_on (handles midnight-spanning)."""
    if off_t < on_t:
        return now_t >= on_t or now_t < off_t
    return on_t <= now_t < off_t


def desired_on(cfg, now):
    """Return True if the display should be ON at `now` (a datetime)."""
    if not cfg_get(cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False):
        return True
    schedule = cfg_get(cfg, "display_schedule", "displaySchedule", default=[]) or []
    entry = next((d for d in schedule if d.get("day") == now.weekday()), None)
    if not entry or not entry.get("enabled", False):
        return True
    try:
        oh, om = map(int, str(entry.get("onTime", "06:00")).split(":"))
        fh, fm = map(int, str(entry.get("offTime", "22:00")).split(":"))
    except (ValueError, AttributeError):
        return True
    return _should_be_on(now.time(), time(oh, om), time(fh, fm))


def seconds_to_next_boundary(cfg, now):
    """Seconds until the next on/off transition, or None if no boundaries exist."""
    if not cfg_get(cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False):
        return None
    schedule = cfg_get(cfg, "display_schedule", "displaySchedule", default=[]) or []
    by_day = {d.get("day"): d for d in schedule if d.get("enabled", False)}
    candidates = []
    for offset in range(0, 9):  # today + 8 days covers any weekly gap
        d = (now + timedelta(days=offset)).date()
        entry = by_day.get(d.weekday())
        if not entry:
            continue
        for key in ("onTime", "offTime"):
            try:
                hh, mm = map(int, str(entry.get(key)).split(":"))
            except (ValueError, AttributeError):
                continue
            dt = datetime(d.year, d.month, d.day, hh, mm, tzinfo=now.tzinfo)
            if dt > now:
                candidates.append(dt)
    if not candidates:
        return None
    return int((min(candidates) - now).total_seconds())


def apply_on(on):
    """Power the panel on/off. Returns the method that appeared to work."""
    val = "1" if on else "0"
    try:
        r = subprocess.run(
            ["vcgencmd", "display_power", val],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0 and f"display_power={val}" in r.stdout:
            return "vcgencmd"
    except (FileNotFoundError, subprocess.SubprocessError):
        pass
    env = dict(os.environ, DISPLAY=":0", XAUTHORITY="/home/calvin/.Xauthority")
    action = "on" if on else "off"
    try:
        subprocess.run(
            ["xset", "dpms", "force", action],
            env=env, capture_output=True, text=True, timeout=10,
        )
        return "xset"
    except (FileNotFoundError, subprocess.SubprocessError) as e:
        return f"none ({e})"


def reconcile(cfg, now, last, applier=None):
    """Apply desired state only when it changed (or on first run). Return new state."""
    on = desired_on(cfg, now)
    if applier is None:
        applier = apply_on
    if last is None or on != last:
        applier(on)
    return on
