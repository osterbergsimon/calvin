#!/usr/bin/env python3
"""Calvin display-power agent for remote-backend (Mode B) kiosks.

Reads the display schedule from a remote Calvin backend and powers the local
panel on/off to match. Mirrors backend display_power_service semantics. Pure
Python 3 stdlib — no third-party deps (the kiosk Pi has no venv).
"""

import base64
import hashlib
import json
import os
import re
import signal
import socket
import struct
import subprocess
import sys
import threading
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


def _parse_until(value, now):
    """Parse an override's ISO ``until``; None when it is absent or unreadable."""
    if not value:
        return None
    try:
        until = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if until.tzinfo is None and now.tzinfo is not None:
        until = until.replace(tzinfo=now.tzinfo)
    elif until.tzinfo is not None and now.tzinfo is None:
        until = until.replace(tzinfo=None)
    return until


def screen_power_override(cfg, now):
    """True/False from an active "Screen now" override, or None when inactive.

    An override is active while its ``until`` is in the future, or forever when
    ``until`` is null (no schedule to take over). An expired override is ignored,
    so the schedule rules again on the next poll.
    """
    override = cfg_get(cfg, "screen_now", "screenNow")
    if not isinstance(override, dict):
        return None
    power = str(override.get("power") or "").lower()
    if power not in ("on", "off"):
        return None
    until_value = override.get("until")
    if until_value:
        until = _parse_until(until_value, now)
        if until is None or until <= now:
            return None
    return power == "on"


