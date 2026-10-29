#!/usr/bin/env python3
"""Calvin display-power agent for remote-backend (Mode B) kiosks.

Reads the display schedule from a remote Calvin backend and powers the local
panel on/off to match. Mirrors backend display_power_service semantics. Pure
Python 3 stdlib — no third-party deps (the kiosk Pi has no venv).
"""

import json
import os
import re
import socket
import subprocess
import sys
import time as time_module
import urllib.parse
import urllib.request
from datetime import datetime, time, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - py<3.9
    ZoneInfo = None


MIN_PYTHON = (3, 9)
STATE_DIR = "/var/lib/calvin"
READY_MARKER = "/run/calvin/agent-ready"


def check_python():
    if sys.version_info[:2] < MIN_PYTHON:
        got = ".".join(map(str, sys.version_info[:3]))
        need = ".".join(map(str, MIN_PYTHON))
        log(f"python {got} is below the required {need}; refusing to start")
        sys.exit(1)


def running_version(state_dir=STATE_DIR):
    """Return the applied bundle version from the state file, or None."""
    try:
        with open(os.path.join(state_dir, "agent-version.json")) as f:
            return json.load(f).get("version")
    except (OSError, ValueError):
        return None


def touch_ready(marker=READY_MARKER):
    """Signal 'this agent booted and reached the backend' for the updater health check."""
    try:
        os.makedirs(os.path.dirname(marker), exist_ok=True)
        with open(marker, "w") as f:
            f.write("ok")
    except OSError:
        pass


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
    if not cfg_get(
        cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False
    ):
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
    if not cfg_get(
        cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False
    ):
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


