#!/usr/bin/env python3
"""Calvin display-power agent for remote-backend (Mode B) kiosks.

Reads the display schedule from a remote Calvin backend and powers the local
panel on/off to match. Mirrors backend display_power_service semantics. Pure
Python 3 stdlib — no third-party deps (the kiosk Pi has no venv).
"""
import json
import os
import subprocess
import sys
import time as time_module
import urllib.request
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
    """Power the panel on/off using BOTH vcgencmd and xset (belt-and-suspenders:
    vcgencmd is a no-op under some KMS drivers, xset needs DPMS). Returns a
    '+'-joined list of the methods that appeared to work, or 'none'."""
    val = "1" if on else "0"
    methods = []
    try:
        r = subprocess.run(
            ["vcgencmd", "display_power", val],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0 and f"display_power={val}" in r.stdout:
            methods.append("vcgencmd")
    except (FileNotFoundError, subprocess.SubprocessError):
        pass
    env = dict(os.environ, DISPLAY=":0", XAUTHORITY="/home/calvin/.Xauthority")
    action = "on" if on else "off"
    try:
        r = subprocess.run(
            ["xset", "dpms", "force", action],
            env=env, capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            methods.append("xset")
    except (FileNotFoundError, subprocess.SubprocessError):
        pass
    return "+".join(methods) if methods else "none"


DEFAULT_REFRESH_SECONDS = 900
HTTP_TIMEOUT = 10
BACKOFF_SECONDS = 60


def log(msg):
    print(f"[calvin-display-agent] {msg}", flush=True)


def fetch_config(backend_url):
    url = backend_url.rstrip("/") + "/api/config"
    with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT) as r:
        return json.load(r)


def now_in(cfg):
    tzname = cfg_get(cfg, "timezone")
    if tzname and ZoneInfo:
        try:
            return datetime.now(ZoneInfo(tzname))
        except Exception:
            pass
    return datetime.now()


def run(backend_url, refresh_seconds, *, fetch=fetch_config, sleep=time_module.sleep, iterations=None):
    last = None
    n = 0
    while iterations is None or n < iterations:
        n += 1
        try:
            cfg = fetch(backend_url)
            if not isinstance(cfg, dict):
                raise TypeError(f"expected dict config, got {type(cfg).__name__}")
            now = now_in(cfg)
            prev = last
            last = reconcile(cfg, now, last)
            if prev != last:
                log(f"display -> {'ON' if last else 'OFF'}")
            secs = seconds_to_next_boundary(cfg, now)
            delay = refresh_seconds if secs is None else max(1, min(secs, refresh_seconds))
        except Exception as e:
            log(f"iteration failed ({e}); keeping display state")
            sleep(BACKOFF_SECONDS)
            continue
        sleep(delay)


def main():
    backend = os.environ.get("CALVIN_BACKEND_URL", "").strip()
    if not backend:
        log("CALVIN_BACKEND_URL not set")
        sys.exit(1)
    refresh = int(os.environ.get("CALVIN_DISPLAY_REFRESH_SECONDS", DEFAULT_REFRESH_SECONDS))
    log(f"starting: backend={backend} refresh={refresh}s")
    run(backend, refresh)


def reconcile(cfg, now, last, applier=None):
    """Apply desired state only when it changed (or on first run). Return new state."""
    on = desired_on(cfg, now)
    if applier is None:
        applier = apply_on
    if last is None or on != last:
        applier(on)
    return on


if __name__ == "__main__":
    main()