def desired_on(cfg, now):
    """Return True if the display should be ON at `now` (a datetime)."""
    override = screen_power_override(cfg, now)
    if override is not None:
        return override
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
    """Seconds until the next on/off transition, or None if no boundaries exist.

    An active "Screen now" override ends at its ``until``, which is the next
    transition even when the schedule's own boundary is later.
    """
    override_until = None
    override = cfg_get(cfg, "screen_now", "screenNow")
    if isinstance(override, dict) and override.get("until"):
        override_until = _parse_until(override.get("until"), now)
        if override_until is not None and override_until <= now:
            override_until = None

    if not cfg_get(
        cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False
    ):
        if override_until is None:
            return None
        return max(1, int((override_until - now).total_seconds()))
    schedule = cfg_get(cfg, "display_schedule", "displaySchedule", default=[]) or []
    by_day = {d.get("day"): d for d in schedule if d.get("enabled", False)}
    candidates = []
    if override_until is not None:
        candidates.append(override_until)
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
    wlr-output-power-management, and wlr-randr --on is the wake fallback. cog owns
    DRM master, so it is stopped before the framebuffer is blanked.
    Returns a '+'-joined list of the methods that appeared to work, or 'none'."""
    if display_stack(env) == "wayland":
        return apply_on_wayland(on, env)
    if display_stack(env) == "cog":
        return apply_on_cog(on, env)
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


# Config poll interval. The GET is small and LAN-local; 60 s keeps a display
# schedule edit from waiting up to a whole interval to reach the panel.
DEFAULT_REFRESH_SECONDS = 60
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


def update_report(state_dir=STATE_DIR):
    """The updater's last (status, message), or ("ok", None) when it never ran.

    update-kiosk.sh writes ``{"status", "phase", "message"}`` to
    agent-update-state.json; reporting both lets the server's kiosk software
    view tell a python-too-old abort from a rollback (CLV-19).
    """
    try:
        with open(os.path.join(state_dir, "agent-update-state.json")) as f:
            st = json.load(f)
    except (OSError, ValueError):
        return "ok", None
    status = str(st.get("status") or "").strip()
    if status not in ("ok", "error", "running", "success"):
        return "ok", None
    message = st.get("message")
    return status, (str(message)[:255] if message else None)


def _config_url(backend_url, kiosk_id, host, kagent=None, kstat=None, kmsg=None, kstack=None):
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
        if kmsg:
            params["kmsg"] = kmsg
        if kstack:
            params["kstack"] = kstack
        q = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
        return f"{base}/api/kiosks/{kiosk_id}/config" + (f"?{q}" if q else "")
    return base + "/api/config"


def fetch_config(backend_url, kstat=None, kmsg=None):
    kiosk_id = os.environ.get("CALVIN_KIOSK_ID", "").strip()
    host = os.environ.get("CALVIN_KIOSK_HOSTNAME", "").strip() or socket.gethostname()
    if kstat is None:
        kstat, kmsg = update_report()
    url = _config_url(
        backend_url,
        kiosk_id,
        host,
        kagent=running_version(),
        kstat=kstat,
        kmsg=kmsg,
        kstack=display_stack(),
    )
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
DISPLAY_STACKS = ("x11", "wayland", "cog")


def display_stack(env=None):
    """'x11', 'wayland' or 'cog' for this kiosk."""
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


# --- cog (WPE WebKit on DRM/KMS) ---------------------------------------------
# cog is a fullscreen browser on the DRM/KMS device: there is no X server and no
# compositor, so xrandr/xset/wlopm cannot reach the panel. While cog runs it holds
# DRM master, so the panel power sequence is "stop cog, blank the framebuffer"
# and the reverse on wake. Privileged work lives in a root-owned helper; the agent
# may run only that helper through sudo (installed with the kiosk bundle).
COG_PANEL_HELPER = "/usr/local/bin/calvin-cog-panel.sh"

# Calvin's rotation names are xrandr semantics: `left` is 90 degrees
# counter-clockwise, `right` 90 degrees clockwise. cog's `rotation` parameter is
# also counter-clockwise and takes quarter turns (0..3), so the mapping is direct:
#   normal 0 | left (90 CCW) 1 | inverted 180 2 | right (270 CCW) 3
# Verified on the owner's Pi 3B+ (cog 0.18.4): rotation=1 renders portrait. Only
# the gles renderer can rotate; the default `modeset` renderer refuses.
COG_ROTATIONS = {
    "normal": 0,
    "left": 1,
    "inverted": 2,
    "right": 3,
    "0": 0,
    "1": 1,
    "2": 2,
    "3": 3,
}


def _cog_panel(*args, env=None):
    """Run the root helper with `args`; returns its result or None."""
    e = dict(os.environ)
    if env is not None:
        e.update(env)
    return _run(["sudo", "-n", COG_PANEL_HELPER, *args], e)


def apply_on_cog(on, env=None):
    """Power the panel on/off by stopping/starting cog around the fb blank."""
    action = "on" if on else "off"
    r = _cog_panel(action, env=env)
    if r is not None and r.returncode == 0:
        return "cog"
    detail = (r.stderr.strip() if r is not None else "helper not available") or ""
    log(f"cog panel {action} failed: {detail}")
    return "none"


def apply_rotation_cog(rotation, env=None):
    """Persist the cog rotation and restart the unit when it changed."""
    value = COG_ROTATIONS.get(str(rotation))
    if value is None:
        log(
            f"ignoring invalid rotation {rotation!r} (expected one of {VALID_ROTATIONS})"
        )
        return None
    r = _cog_panel("rotate", str(value), env=env)
    if r is not None and r.returncode == 0:
        log(f"rotation applied: cog -> {value} ({rotation})")
        return "cog"
    detail = (r.stderr.strip() if r is not None else "helper not available") or ""
    log(f"rotation failed: {detail}")
    return None


def apply_mode_cog(output=None, resolution=None, env=None):
    """cog uses the output's preferred mode; output/mode changes are a no-op."""
    if output or resolution:
        log("output/mode is fixed by cog on the DRM platform; skipping")
    return None


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
    if display_stack(env) == "cog":
        return apply_rotation_cog(rotation, env)
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
    if display_stack(env) == "cog":
        return apply_mode_cog(output, resolution, env)
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