def apply_on(on, env=None):
    """Power the panel on/off the way this kiosk's display stack does.

    X11 uses BOTH vcgencmd and xset (belt-and-suspenders: vcgencmd is a no-op under
    some KMS drivers, xset needs DPMS). Wayland has neither: wlopm speaks
    wlr-output-power-management, and wlr-randr --on is the wake fallback.
    Returns a '+'-joined list of the methods that appeared to work, or 'none'."""
    if display_stack(env) == "wayland":
        return apply_on_wayland(on, env)
    val = "1" if on else "0"
    methods = []
    try:
        r = subprocess.run(
            ["vcgencmd", "display_power", val],
            capture_output=True,
            text=True,
            timeout=10,
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
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode == 0:
            methods.append("xset")
    except (FileNotFoundError, subprocess.SubprocessError):
        pass
    return "+".join(methods) if methods else "none"


DEFAULT_REFRESH_SECONDS = 900
HTTP_TIMEOUT = 10
BACKOFF_SECONDS = 60

_UNSET = object()  # sentinel: distinguishes "never polled" from version=None

UPDATE_UNIT = "calvin-kiosk-update.service"


def log(msg):
    print(f"[calvin-display-agent] {msg}", flush=True)


def _fire_updater():
    """Kick the root oneshot updater; returns without waiting (it restarts us)."""
    try:
        subprocess.run(
            ["sudo", "-n", "systemctl", "start", "--no-block", UPDATE_UNIT],
            capture_output=True, text=True, timeout=10,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as e:
        log(f"could not trigger updater ({e})")


def last_failed_version(state_dir=STATE_DIR):
    """Version the updater last recorded as errored, or None. Durable no-retry signal."""
    try:
        with open(os.path.join(state_dir, "agent-update-state.json")) as f:
            st = json.load(f)
    except (OSError, ValueError):
        return None
    status = st.get("status") or ""
    return st.get("version") if status.startswith("error") else None


def maybe_update(cfg, *, trigger=_fire_updater, state=None, state_dir=STATE_DIR):
    """Trigger a self-update when the server requested one and we're stale.

    `state["attempted"]` is a set of versions already tried this process, so a
    failed/rolled-back version is not retried in a loop within one process lifetime.
    `last_failed_version` provides a durable guard across restarts: if the updater
    recorded an error for the available version, skip it even after a fresh start.
    """
    if state is None or not cfg_get(cfg, "agentUpdateRequested", default=False):
        return False
    available = cfg_get(cfg, "agentAvailableVersion")
    if not available or available == running_version(state_dir):
        return False
    if available in state["attempted"]:
        return False
    if available == last_failed_version(state_dir):
        return False
    state["attempted"].add(available)
    log(f"update requested: {running_version(state_dir)} -> {available}; triggering updater")
    trigger()
    return True


def _config_url(backend_url, kiosk_id, host, kagent=None, kstat=None):
    """Effective-config URL: per-kiosk endpoint when a kiosk id is set, else global."""
    base = backend_url.rstrip("/")
    if kiosk_id:
        params = {}
        if host:
            params["khost"] = host
        if kagent:
            params["kagent"] = kagent
        if kstat:
            params["kstat"] = kstat
        q = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
        return f"{base}/api/kiosks/{kiosk_id}/config" + (f"?{q}" if q else "")
    return base + "/api/config"


def fetch_config(backend_url, kstat="ok"):
    kiosk_id = os.environ.get("CALVIN_KIOSK_ID", "").strip()
    host = os.environ.get("CALVIN_KIOSK_HOSTNAME", "").strip() or socket.gethostname()
    url = _config_url(backend_url, kiosk_id, host, kagent=running_version(), kstat=kstat)
    with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT) as r:
        cfg = json.load(r)
    touch_ready()
    return cfg


def now_in(cfg):
    tzname = cfg_get(cfg, "timezone")
    if tzname and ZoneInfo:
        try:
            return datetime.now(ZoneInfo(tzname))
        except Exception:
            pass
    return datetime.now()


def run(
    backend_url,
    refresh_seconds,
    *,
    fetch=fetch_config,
    sleep=time_module.sleep,
    iterations=None,
    apply_device=None,
):
    if apply_device is None:
        apply_device = apply_device_physical
    last = None
    last_version = _UNSET
    update_state = {"attempted": set()}
    n = 0
    while iterations is None or n < iterations:
        n += 1
        try:
            cfg = fetch(backend_url)
            if not isinstance(cfg, dict):
                raise TypeError(f"expected dict config, got {type(cfg).__name__}")
            maybe_update(cfg, state=update_state)
            version = cfg_get(cfg, "deviceConfigVersion")
            if version != last_version:
                apply_device(cfg)
                last_version = version
            now = now_in(cfg)
            prev = last
            last = reconcile(cfg, now, last)
            if prev != last:
                log(f"display -> {'ON' if last else 'OFF'}")
            secs = seconds_to_next_boundary(cfg, now)
            delay = (
                refresh_seconds if secs is None else max(1, min(secs, refresh_seconds))
            )
        except Exception as e:
            log(f"iteration failed ({e}); keeping display state")
            sleep(BACKOFF_SECONDS)
            continue
        sleep(delay)


X11_ENV = {"DISPLAY": ":0", "XAUTHORITY": "/home/calvin/.Xauthority"}
VALID_ROTATIONS = ("normal", "left", "right", "inverted")
_RESOLUTION_RE = re.compile(r"^(\d+x\d+)(?:@(\d+(?:\.\d+)?))?$")


# --- display stack -----------------------------------------------------------
# Phase 1 (docs/research/2026-10-29-kiosk-wayland.md §7.2 step 1): Wayland is
# opt-in. CALVIN_DISPLAY_STACK is authoritative; otherwise the session env says
# which compositor this agent is attached to. Never infer from WAYLAND_DISPLAY
# alone: an X11 session can host XWayland, and a failed Wayland session can leave
# a stale variable behind.
WAYLAND_DISPLAY_DEFAULT = "wayland-0"
DISPLAY_STACKS = ("x11", "wayland")


def display_stack(env=None):
    """'x11' or 'wayland' for this kiosk."""
    if env is None:
        env = os.environ
    requested = str(env.get("CALVIN_DISPLAY_STACK", "")).strip().lower()
    if requested in DISPLAY_STACKS:
        return requested
    if (
        str(env.get("XDG_SESSION_TYPE", "")).strip().lower() == "wayland"
        and str(env.get("WAYLAND_DISPLAY", "")).strip()
    ):
        return "wayland"
    return "x11"


def wayland_env(env=None):
    """The two variables wlr-randr/wlopm need to reach the compositor."""
    if env is None:
        env = os.environ
    runtime = str(env.get("XDG_RUNTIME_DIR", "")).strip() or f"/run/user/{os.getuid()}"
    display = str(env.get("WAYLAND_DISPLAY", "")).strip() or WAYLAND_DISPLAY_DEFAULT
    return {"XDG_RUNTIME_DIR": runtime, "WAYLAND_DISPLAY": display}


def _run(argv, env, timeout=10):
    """Run a command; None instead of raising when it is missing or hangs."""
    try:
        return subprocess.run(
            argv, env=env, capture_output=True, text=True, timeout=timeout
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None


def _wayland_output_names(env=None):
    """Output names from `wlr-randr`: one line per output, properties indented."""
    r = _run(["wlr-randr"], dict(os.environ, **wayland_env(env)))
    if r is None or r.returncode != 0:
        return []
    names = []
    for line in r.stdout.splitlines():
        if not line or line[0].isspace():
            continue  # property of the output above
        parts = line.split()
        if parts:
            names.append(parts[0])
    return names


def detect_primary_wayland_output(env=None):
    """First connected Wayland output, preferring an HDMI one, or None."""
    names = _wayland_output_names(env)
    if not names:
        return None
    for name in names:
        # Accept both spellings: HDMI-A-1 (Wayland) and HDMI-1 (xrandr/older config).
        if name.startswith("HDMI"):
            return name
    return names[0]


def resolve_wayland_output(requested, env=None):
    """Map an X11 output name onto its Wayland equivalent (HDMI-1 -> HDMI-A-1).

    Existing installs carry CALVIN_DISPLAY_OUTPUT=HDMI-1, which wlr-randr does not
    know; accept either spelling, and fall back to the first connected output.
    """
    requested = (requested or "").strip()
    if not requested:
        return detect_primary_wayland_output(env)
    names = _wayland_output_names(env)
    if requested in names or not names:
        return requested
    m = re.match(r"^(HDMI)-(\d+)$", requested)
    if m and f"{m.group(1)}-A-{m.group(2)}" in names:
        return f"{m.group(1)}-A-{m.group(2)}"
    m = re.match(r"^(HDMI)-A-(\d+)$", requested)
    if m and f"{m.group(1)}-{m.group(2)}" in names:
        return f"{m.group(1)}-{m.group(2)}"
    return requested


def apply_on_wayland(on, env=None):
    """Power the panel with wlopm (wlr-output-power-management).

    vcgencmd is a legacy Pi 3/4 fallback and xset cannot touch a Wayland output,
    so neither is used here. wlopm --on can fail after a display hotplug;
    `wlr-randr --output … --on` is the documented wake fallback.
    """
    out = detect_primary_wayland_output(env)
    if not out:
        log("no connected Wayland output found; cannot power the panel")
        return "none"
    e = dict(os.environ, **wayland_env(env))
    action = "--on" if on else "--off"
    methods = []
    r = _run(["wlopm", action, out], e)
    if r is not None and r.returncode == 0:
        methods.append("wlopm")
    if on and not methods:
        r = _run(["wlr-randr", "--output", out, "--on"], e)
        if r is not None and r.returncode == 0:
            methods.append("wlr-randr")
    return "+".join(methods) if methods else "none"


# Calvin's rotation values are the xrandr names; wlroots transforms turn
# counter-clockwise and are numeric (§7.4 of the research doc):
#   normal -> normal, left (90 CCW) -> 90, inverted -> 180, right (90 CW) -> 270.
# The numeric spellings are accepted too, so CALVIN_DISPLAY_ROTATION can be set in
# either vocabulary.
WLR_TRANSFORMS = {
    "normal": "normal",
    "left": "90",
    "right": "270",
    "inverted": "180",
    "90": "90",
    "180": "180",
    "270": "270",
    "flipped": "flipped",
}


def detect_primary_output():
    """Return the first connected xrandr output name, or None."""
    try:
        r = subprocess.run(
            ["xrandr", "--query"],
            env=dict(os.environ, **X11_ENV),
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    for line in r.stdout.splitlines():
        if " connected" in line:  # excludes " disconnected"
            return line.split()[0]
    return None


def apply_rotation(rotation, output=None, env=None):
    """Rotate the display once (device-local physical setting).

    rotation is an xrandr value: normal | left | right | inverted. Wayland maps it
    to the wlr transform (§7.4). Returns the output name applied, or None if
    skipped/failed. This is a one-shot startup action, not part of the schedule loop.
    """
    if display_stack(env) == "wayland":
        return apply_rotation_wayland(rotation, output, env)
    if rotation not in VALID_ROTATIONS:
        log(
            f"ignoring invalid rotation {rotation!r} (expected one of {VALID_ROTATIONS})"
        )
        return None
    out = output or detect_primary_output()
    if not out:
        log("no connected display output found; cannot apply rotation")
        return None
    try:
        r = subprocess.run(
            ["xrandr", "--output", out, "--rotate", rotation],
            env=dict(os.environ, **X11_ENV),
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as e:
        log(f"rotation failed ({e})")
        return None
    if r.returncode == 0:
        log(f"rotation applied: {out} -> {rotation}")
        return out
    log(f"rotation failed (xrandr rc={r.returncode}): {r.stderr.strip()}")
    return None


def apply_rotation_wayland(rotation, output=None, env=None):
    """Rotate the display once via `wlr-randr --transform` (one-shot, like X11)."""
    transform = WLR_TRANSFORMS.get(str(rotation))
    if transform is None:
        log(
            f"ignoring invalid rotation {rotation!r} (expected one of {VALID_ROTATIONS})"
        )
        return None
    out = resolve_wayland_output(output, env)
    if not out:
        log("no connected display output found; cannot apply rotation")
        return None
    r = _run(
        ["wlr-randr", "--output", out, "--transform", transform],
        dict(os.environ, **wayland_env(env)),
    )
    if r is not None and r.returncode == 0:
        log(f"rotation applied: {out} -> {transform} (wlr transform)")
        return out
    detail = (r.stderr.strip() if r is not None else "wlr-randr not available") or ""
    log(f"rotation failed: {detail}")
    return None


def _parse_resolution(resolution):
    """Parse 'WxH' or 'WxH@RATE' into (mode, rate_or_None). Return None if malformed."""
    m = _RESOLUTION_RE.match(resolution.strip())
    if not m:
        return None
    return m.group(1), m.group(2)


def apply_mode(output, resolution, env=None):
    """Select the output and optionally set its mode.

    output: an explicitly-configured output name (env/server), or None.
    resolution: 'WxH' or 'WxH@RATE', or None.
    Does nothing when neither is configured. A configured output is marked --primary
    on X11. Returns the argv applied, or None if skipped/failed. Never raises.
    """
    if output is not None:
        output = str(output).strip() or None
    if resolution is not None:
        resolution = str(resolution).strip() or None
    if not output and not resolution:
        return None
    if display_stack(env) == "wayland":
        return apply_mode_wayland(output, resolution, env)
    out = output or detect_primary_output()
    if not out:
        log("no connected display output found; cannot set output/mode")
        return None
    argv = ["xrandr", "--output", out, "--primary"]
    if resolution:
        parsed = _parse_resolution(resolution)
        if parsed is None:
            log(
                f"ignoring invalid resolution {resolution!r} (expected WxH or WxH@RATE)"
            )
        else:
            mode, rate = parsed
            argv += ["--mode", mode]
            if rate:
                argv += ["--rate", rate]
    try:
        r = subprocess.run(
            argv,
            env=dict(os.environ, **X11_ENV),
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as e:
        log(f"output/mode apply failed ({e})")
        return None
    if r.returncode == 0:
        log(f"output/mode applied: {' '.join(argv[1:])}")
        return argv
    log(f"output/mode apply failed (xrandr rc={r.returncode}): {r.stderr.strip()}")
    return None


def apply_mode_wayland(output, resolution, env=None):
    """Set output/mode with `wlr-randr --output … --mode WxH[@RATE Hz]`."""
    out = resolve_wayland_output(output, env)
    if not out:
        log("no connected display output found; cannot set output/mode")
        return None
    argv = ["wlr-randr", "--output", out]
    if resolution:
        parsed = _parse_resolution(resolution)
        if parsed is None:
            log(
                f"ignoring invalid resolution {resolution!r} (expected WxH or WxH@RATE)"
            )
        else:
            mode, rate = parsed
            argv += ["--mode", f"{mode}@{rate}Hz" if rate else mode]
    r = _run(argv, dict(os.environ, **wayland_env(env)))
    if r is not None and r.returncode == 0:
        log(f"output/mode applied: {' '.join(argv[1:])}")
        return argv
    detail = (r.stderr.strip() if r is not None else "wlr-randr not available") or ""
    log(f"output/mode apply failed: {detail}")
    return None


def orientation_to_xrandr(cfg):
    """Map server orientation config to an xrandr rotate value.

    Matches backend display_orientation_service: flipped -> inverted;
    else portrait -> left; else normal (landscape/unknown).
    """
    flipped = cfg_get(cfg, "orientation_flipped", "orientationFlipped", default=False)
    if flipped:
        return "inverted"
    orientation = cfg_get(cfg, "orientation", default="landscape")
    if orientation == "portrait":
        return "left"
    return "normal"


def apply_device_physical(
    cfg, *, applier=apply_rotation, mode_applier=apply_mode, env=None
):
    """Apply device-physical settings (output/resolution/orientation) from the config.

    Device-local env vars win over server config:
      CALVIN_DISPLAY_OUTPUT     -> output selected as primary / rotation target
      CALVIN_DISPLAY_RESOLUTION -> 'WxH' or 'WxH@RATE'
      CALVIN_DISPLAY_ROTATION   -> xrandr rotate value
    Output+mode apply first (a mode change can reset rotation), then rotation.
    Rotation is gated on applyDisplayRotation (default True); output/resolution are
    independent of that gate.
    """
    if env is None:
        env = os.environ
    output = (
        env.get("CALVIN_DISPLAY_OUTPUT", "").strip()
        or cfg_get(cfg, "display_output", "displayOutput", default="")
        or None
    )
    resolution = (
        env.get("CALVIN_DISPLAY_RESOLUTION", "").strip()
        or cfg_get(cfg, "display_resolution", "displayResolution", default="")
        or None
    )
    mode_applier(output, resolution)
    if cfg_get(cfg, "apply_display_rotation", "applyDisplayRotation", default=True):
        env_rotation = env.get("CALVIN_DISPLAY_ROTATION", "").strip()
        rotation = env_rotation or orientation_to_xrandr(cfg)
        applier(rotation, output)


def main():
    check_python()
    backend = os.environ.get("CALVIN_BACKEND_URL", "").strip()
    if not backend:
        log("CALVIN_BACKEND_URL not set")
        sys.exit(1)
    out_env = os.environ.get("CALVIN_DISPLAY_OUTPUT", "").strip() or None
    res_env = os.environ.get("CALVIN_DISPLAY_RESOLUTION", "").strip() or None
    if out_env or res_env:
        apply_mode(out_env, res_env)
    rotation = os.environ.get("CALVIN_DISPLAY_ROTATION", "").strip()
    if rotation:
        apply_rotation(
            rotation, os.environ.get("CALVIN_DISPLAY_OUTPUT", "").strip() or None
        )
    refresh = int(
        os.environ.get("CALVIN_DISPLAY_REFRESH_SECONDS", DEFAULT_REFRESH_SECONDS)
    )
    log(f"starting: backend={backend} refresh={refresh}s stack={display_stack()}")
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