# --- kiosk crash-page recovery (CLV-25) --------------------------------------
# A renderer crash ("Aw, Snap!") leaves the browser process alive, so systemd's
# Restart=always never fires and the kiosk sits on the crash page until someone
# reloads it. Nothing in the page can recover itself. The agent therefore probes
# Chromium's remote-debugging endpoint on localhost (the kiosk unit passes
# --remote-debugging-port, bound to 127.0.0.1) and restarts the kiosk unit when
# the page stops answering. The probe talks to Chromium, never to X11 or Wayland,
# so it covers both display stacks unchanged.
KIOSK_UNITS = ("calvin-kiosk-remote.service", "calvin-kiosk.service")
PAGE_OK = "ok"
PAGE_DEAD = "dead"
PAGE_UNREACHABLE = "unreachable"
WATCHDOG_DEFAULT_PORT = 9222
WATCHDOG_DEFAULT_SECONDS = 30
WATCHDOG_DEFAULT_FAILURES = 3
WATCHDOG_DEFAULT_COOLDOWN = 300
WATCHDOG_DEFAULT_BACKOFF_MAX = 900
WATCHDOG_WARMUP_SECONDS = 120
WATCHDOG_TIMEOUT = 10
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
WS_OPCODE_TEXT = 0x1
WS_OPCODE_CLOSE = 0x8


def _int_or(raw, default):
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return default


def kiosk_watchdog_config(env=None):
    """Crash-recovery settings from the environment, with safe bounds."""
    if env is None:
        env = os.environ
    port = _int_or(env.get("CALVIN_KIOSK_CDP_PORT"), WATCHDOG_DEFAULT_PORT)
    if not 1 <= port <= 65535:
        port = WATCHDOG_DEFAULT_PORT
    enabled = str(env.get("CALVIN_KIOSK_WATCHDOG", "1")).strip().lower()
    return {
        "enabled": enabled not in ("0", "off", "false", "no"),
        "port": port,
        "interval": max(
            5,
            _int_or(
                env.get("CALVIN_KIOSK_WATCHDOG_SECONDS"), WATCHDOG_DEFAULT_SECONDS
            ),
        ),
        "failures": max(
            1,
            _int_or(
                env.get("CALVIN_KIOSK_WATCHDOG_FAILURES"), WATCHDOG_DEFAULT_FAILURES
            ),
        ),
        "cooldown": max(
            0,
            _int_or(
                env.get("CALVIN_KIOSK_WATCHDOG_COOLDOWN"), WATCHDOG_DEFAULT_COOLDOWN
            ),
        ),
        "backoff_max": max(
            max(
                0,
                _int_or(
                    env.get("CALVIN_KIOSK_WATCHDOG_COOLDOWN"),
                    WATCHDOG_DEFAULT_COOLDOWN,
                ),
            ),
            _int_or(
                env.get("CALVIN_KIOSK_WATCHDOG_BACKOFF_MAX"),
                WATCHDOG_DEFAULT_BACKOFF_MAX,
            ),
        ),
    }


# -- CDP client: the subset of the DevTools protocol a health probe needs ------
# Chromium's HTTP endpoint lists targets but keeps a crashed tab listed, so only
# a round-trip over the page target's WebSocket proves the renderer is alive.
def ws_accept_key(key):
    """Sec-WebSocket-Accept for a client key (RFC 6455 handshake check)."""
    return base64.b64encode(
        hashlib.sha1((key + WS_GUID).encode()).digest()
    ).decode()


def ws_encode_text(payload, mask=None):
    """A masked client text frame (clients MUST mask; frames stay small here)."""
    if mask is None:
        mask = os.urandom(4)
    length = len(payload)
    frame = bytearray([0x80 | WS_OPCODE_TEXT])  # FIN + text
    if length < 126:
        frame.append(0x80 | length)
    elif length < 65536:
        frame.append(0x80 | 126)
        frame += struct.pack("!H", length)
    else:
        frame.append(0x80 | 127)
        frame += struct.pack("!Q", length)
    frame += mask
    frame += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return bytes(frame)


class _WSReader:
    """Buffered reader over a recv() callable (a socket in production)."""

    def __init__(self, recv):
        self._recv = recv
        self._buffer = b""

    def exact(self, count):
        while len(self._buffer) < count:
            chunk = self._recv(max(1, count - len(self._buffer)))
            if not chunk:
                raise EOFError("websocket stream closed")
            self._buffer += chunk
        out, self._buffer = self._buffer[:count], self._buffer[count:]
        return out

    def until(self, marker, limit=65536):
        while marker not in self._buffer:
            if len(self._buffer) > limit:
                raise ValueError("websocket handshake response too large")
            chunk = self._recv(4096)
            if not chunk:
                raise EOFError("websocket closed during the handshake")
            self._buffer += chunk
        end = self._buffer.index(marker) + len(marker)
        out, self._buffer = self._buffer[:end], self._buffer[end:]
        return out


def ws_read_frame(reader):
    """(opcode, payload) of the next WebSocket frame."""
    first, second = reader.exact(2)
    opcode = first & 0x0F
    length = second & 0x7F
    if length == 126:
        length = struct.unpack("!H", reader.exact(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", reader.exact(8))[0]
    mask = reader.exact(4) if second & 0x80 else None
    payload = reader.exact(length) if length else b""
    if mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return opcode, payload


def _default_connect(host, port, timeout):
    return socket.create_connection((host, port), timeout=timeout)


def cdp_eval(ws_url, expression="1+1", timeout=WATCHDOG_TIMEOUT, connect=None, key=None):
    """True when the page answers a trivial Runtime.evaluate. Never raises."""
    if connect is None:
        connect = _default_connect
    if key is None:
        key = base64.b64encode(os.urandom(16)).decode()
    parts = urllib.parse.urlsplit(ws_url)
    host = parts.hostname or "127.0.0.1"
    port = parts.port or 80
    path = parts.path or "/"
    if parts.query:
        path = f"{path}?{parts.query}"
    sock = None
    try:
        sock = connect(host, port, timeout)
        sock.settimeout(timeout)
        sock.sendall(
            (
                f"GET {path} HTTP/1.1\r\n"
                f"Host: {host}:{port}\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\n"
                "Sec-WebSocket-Version: 13\r\n\r\n"
            ).encode()
        )
        reader = _WSReader(sock.recv)
        head = reader.until(b"\r\n\r\n").decode("latin-1")
        if not head.startswith("HTTP/1.1 101") or ws_accept_key(key) not in head:
            return False
        sock.sendall(
            ws_encode_text(
                json.dumps(
                    {
                        "id": 1,
                        "method": "Runtime.evaluate",
                        "params": {
                            "expression": expression,
                            "returnByValue": True,
                        },
                    }
                ).encode()
            )
        )
        while True:
            opcode, payload = ws_read_frame(reader)
            if opcode == WS_OPCODE_CLOSE:
                return False
            if opcode != WS_OPCODE_TEXT:
                continue  # ping/pong: the probe is short-lived, no pong needed
            try:
                reply = json.loads(payload.decode("utf-8"))
            except ValueError:
                continue
            if not isinstance(reply, dict) or reply.get("id") != 1:
                continue
            return "error" not in reply and "result" in reply
    except (OSError, EOFError, ValueError):
        return False
    finally:
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass


# Loopback only: a proxy in the kiosk's environment must never swallow the
# DevTools probe, which would look like "no endpoint" forever.
_LOOPBACK_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _http_json(url, timeout):
    with _LOOPBACK_OPENER.open(url, timeout=timeout) as response:
        return json.load(response)


def _target_list_evidence(targets):
    """True when `targets` is Chromium's /json/list shape (a target list).

    An empty list still counts: a renderer that died before it ever became a
    page target leaves Chromium serving no targets at all.
    """
    if not isinstance(targets, list):
        return False
    return all(isinstance(t, dict) and isinstance(t.get("type"), str) for t in targets)


def cdp_targets(port, timeout=WATCHDOG_TIMEOUT, fetch=None):
    """Chromium's target list, or None when this is not a Chromium DevTools port.

    Only a target list is accepted: another server on the port, an old Chromium,
    or a disabled port must never look like a dead page, or the watchdog would
    restart the kiosk for no reason.
    """
    if fetch is None:
        fetch = _http_json
    try:
        targets = fetch(f"http://127.0.0.1:{port}/json/list", timeout)
    except (OSError, ValueError):
        return None
    return targets if _target_list_evidence(targets) else None


def _page_ws_url(targets):
    for target in targets:
        if isinstance(target, dict) and target.get("type") == "page":
            ws_url = target.get("webSocketDebuggerUrl")
            if ws_url:
                return ws_url
    return None


def cdp_page_target(port, timeout=WATCHDOG_TIMEOUT, fetch=None):
    """webSocketDebuggerUrl of the first page target, or None."""
    return _page_ws_url(cdp_targets(port, timeout, fetch=fetch) or [])


def probe_page(port, timeout=WATCHDOG_TIMEOUT, fetch=None, evaluate=None):
    """PAGE_OK | PAGE_DEAD | PAGE_UNREACHABLE for the kiosk's Chromium page.

    PAGE_UNREACHABLE means no Chromium answered on the debugging port (port
    disabled, an older unit file, a foreign server): never act on it. PAGE_DEAD
    means Chromium answered - even with an empty target list - and the page
    behind the dashboard did not, whether or not it was ever alive.
    """
    if evaluate is None:
        evaluate = cdp_eval
    targets = cdp_targets(port, timeout, fetch=fetch)
    if targets is None:
        return PAGE_UNREACHABLE
    ws_url = _page_ws_url(targets)
    if not ws_url:
        return PAGE_DEAD
    try:
        return PAGE_OK if evaluate(ws_url, timeout) else PAGE_DEAD
    except (OSError, EOFError, ValueError):
        return PAGE_DEAD


# -- the unit to restart ------------------------------------------------------
def _systemctl_show(argv):
    return subprocess.run(argv, capture_output=True, text=True, timeout=10)


def _unit_fields(unit, run):
    """Run `systemctl show` for a unit and return its key=value properties."""
    try:
        result = run(
            [
                "systemctl",
                "show",
                "-p",
                "ActiveState",
                "-p",
                "MainPID",
                "-p",
                "ActiveEnterTimestampMonotonic",
                unit,
            ]
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None
    if getattr(result, "returncode", 1) != 0:
        return None
    fields = {}
    for line in (getattr(result, "stdout", "") or "").splitlines():
        key, _, value = line.partition("=")
        if key.strip():
            fields[key.strip()] = value.strip()
    return fields


def kiosk_unit_state(unit, run=None, monotonic=None):
    """{unit, active, main_pid, uptime_seconds} from systemd (read-only show)."""
    if run is None:
        run = _systemctl_show
    if monotonic is None:
        monotonic = time_module.monotonic
    idle = {"unit": unit, "active": False, "main_pid": 0, "uptime_seconds": None}
    fields = _unit_fields(unit, run)
    if not fields:
        return idle
    active = fields.get("ActiveState") == "active"
    try:
        main_pid = int(fields.get("MainPID") or 0)
    except ValueError:
        main_pid = 0
    try:
        entered = float(fields.get("ActiveEnterTimestampMonotonic") or 0) / 1_000_000
    except ValueError:
        entered = 0.0
    uptime = None if entered <= 0 else max(0.0, monotonic() - entered)
    return {
        "unit": unit,
        "active": active,
        "main_pid": main_pid if active else 0,
        "uptime_seconds": uptime,
    }


def watched_kiosk_unit(units=KIOSK_UNITS, state=None):
    """State of the running kiosk unit (remote first, then all-in-one), or None."""
    if state is None:
        state = kiosk_unit_state
    for unit in units:
        info = state(unit)
        if info.get("active"):
            return info
    return None


def _read_text(path):
    with open(path) as f:
        return f.read()


def pid_in_unit(pid, unit, read=None):
    """True when /proc/<pid>/cgroup says the process belongs to `unit`."""
    if read is None:
        read = _read_text
    try:
        return unit in read(f"/proc/{pid}/cgroup")
    except OSError:
        return False


def pid_alive(pid, read=None):
    """False once the process is gone or already dead (a zombie still answers 0)."""
    if read is None:
        read = _read_text
    try:
        stat = read(f"/proc/{pid}/stat")
    except OSError:
        return False
    try:
        # "pid (comm) STATE ..." - comm may itself contain spaces and parens.
        state = stat[stat.rindex(")") + 2]
    except (ValueError, IndexError):
        return True
    return state not in ("Z", "X")


def restart_kiosk_unit(
    unit,
    *,
    state=None,
    in_unit=None,
    kill=None,
    killpg=None,
    getpgid=None,
    alive=None,
    sleep=time_module.sleep,
    grace_seconds=10.0,
):
    """Restart `unit` by signalling its process tree; systemd starts it again.

    The agent runs as the kiosk user, which owns Chromium, so no privilege
    escalation is needed. systemd gives every unit its own process group: signal
    that group (the browser plus its children), and only fall back to the single
    PID when systemd did not make the unit a group leader. Returns True when a
    signal was delivered, i.e. Restart=always will bring a fresh browser up.
    """
    if state is None:
        state = kiosk_unit_state
    if in_unit is None:
        in_unit = pid_in_unit
    if kill is None:
        kill = os.kill
    if killpg is None:
        killpg = os.killpg
    if getpgid is None:
        getpgid = os.getpgid
    if alive is None:
        alive = pid_alive
    info = state(unit)
    pid = int(info.get("main_pid") or 0)
    if not info.get("active") or pid <= 0:
        log(f"watchdog: {unit} is not running; leaving it to systemd")
        return False
    if not in_unit(pid, unit):
        log(f"watchdog: pid {pid} is not in {unit}; refusing to signal it")
        return False
    try:
        pgid = getpgid(pid)
    except OSError:
        pgid = pid
    grouped = pgid == pid

    def send(sig):
        if grouped:
            killpg(pgid, sig)
        else:
            kill(pid, sig)

    log(f"watchdog: restarting {unit} (pid {pid}, {'group' if grouped else 'pid'})")
    try:
        send(signal.SIGTERM)
    except OSError as e:
        log(f"watchdog: could not signal {unit}: {e}")
        return False
    for _ in range(max(1, int(grace_seconds * 2))):
        if not alive(pid):
            return True
        sleep(0.5)
    log(f"watchdog: {unit} ignored SIGTERM for {grace_seconds:.0f}s; sending SIGKILL")
    try:
        send(signal.SIGKILL)
    except OSError as e:
        log(f"watchdog: could not SIGKILL {unit}: {e}")
        return False
    return True


# -- the decision and the loop ------------------------------------------------
def new_watchdog_state():
    return {"failures": 0, "last_restart": None, "restarts": 0}


def next_cooldown(restarts, base, cap):
    """Wait before the next restart: base, then doubling, never above `cap`."""
    if restarts <= 0:
        return base
    return min(base * (2 ** (restarts - 1)), cap)


def watchdog_step(
    state,
    health,
    unit_state,
    *,
    restart,
    now,
    failures_needed=WATCHDOG_DEFAULT_FAILURES,
    cooldown=WATCHDOG_DEFAULT_COOLDOWN,
    backoff_max=WATCHDOG_DEFAULT_BACKOFF_MAX,
    warmup=WATCHDOG_WARMUP_SECONDS,
):
    """Turn one probe into one decision. Mutates `state`, returns the action."""
    if health == PAGE_OK:
        state["failures"] = 0
        state["restarts"] = 0  # the page recovered: the next crash gets the base wait
        return "ok"
    if health == PAGE_UNREACHABLE:
        # Nothing that is Chromium answered on the debugging port this time: the
        # browser is gone (systemd restarts it), the port is disabled, or it is
        # an old Chromium. Never our call - and never a restart here. Keep the
        # dead-page evidence though: a crashed renderer can stall the endpoint
        # for a probe or two, and a page that was never alive must still arm.
        return "unreachable"
    if unit_state is None or not unit_state.get("active"):
        state["failures"] = 0
        return "idle"
    uptime = unit_state.get("uptime_seconds")
    if uptime is not None and uptime < warmup:
        state["failures"] = 0
        return "warmup"
    state["failures"] = min(state["failures"] + 1, failures_needed)
    if state["failures"] < failures_needed:
        return "waiting"
    restarts = int(state.get("restarts") or 0)
    last = state.get("last_restart")
    if last is not None and now - last < next_cooldown(restarts, cooldown, backoff_max):
        return "cooldown"
    unit = unit_state.get("unit", KIOSK_UNITS[0])
    state["last_restart"] = now
    state["failures"] = 0
    ok = False
    try:
        ok = bool(restart(unit))
    except Exception as e:
        log(f"watchdog: restarting {unit} failed ({e})")
    state["restarts"] = restarts + 1  # back off even when the signal failed
    wait = next_cooldown(state["restarts"], cooldown, backoff_max)
    if ok:
        if state["restarts"] > 1:
            log(
                f"watchdog: crash loop: {unit} has been restarted "
                f"{state['restarts']} times because the page keeps crashing; "
                f"the next restart waits at least {wait}s (cap {backoff_max}s)"
            )
        else:
            log(f"watchdog: {unit} restarted because the page stopped answering")
        return "restarted"
    return "restart-failed"


def run_watchdog(
    port,
    interval,
    *,
    failures_needed=WATCHDOG_DEFAULT_FAILURES,
    cooldown=WATCHDOG_DEFAULT_COOLDOWN,
    backoff_max=WATCHDOG_DEFAULT_BACKOFF_MAX,
    probe=None,
    state=None,
    restart=None,
    sleep=time_module.sleep,
    clock=None,
    iterations=None,
    watchdog_state=None,
):
    """Probe the page every `interval` seconds; stop after `iterations` (None=∞)."""
    if probe is None:

        def probe():
            return probe_page(port)

    if state is None:
        state = kiosk_unit_state
    if restart is None:
        restart = restart_kiosk_unit
    if clock is None:
        clock = time_module.monotonic
    wd = new_watchdog_state() if watchdog_state is None else watchdog_state
    idle_logged = False
    n = 0
    while iterations is None or n < iterations:
        n += 1
        try:
            health = probe()
            unit_state = None if health == PAGE_OK else watched_kiosk_unit(state=state)
            action = watchdog_step(
                wd,
                health,
                unit_state,
                restart=restart,
                now=clock(),
                failures_needed=failures_needed,
                cooldown=cooldown,
                backoff_max=backoff_max,
            )
            if action == "unreachable" and not idle_logged:
                idle_logged = True
                log(
                    f"watchdog: no DevTools endpoint on 127.0.0.1:{port}; "
                    "crash recovery is idle until the page answers"
                )
            elif action == "ok":
                idle_logged = False
            if action == "waiting" and wd["failures"] == 1:
                log("watchdog: the page is not answering; watching before a restart")
        except Exception as e:  # a probe must never end the agent
            log(f"watchdog: probe failed ({e})")
        sleep(interval)


def start_watchdog(port, interval, *, thread_factory=None, **kwargs):
    """Run run_watchdog in a daemon thread so the config loop keeps its cadence."""
    if thread_factory is None:
        thread_factory = threading.Thread
    thread = thread_factory(
        target=run_watchdog,
        args=(port, interval),
        kwargs=kwargs,
        daemon=True,
        name="calvin-kiosk-watchdog",
    )
    thread.start()
    return thread


def watchdog_applies(stack):
    """The CDP watchdog is a Chromium-only workaround.

    cog runs with --webprocess-failure=restart and exposes no Chromium DevTools
    endpoint, so probing 127.0.0.1:9222 there would only log "unreachable".
    """
    return stack != "cog"


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
    watchdog = kiosk_watchdog_config()
    if not watchdog_applies(display_stack()):
        log(
            "watchdog: not used on the cog stack "
            "(cog --webprocess-failure=restart handles it)"
        )
    elif watchdog["enabled"]:
        log(
            "watchdog: probing chromium at "
            f"127.0.0.1:{watchdog['port']} every {watchdog['interval']}s"
        )
        start_watchdog(
            watchdog["port"],
            watchdog["interval"],
            failures_needed=watchdog["failures"],
            cooldown=watchdog["cooldown"],
            backoff_max=watchdog["backoff_max"],
        )
    else:
        log("watchdog: disabled (CALVIN_KIOSK_WATCHDOG)")
    run(backend, refresh)


def reconcile(cfg, now, last, applier=None):
    """Apply desired state only when it changed (or on first run). Return new state.

    A failed apply (the platform helper returns "none", e.g. the cog unit is
    still starting or stopping) does not advance the recorded state, so the next
    poll retries the same transition instead of waiting for the next schedule
    boundary. Only "none" means failure; a method name (or a test applier's None)
    counts as applied.
    """
    on = desired_on(cfg, now)
    if applier is None:
        applier = apply_on
    if last is None or on != last:
        if applier(on) == "none":
            log(
                f"display -> {'ON' if on else 'OFF'} failed; retrying on the next poll"
            )
            return last
    return on


if __name__ == "__main__":
    main()
