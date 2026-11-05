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
from datetime import datetime, time, timedelta, timezone

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


def _parse_instant(value):
    """Parse a UTC ISO instant from an override; None when absent or unreadable.

    The UI writes ``toISOString()`` (always ``...Z``). A legacy/naive value is
    read as UTC, never as local wall time, so the Pi's offset cannot shift it.
    """
    if not value:
        return None
    try:
        instant = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return instant if instant.tzinfo is not None else instant.replace(tzinfo=timezone.utc)


def _as_aware(moment):
    """An aware datetime for `moment`; a naive one is the local wall clock."""
    return moment if moment.tzinfo is not None else moment.astimezone()


def _first_boundary_after(cfg, moment):
    """The first scheduled on/off transition strictly after `moment`, or None.

    `moment` must be aware; boundaries are built in its timezone, which is the
    screen's timezone (``now_in(cfg)``). No schedule, a disabled schedule or a
    schedule with no enabled days has no boundary.
    """
    if not cfg_get(
        cfg, "display_schedule_enabled", "displayScheduleEnabled", default=False
    ):
        return None
    schedule = cfg_get(cfg, "display_schedule", "displaySchedule", default=[]) or []
    by_day = {d.get("day"): d for d in schedule if d.get("enabled", False)}
    candidates = []
    for offset in range(0, 9):  # today + 8 days covers any weekly gap
        d = (moment + timedelta(days=offset)).date()
        entry = by_day.get(d.weekday())
        if not entry:
            continue
        for key in ("onTime", "offTime"):
            try:
                hh, mm = map(int, str(entry.get(key)).split(":"))
            except (ValueError, AttributeError):
                continue
            dt = datetime(d.year, d.month, d.day, hh, mm, tzinfo=moment.tzinfo)
            if dt > moment:
                candidates.append(dt)
    if not candidates:
        return None
    return min(candidates)


def _screen_now(cfg):
    override = cfg_get(cfg, "screen_now", "screenNow")
    return override if isinstance(override, dict) else None


def override_expiry(cfg, now):
    """When the active "Screen now" override ends, or None when it never does.

    The UI stores only ``{power, setAt}``. The agent owns the clock: the override
    ends at the first schedule boundary after ``setAt``, computed from its own
    ``now_in(cfg)`` timezone, so the browser's clock or zone never matters.
    """
    override = _screen_now(cfg)
    if override is None:
        return None
    set_at = _parse_instant(override.get("setAt"))
    if set_at is None:
        return None
    aware_now = _as_aware(now)
    return _first_boundary_after(cfg, set_at.astimezone(aware_now.tzinfo))


def screen_power_override(cfg, now):
    """True/False from an active "Screen now" override, or None when inactive.

    An override is active until the first scheduled boundary after ``setAt``.
    With no schedule it stays until changed. An expired override is ignored, so
    the schedule rules again on the next poll.
    """
    override = _screen_now(cfg)
    if override is None:
        return None
    power = str(override.get("power") or "").lower()
    if power not in ("on", "off"):
        return None
    set_at = _parse_instant(override.get("setAt"))
    if set_at is None:
        return None
    aware_now = _as_aware(now)
    expiry = _first_boundary_after(cfg, set_at.astimezone(aware_now.tzinfo))
    if expiry is not None and aware_now >= expiry:
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

    This is also the remaining life of an active override: the override ends at
    the first boundary after its ``setAt``, which is the next boundary after
    ``now`` while it is still active.
    """
    boundary = _first_boundary_after(cfg, _as_aware(now))
    if boundary is None:
        return None
    return int((boundary - _as_aware(now)).total_seconds())


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


# --- per-screen brightness ramp (calvin-29ws) --------------------------------
# The touch panel on a Pi 3B+ draws power through the Pi. Waking it at full
# brightness browns the Pi out, so the agent can dim it before sleep and step it
# back up after wake (default off). DDC/CI is the only channel: the panel's own
# power stays with the existing DPMS/fb path. Every write is at most
# `brightnessStep` units apart - one big step is what reset the touch controller.
BRIGHTNESS_MAX = 100
BRIGHTNESS_VCP = 10
DEFAULT_BRIGHTNESS = 20
DEFAULT_BRIGHTNESS_STEP = 2
DEFAULT_BRIGHTNESS_STEP_SECONDS = 1.5
BRIGHTNESS_STEP_MIN, BRIGHTNESS_STEP_MAX = 1, 5
BRIGHTNESS_INTERVAL_MIN, BRIGHTNESS_INTERVAL_MAX = 0.5, 10.0
SETTLE_QUIET_SECONDS = 5.0
SETTLE_TIMEOUT_SECONDS = 30.0
SETTLE_POLL_SECONDS = 1.0
RAMP_RESCHEDULE_SECONDS = 1
SLEEP_MODES = ("standby", "dim")
DDC_BUS_STATE = "ddc-bus.json"
DISPLAY_CHECK_STATE = "display-check.json"
DISPLAY_CHECK_STEPS = ("detect", "write", "conversion", "limit")
DISPLAY_CHECK_POLL_SECONDS = 1.5
DISPLAY_CHECK_TIMEOUT_SECONDS = 600
DISPLAY_CHECK_REPORT_PATH = "/api/kiosks/{kiosk_id}/display-check"
RAMP_FAULT_RE = re.compile(
    r"(Undervoltage detected|over-current|usb .*: reset)", re.IGNORECASE
)
COG_UNIT = "calvin-cog.service"


def _as_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off", ""):
        return False
    return default


def _as_int(value, default=None):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default


def _as_float(value, default=None):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError, AttributeError):
        return default


def parse_brightness_conversion(raw):
    """DDC -> panel-menu points from the config, sorted, invalid points dropped."""
    points = []
    if isinstance(raw, (list, tuple)):
        for point in raw:
            if not isinstance(point, dict):
                continue
            ddc = _as_int(point.get("ddc"))
            menu = _as_float(point.get("menu"))
            if ddc is None or menu is None:
                continue
            points.append({"ddc": max(0, min(BRIGHTNESS_MAX, ddc)), "menu": menu})
    return sorted(points, key=lambda p: p["ddc"])


def brightness_settings(cfg):
    """Per-screen brightness settings (snake_case preferred, camelCase too).

    Unsafe values are clamped: a step above 5 is exactly what reset the panel.
    `brightness` is the DDC value chosen in Calvin; None means "not chosen yet"
    (the UI starts at DDC 20 the first time the ramp is turned on).
    """
    settings = {
        "enabled": _as_bool(
            cfg_get(cfg, "brightness_ramp_enabled", "brightnessRampEnabled"),
            default=False,
        ),
        "brightness": _as_int(cfg_get(cfg, "brightness")),
        "limit": _as_int(cfg_get(cfg, "brightness_limit", "brightnessLimit")),
        "step": _as_int(
            cfg_get(cfg, "brightness_step", "brightnessStep"),
            DEFAULT_BRIGHTNESS_STEP,
        ),
        "step_seconds": _as_float(
            cfg_get(cfg, "brightness_step_seconds", "brightnessStepSeconds"),
            DEFAULT_BRIGHTNESS_STEP_SECONDS,
        ),
        "conversion": parse_brightness_conversion(
            cfg_get(cfg, "brightness_conversion", "brightnessConversion")
        ),
        "sleep_mode": str(
            cfg_get(cfg, "sleep_mode", "sleepMode", default="standby") or "standby"
        )
        .strip()
        .lower(),
    }
    if settings["brightness"] is not None:
        settings["brightness"] = max(
            0, min(BRIGHTNESS_MAX, settings["brightness"])
        )
    if settings["limit"] is not None:
        settings["limit"] = max(0, min(BRIGHTNESS_MAX, settings["limit"]))
    step = settings["step"]
    settings["step"] = max(
        BRIGHTNESS_STEP_MIN,
        min(
            BRIGHTNESS_STEP_MAX,
            step if step is not None else DEFAULT_BRIGHTNESS_STEP,
        ),
    )
    seconds = settings["step_seconds"]
    if seconds is None:
        seconds = DEFAULT_BRIGHTNESS_STEP_SECONDS
    settings["step_seconds"] = max(
        BRIGHTNESS_INTERVAL_MIN, min(BRIGHTNESS_INTERVAL_MAX, seconds)
    )
    if settings["sleep_mode"] not in SLEEP_MODES:
        settings["sleep_mode"] = "standby"
    return settings


def brightness_ceiling(settings, fault_ceiling=None):
    """Highest level the agent may ramp to: the limit minus two steps."""
    ceiling = BRIGHTNESS_MAX
    if settings.get("limit") is not None:
        ceiling = min(ceiling, max(0, settings["limit"] - 2 * settings["step"]))
    if fault_ceiling is not None:
        ceiling = min(ceiling, max(0, int(fault_ceiling)))
    return ceiling


def brightness_target(settings, fault_ceiling=None):
    """The value to ramp to after a wake / live change, never above the limit."""
    ceiling = brightness_ceiling(settings, fault_ceiling)
    chosen = settings.get("brightness")
    if chosen is None:
        chosen = DEFAULT_BRIGHTNESS
    return max(0, min(int(chosen), ceiling))


def menu_estimate(settings, ddc):
    """Linear panel-menu estimate from the conversion points, or None.

    The owner enters readings; the fit is only an estimate ("≈"), and the agent
    still stores and works in DDC units.
    """
    points = settings.get("conversion") or []
    if len(points) < 2 or ddc is None:
        return None
    xs = [p["ddc"] for p in points]
    ys = [p["menu"] for p in points]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    var = sum((x - mean_x) ** 2 for x in xs)
    if var == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / var
    intercept = mean_y - slope * mean_x
    return intercept + slope * ddc


# -- ddcutil: the only way to change the panel's brightness -------------------
class DdcController:
    """Reads/writes DDC/CI brightness through `ddcutil --bus N`.

    `ddcutil detect` is slow, so it runs once and the bus number is cached on
    disk. The rest of the agent never shells out when the ramp is off.
    """

    def __init__(self, run=None, state_dir=STATE_DIR, log_fn=None):
        self._run = run or _default_ddc_run
        self.state_dir = state_dir
        self.log = log_fn or log
        self._bus = None
        self._checked = False

    def _cache_path(self):
        return os.path.join(self.state_dir, DDC_BUS_STATE)

    def _load_bus(self):
        try:
            with open(self._cache_path()) as f:
                bus = _as_int(json.load(f).get("bus"))
        except (OSError, ValueError, AttributeError):
            return None
        return bus if bus is not None and bus >= 0 else None

    def _save_bus(self, bus):
        try:
            os.makedirs(self.state_dir, exist_ok=True)
            path = self._cache_path()
            with open(path + ".tmp", "w") as f:
                json.dump({"bus": bus}, f)
            os.replace(path + ".tmp", path)
        except OSError as e:
            self.log(f"brightness: could not cache the DDC bus ({e})")

    def detect(self, refresh=False):
        """Parse `ddcutil detect`: bus, model, connector and VCP version."""
        if self._bus is not None and not refresh:
            return {"bus": self._bus}
        r = self._run(["ddcutil", "detect"])
        text = (getattr(r, "stdout", "") or "") if r is not None else ""
        info = parse_ddcutil_detect(text)
        if info["bus"] is not None:
            self._bus = info["bus"]
            self._checked = True
            self._save_bus(info["bus"])
        else:
            self._checked = True
        return info

    def ensure_bus(self):
        """The I2C bus number, discovering it once (memory, then disk, then detect)."""
        if self._bus is not None:
            return self._bus
        if self._checked:
            return None
        cached = self._load_bus()
        if cached is not None:
            self._bus = cached
            self._checked = True
            return cached
        info = self.detect(refresh=True)
        return info.get("bus")

    def available(self):
        return self.ensure_bus() is not None

    def set_brightness(self, level):
        bus = self.ensure_bus()
        if bus is None:
            self.log("brightness: no DDC/CI display answered; cannot set it")
            return False
        value = max(0, min(BRIGHTNESS_MAX, int(level)))
        r = self._run(
            ["ddcutil", "--bus", str(bus), "setvcp", str(BRIGHTNESS_VCP), str(value)]
        )
        if r is None or getattr(r, "returncode", 1) != 0:
            detail = (getattr(r, "stderr", "") or "").strip() if r else "missing"
            self.log(f"brightness: ddcutil write {value} failed ({detail})")
            return False
        return True

    def read_brightness(self):
        bus = self.ensure_bus()
        if bus is None:
            return None
        r = self._run(
            ["ddcutil", "--bus", str(bus), "getvcp", str(BRIGHTNESS_VCP)]
        )
        text = (getattr(r, "stdout", "") or "") if r is not None else ""
        return parse_ddcutil_brightness(text)


def _default_ddc_run(argv, timeout=20):
    try:
        return subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    except (FileNotFoundError, subprocess.SubprocessError):
        return None


def parse_ddcutil_detect(text):
    """Bus/model/connector/VCP version from `ddcutil detect` output."""
    info = {"bus": None, "model": None, "connector": None, "vcp_version": None}
    for line in str(text or "").splitlines():
        match = re.search(r"I2C bus:\s*(?:/dev/i2c-)?(\d+)", line)
        if match and info["bus"] is None:
            info["bus"] = int(match.group(1))
            continue
        match = re.search(r"DRM connector:\s*(\S+)", line)
        if match and info["connector"] is None:
            info["connector"] = match.group(1)
            continue
        match = re.search(r"VCP version:\s*(\S+)", line)
        if match and info["vcp_version"] is None:
            info["vcp_version"] = match.group(1)
            continue
        match = re.search(r"Model:\s*(.+?)\s*$", line)
        if match and info["model"] is None:
            info["model"] = match.group(1)
    return info


def parse_ddcutil_brightness(text):
    match = re.search(r"current value\s*=\s*(\d+)", str(text or ""), re.IGNORECASE)
    if not match:
        return None
    return max(0, min(BRIGHTNESS_MAX, int(match.group(1))))


# -- fault detection and the settle wait --------------------------------------
def vcgencmd_under_voltage(run=None):
    """True when `vcgencmd get_throttled` bit 0 (under-voltage now) is set."""
    run = run or _default_ddc_run
    r = run(["vcgencmd", "get_throttled"], timeout=5)
    text = (getattr(r, "stdout", "") or "") if r is not None else ""
    match = re.search(r"throttled=0x([0-9a-fA-F]+)", text)
    if not match:
        return False
    try:
        return bool(int(match.group(1), 16) & 0x1)
    except ValueError:
        return False


def kernel_fault_lines(since_epoch, run=None):
    """Kernel lines matching the brown-out/reset signatures since an instant."""
    run = run or _default_ddc_run
    r = run(
        [
            "journalctl",
            "-k",
            "--no-pager",
            "-o",
            "cat",
            "--since",
            f"@{int(since_epoch)}",
        ],
        timeout=10,
    )
    text = (getattr(r, "stdout", "") or "") if r is not None else ""
    return [line.strip() for line in text.splitlines() if RAMP_FAULT_RE.search(line)]


class FaultMonitor:
    """Reports only *new* fault evidence since it was armed.

    `journalctl` lines are cumulative, so the same under-voltage line must not
    keep a ramp blocked forever; each poll returns only lines not seen before.
    """

    def __init__(self, *, run=None, clock=None):
        self._run = run or _default_ddc_run
        self._clock = clock or time_module.time
        self._since = None
        self._seen = 0

    def arm(self):
        self._since = self._clock()
        self._seen = 0

    def new_faults(self):
        faults = []
        if self._since is not None:
            lines = kernel_fault_lines(self._since, run=self._run)
            faults = lines[self._seen :]
            self._seen = len(lines)
        if vcgencmd_under_voltage(self._run):
            faults.append("under-voltage (vcgencmd get_throttled)")
        return faults

    def __call__(self):
        return bool(self.new_faults())


def drm_connector_connected(drm_dir="/sys/class/drm", listing=None, read=None):
    """True when at least one DRM connector reports `connected`."""
    listing = listing or os.listdir
    read = read or _read_text
    try:
        entries = listing(drm_dir)
    except OSError:
        return False
    found = False
    for entry in entries:
        try:
            if read(os.path.join(drm_dir, entry, "status")).strip() == "connected":
                found = True
        except OSError:
            continue
    return found


def cog_active(run=None):
    """True while the cog kiosk unit is running (its page is up)."""
    run = run or _default_ddc_run
    r = run(["systemctl", "is-active", COG_UNIT], timeout=5)
    return (getattr(r, "stdout", "") or "").strip() == "active"


def wait_for_settle(
    *,
    fault_monitor,
    connected=None,
    cog=None,
    clock=None,
    sleep=time_module.sleep,
    quiet=SETTLE_QUIET_SECONDS,
    timeout=SETTLE_TIMEOUT_SECONDS,
    poll=SETTLE_POLL_SECONDS,
):
    """Wait for connected DRM + an active cog + `quiet` seconds without faults.

    Capped at `timeout`; a timeout still ramps (the caller keeps fault checks on)
    so a kiosk whose cog unit is slow can never be left at DDC 0 forever.
    """
    connected = connected or drm_connector_connected
    cog = cog or cog_active
    clock = clock or time_module.monotonic
    start = clock()
    quiet_since = None
    new_faults = getattr(fault_monitor, "new_faults", None)
    while True:
        now = clock()
        if new_faults is not None:
            faults = new_faults()
        else:
            faults = ["fault"] if fault_monitor() else []
        ready = bool(connected()) and bool(cog()) and not faults
        if faults:
            quiet_since = None
        elif ready:
            if quiet_since is None:
                quiet_since = now
            if now - quiet_since >= quiet:
                return {"settled": True, "timed_out": False}
        else:
            quiet_since = None
        if now - start >= timeout:
            log(
                "brightness: display did not settle in "
                f"{int(timeout)}s; ramping up anyway"
            )
            return {"settled": False, "timed_out": True}
        sleep(poll)


# -- the ramp itself ----------------------------------------------------------
def _two_steps_back(level, step, write):
    """Step back down two configured steps, one write at a time (never bigger)."""
    for _ in range(2):
        back = max(0, level - step)
        if back == level:
            break
        if not write(back):
            break
        level = back
    return level


def ramp_brightness(
    current,
    target,
    *,
    write,
    fault=None,
    sleep=time_module.sleep,
    step=DEFAULT_BRIGHTNESS_STEP,
    step_seconds=DEFAULT_BRIGHTNESS_STEP_SECONDS,
    cancel=None,
    stop_on_fault=True,
    log_fn=None,
):
    """Ramp DDC brightness one step at a time; returns what happened.

    On a fault while ramping up: stop, step back down two steps, record the
    highest level that was fine (the limit) and the level reached this wake
    (the ceiling). A ramp down keeps going after a fault - going lower is safe.
    """
    log_fn = log_fn or log
    step = max(1, int(step))
    level = max(0, min(BRIGHTNESS_MAX, int(current)))
    target = max(0, min(BRIGHTNESS_MAX, int(target)))
    outcome = {
        "level": level,
        "fault": None,
        "ceiling": None,
        "limit": None,
        "cancelled": False,
        "steps": 0,
        "write_failed": False,
    }
    direction = 1 if target > level else -1 if target < level else 0
    if direction == 0:
        return outcome
    log_fn(
        f"brightness: ramp {'up' if direction > 0 else 'down'} "
        f"{level} -> {target}, step {step} every {step_seconds}s"
    )
    while True:
        if cancel is not None and cancel():
            outcome["cancelled"] = True
            log_fn(f"brightness: ramp cancelled at {level}")
            break
        if fault is not None:
            faults = fault()
            if faults:
                detail = (
                    faults[0] if isinstance(faults, (list, tuple)) else str(faults)
                )
                outcome["fault"] = detail
                log_fn(f"brightness: fault at {level}: {detail}")
                if direction > 0:
                    outcome["limit"] = max(0, level - step)
                    level = _two_steps_back(level, step, write)
                    outcome["ceiling"] = level
                    log_fn(f"brightness: stepped back to {level}; stopping this ramp")
                    break
                level = _two_steps_back(level, step, write)
                outcome["ceiling"] = level
                continued = level != target
                if not continued:
                    break
                continue
        if level == target:
            break
        nxt = level + direction * step
        nxt = min(nxt, target) if direction > 0 else max(nxt, target)
        if not write(nxt):
            outcome["write_failed"] = True
            log_fn(f"brightness: write {nxt} failed; stopping the ramp")
            break
        level = nxt
        outcome["steps"] += 1
        if level != target:
            sleep(step_seconds)
    outcome["level"] = level
    log_fn(f"brightness: ramp stopped at {level}")
    return outcome


# -- the power/settle/ramp controller -----------------------------------------
class BrightnessController:
    """Owns panel power plus the optional ramp, across config polls.

    Inject the DDC writer (`ddc`), fault probe (`fault`), clock and sleep. With
    the ramp off and no diagnostics run this object never touches ddcutil, and
    behaves exactly like the old `reconcile`.
    """

    def __init__(
        self,
        *,
        ddc=None,
        fault=None,
        clock=None,
        sleep=time_module.sleep,
        state_dir=STATE_DIR,
        applier=None,
        connected=None,
        cog=None,
        log_fn=None,
    ):
        self.ddc = ddc if ddc is not None else DdcController(state_dir=state_dir)
        self.fault = fault if fault is not None else FaultMonitor()
        self.clock = clock or time_module.monotonic
        self.sleep = sleep
        self.state_dir = state_dir
        self.applier = applier
        self.connected = connected
        self.cog = cog
        self.log = log_fn or log
        self.level = 0
        self.panel_off = True
        self.settings = None
        self.fault_ceiling = None
        self.pending_restore = None
        self.last_fault = None
        self.last_limit = None
        self.reschedule = False

    def _apply_on(self, on):
        applier = self.applier or apply_on
        return applier(on)

    def _ddc_available(self):
        try:
            return bool(self.ddc.available())
        except Exception:
            return False

    def _arm(self):
        self.fault_ceiling = None
        arm = getattr(self.fault, "arm", None)
        if arm is not None:
            arm()

    def _ramp(self, target, *, cancel=None, stop_on_fault=True):
        outcome = ramp_brightness(
            self.level,
            target,
            write=self.ddc.set_brightness,
            fault=self.fault,
            sleep=self.sleep,
            step=self.settings["step"],
            step_seconds=self.settings["step_seconds"],
            cancel=cancel,
            stop_on_fault=stop_on_fault,
            log_fn=self.log,
        )
        self.level = outcome["level"]
        if outcome.get("fault"):
            self.last_fault = outcome["fault"]
            self.last_limit = outcome.get("limit")
            if outcome.get("ceiling") is not None:
                self.fault_ceiling = outcome["ceiling"]
            self.log(
                f"brightness: fault recorded; not above "
                f"{self.fault_ceiling if self.fault_ceiling is not None else 'the limit'} "
                "until the next wake"
            )
        return outcome

    def _wake(self, settings, dim, cancel):
        """Settle after a real panel power-on, then ramp to the chosen level."""
        self._ramp(
            brightness_target(settings, self.fault_ceiling),
            cancel=cancel,
            stop_on_fault=True,
        )
        return None

    def _sleep_standby(self, settings, cancel):
        """Dim first (when the ramp is on), then run the normal off."""
        if settings["enabled"] and self.level > 0:
            outcome = self._ramp(0, cancel=cancel, stop_on_fault=False)
            if outcome.get("cancelled"):
                return "cancelled"
        if self.level > 0:
            # A failed write: never turn a panel off at an unknown bright level.
            self.log(f"brightness: could not dim below {self.level}; turning off anyway")
        result = self._apply_on(False)
        if result == "none":
            self.log("display -> OFF failed; retrying on the next poll")
            return "failed"
        self.panel_off = True
        return "ok"

    def _sleep_dim(self, settings, cancel):
        """Dim only: stay powered and running, just take the backlight to 0."""
        if self.level > 0:
            outcome = self._ramp(0, cancel=cancel, stop_on_fault=False)
            if outcome.get("cancelled"):
                return "cancelled"
            if outcome.get("write_failed"):
                self.log(
                    "brightness: DDC write failed; 'dim only' needs DDC, "
                    "falling back to standby"
                )
                return "failed"
        self.log("brightness: dim-only sleep at 0; panel stays powered")
        return "ok"

    def reconcile(self, cfg, now, last_on, cancel=None):
        """Power/settle/ramp one poll; returns the new display on/off state."""
        self.reschedule = False
        settings = brightness_settings(cfg)
        previous = self.settings
        on = desired_on(cfg, now)
        dim = settings["sleep_mode"] == "dim"

        # Owner answer 4: the ramp was switched off while the panel slept at 0.
        if (
            previous is not None
            and previous["enabled"]
            and not settings["enabled"]
            and not on
            and self.level == 0
        ):
            self.pending_restore = brightness_target(previous)
            self.log(
                "brightness: ramp turned off while asleep; one last step-up "
                f"to {self.pending_restore} at the next wake"
            )
        self.settings = settings

        # A new on/off cancels a running ramp: the caller's `cancel` fires
        # between steps; when it does, never finish the transition.
        if on != last_on or last_on is None:
            if on:
                if self.panel_off or last_on is None:
                    result = self._apply_on(True)
                    if result == "none":
                        self.log("display -> ON failed; retrying on the next poll")
                        self.settings = previous or settings
                        return last_on
                    self.panel_off = False
                    # After a real power-on the panel and its USB devices must
                    # settle before any DDC write. (Dim-only wakes never powered
                    # anything off, so they go straight back up.)
                    if settings["enabled"] or dim:
                        self._arm()
                        wait_for_settle(
                            fault_monitor=self.fault,
                            connected=self.connected,
                            cog=self.cog,
                            clock=self.clock,
                            sleep=self.sleep,
                        )
                else:
                    self._arm()
                owned = settings["enabled"] or (dim and self._ddc_available())
                if owned:
                    outcome = self._ramp(
                        brightness_target(settings, self.fault_ceiling),
                        cancel=cancel,
                        stop_on_fault=True,
                    )
                    if outcome.get("cancelled"):
                        self.reschedule = True
                        return True
                elif self.pending_restore is not None:
                    self._ramp(
                        min(
                            self.pending_restore,
                            brightness_ceiling(settings),
                        ),
                        cancel=cancel,
                        stop_on_fault=True,
                    )
                    self.pending_restore = None
                return True

            # Wanted OFF.
            if dim:
                if not self._ddc_available():
                    self.log(
                        "brightness: 'dim only' needs DDC and none answered; "
                        "falling back to standby"
                    )
                    dim = False
            if dim:
                result = self._sleep_dim(settings, cancel)
                if result == "cancelled":
                    self.reschedule = True
                    return True
                if result == "failed":  # writes failed: standby is the safe fallback
                    dim = False
                else:
                    return False
            if not dim:
                switch = self._sleep_standby(settings, cancel)
                if switch == "cancelled":
                    self.reschedule = True
                    return True
                if switch == "failed":
                    return last_on
                return False

        # No on/off transition: a changed brightness applies now (owner 1).
        owned = settings["enabled"] or (
            settings["sleep_mode"] == "dim" and self._ddc_available()
        )
        if on and owned:
            target = brightness_target(settings, self.fault_ceiling)
            if target != self.level:
                outcome = self._ramp(
                    target,
                    cancel=cancel,
                    stop_on_fault=target > self.level,
                )
                if outcome.get("cancelled"):
                    self.reschedule = True
        elif on and self.pending_restore is not None:
            self._ramp(
                min(self.pending_restore, brightness_ceiling(settings)),
                cancel=cancel,
                stop_on_fault=True,
            )
            self.pending_restore = None
        return on


# -- display diagnostics helper ------------------------------------------------
def display_check_job(cfg):
    """A diagnostics job from the config poll, or None.

    Proposed config shape (backend lane matches this):
      "displayCheck": {"id", "step": detect|write|conversion|limit,
                       "action": "start"|"stop", "value": <DDC level>,
                       "brightness": <return-to level>}
    """
    raw = cfg_get(cfg, "display_check", "displayCheck")
    if not isinstance(raw, dict):
        return None
    job_id = raw.get("id")
    if job_id is None or str(job_id).strip() == "":
        return None
    step = str(raw.get("step") or "").strip().lower()
    job = {
        "id": str(job_id),
        "step": step,
        "action": str(raw.get("action") or "start").strip().lower(),
        "value": _as_int(raw.get("value")),
        "brightness": _as_int(raw.get("brightness")),
    }
    return job


def display_check_report_url(backend_url, kiosk_id):
    base = backend_url.rstrip("/")
    return base + DISPLAY_CHECK_REPORT_PATH.format(kiosk_id=kiosk_id)


def post_display_check(backend_url, payload, *, kiosk_id=None, opener=None):
    """POST a diagnostics report; never raises (the job keeps running if it fails)."""
    kiosk_id = kiosk_id or os.environ.get("CALVIN_KIOSK_ID", "").strip()
    if not kiosk_id:
        return False
    opener = opener or urllib.request
    url = display_check_report_url(backend_url, kiosk_id)
    data = json.dumps(payload).encode()
    request = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with opener.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return 200 <= getattr(response, "status", 200) < 300
    except (OSError, ValueError) as e:
        log(f"display check: report failed ({e})")
        return False


def _json_state_path(state_dir, name):
    return os.path.join(state_dir, name)


def _load_state(path):
    try:
        with open(path) as f:
            state = json.load(f)
    except (OSError, ValueError):
        return None
    return state if isinstance(state, dict) else None


def _save_state(path, state):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path + ".tmp", "w") as f:
            json.dump(state, f)
        os.replace(path + ".tmp", path)
    except OSError as e:
        log(f"display check: could not persist run state ({e})")


def _clear_state(path):
    try:
        os.unlink(path)
    except OSError:
        pass


def _safe_target(settings, limit=None):
    target = brightness_target(settings)
    if limit is not None:
        target = min(target, max(0, int(limit) - 2 * settings["step"]))
    return max(0, target)


class DisplayCheckRunner:
    """Runs a display check from the config job, safely and on its own.

    The backend (or a page) can vanish mid-run; the runner therefore owns the
    finish: it always ramps back to the chosen brightness (never above the
    found limit), and persists its level so a reboot mid-run still ends safely.
    """

    def __init__(
        self,
        job,
        cfg,
        *,
        ddc,
        report=None,
        poll=None,
        clock=None,
        sleep=time_module.sleep,
        state_dir=STATE_DIR,
        controller=None,
        panel_on=None,
        settings=None,
        log_fn=None,
    ):
        self.job = job
        self.cfg = cfg
        self.ddc = ddc
        self.report = report or (lambda payload: None)
        self.poll = poll
        self.clock = clock or time_module.monotonic
        self.sleep = sleep
        self.state_dir = state_dir
        self.controller = controller
        self.panel_on = panel_on or (lambda: True)
        self.settings = settings or brightness_settings(cfg)
        if job.get("brightness") is not None:
            self.settings = dict(
                self.settings, brightness=job["brightness"]
            )
        self.level = controller.level if controller is not None else 0
        if controller is not None:
            arm = getattr(controller.fault, "arm", None)
            if arm is not None:
                arm()
        self.limit = None
        self.settled = False
        self._touched = False
        self._seen = set()
        self._stop_reason = None
        self._deadline = self.clock() + DISPLAY_CHECK_TIMEOUT_SECONDS
        self.log_entries = []
        self.started_at = datetime.now(timezone.utc).isoformat()

    def _path(self):
        return _json_state_path(self.state_dir, DISPLAY_CHECK_STATE)

    def _save(self):
        _save_state(
            self._path(),
            {
                "id": self.job["id"],
                "step": self.job.get("step"),
                "status": "running",
                "level": self.level,
                "limit": self.limit,
                "startedAt": self.started_at,
                "log": self.log_entries,
            },
        )

    def _entry(self, note, level=None):
        entry = {
            "at": datetime.now(timezone.utc).isoformat(),
            "level": self.level if level is None else level,
            "note": note,
        }
        self.log_entries.append(entry)
        log(f"display check: {note}" + (f" (level {entry['level']})" if level is None else ""))
        self._save()

    def _write_level(self, level):
        if not self.ddc.set_brightness(level):
            return False
        self.level = level
        self._touched = True
        if self.controller is not None:
            self.controller.level = level
        return True

    def _cancel(self):
        if self._stop_reason is not None:
            return True
        if self.clock() >= self._deadline:
            self._stop_reason = "timeout"
            return True
        if self.poll is None:
            return False
        try:
            cfg = self.poll()
        except Exception:
            return False
        job = display_check_job(cfg)
        if job is None or job["id"] != self.job["id"] or job["action"] == "stop":
            self._stop_reason = "stopped"
            return True
        return False

    def _ramp(self, target, *, stop_on_fault=True):
        return ramp_brightness(
            self.level,
            target,
            write=self._write_level,
            fault=self.controller.fault if self.controller else None,
            sleep=self.sleep,
            step=self.settings["step"],
            step_seconds=self.settings["step_seconds"],
            cancel=self._cancel,
            stop_on_fault=stop_on_fault,
            log_fn=log,
        )

    def _execute(self, job):
        step = job["step"]
        if step == "detect":
            info = self.ddc.detect(refresh=True)
            if info.get("bus") is None:
                self._entry("no display answered DDC/CI")
                self._stop_reason = "error"
                return
            detail = " · ".join(
                part
                for part in (
                    info.get("model"),
                    f"DDC/CI {info['vcp_version']}" if info.get("vcp_version") else None,
                    info.get("connector"),
                )
                if part
            )
            self._entry(f"found {detail or 'a DDC display'}")
            self.report(
                self._payload(
                    "done", info=info, detail=detail or "found a DDC/CI display"
                )
            )
            return
        if step == "write":
            base = self.level or brightness_target(self.settings)
            low = max(0, base - 10)
            self._entry(f"stepping {base} down to {low} and back")
            down = self._ramp(low, stop_on_fault=False)
            if not down.get("write_failed") and not down.get("cancelled"):
                self._ramp(base, stop_on_fault=True)
            if down.get("write_failed"):
                self._entry("brightness writes did not take effect")
                self._stop_reason = "error"
                return
            self.report(self._payload("done", level=self.level))
            return
        if step == "conversion":
            value = job.get("value")
            if value is None:
                value = self.level or brightness_target(self.settings)
            value = max(0, min(BRIGHTNESS_MAX, int(value)))
            outcome = self._ramp(value, stop_on_fault=value > self.level)
            if outcome.get("write_failed"):
                self._entry("brightness writes did not take effect")
                self._stop_reason = "error"
                return
            self.report(
                self._payload(
                    "done",
                    level=self.level,
                    detail=f"set to {self.level}; read the screen's own menu",
                )
            )
            return
        if step == "limit":
            self._entry("raising brightness and watching for power trouble")
            if not self.panel_on():
                self._entry("the panel is asleep; a limit test needs it awake")
                self._stop_reason = "error"
                return
            outcome = self._ramp(BRIGHTNESS_MAX, stop_on_fault=True)
            if outcome.get("fault"):
                self.limit = outcome.get("limit")
                self._entry(
                    f"fault at {outcome['level']}: {outcome['fault']}; "
                    f"limit found: {self.limit}"
                )
                self.report(
                    self._payload(
                        "done",
                        level=self.level,
                        limit=self.limit,
                        detail=f"limit found: {self.limit}",
                    )
                )
            elif outcome.get("cancelled"):
                self._entry("test stopped by the owner")
            else:
                self._entry("reached 100 with no fault; no limit found")
                self.report(
                    self._payload(
                        "done",
                        level=self.level,
                        limit=None,
                        detail="reached 100 with no fault",
                    )
                )
            return
        self._entry(f"unknown display check step {step!r}")
        self._stop_reason = "error"

    def _payload(self, status, **extra):
        payload = {
            "id": self.job["id"],
            "step": self.job.get("step"),
            "status": status,
            "level": self.level,
            "limit": self.limit,
            "log": self.log_entries,
            "startedAt": self.started_at,
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        }
        payload.update(extra)
        return payload

    def _finish(self, status):
        target = _safe_target(self.settings, self.limit)
        if self._touched and self.panel_on() and self.level != target:
            self._ramp(target, stop_on_fault=target > self.level)
        payload = self._payload(status)
        self.report(payload)
        _clear_state(self._path())
        log(
            f"display check {self.job['id']} finished ({status}); "
            f"brightness {self.level} (target {target})"
        )
        return payload

    def run(self):
        """Poll every 1.5 s while the job is active; always finish safely."""
        self._save()
        self.report(self._payload("running"))
        current = self.job
        while True:
            if self.clock() >= self._deadline:
                return self._finish("timeout")
            if current.get("action") == "stop":
                return self._finish("stopped")
            signature = (current["id"], current["step"], current.get("value"))
            if signature not in self._seen:
                self._seen.add(signature)
                try:
                    self._execute(current)
                except Exception as e:  # a check must never take the agent down
                    self._entry(f"failed: {e}")
                    self._stop_reason = "error"
                if self._stop_reason is not None:
                    status = self._stop_reason
                    self._stop_reason = None
                    return self._finish(status)
            # Wait for the owner's next step (or the dialog closing).
            while True:
                if self.clock() >= self._deadline:
                    return self._finish("timeout")
                if self.poll is None:
                    return self._finish("done")
                try:
                    cfg = self.poll()
                except Exception:
                    self.sleep(DISPLAY_CHECK_POLL_SECONDS)
                    continue
                nxt = display_check_job(cfg)
                if nxt is None or nxt["id"] != self.job["id"]:
                    return self._finish("done")
                if nxt["action"] == "stop":
                    return self._finish("stopped")
                if (nxt["id"], nxt["step"], nxt.get("value")) != signature:
                    current = nxt
                    break
                self.sleep(DISPLAY_CHECK_POLL_SECONDS)


def recover_display_check(
    state_dir,
    cfg,
    *,
    ddc,
    report=None,
    controller=None,
    state=None,
    panel_on=None,
    log_fn=None,
):
    """Finish a diagnostics run that a reboot interrupted (never leave it unsafe).

    A reboot during the limit test is itself evidence: the last level reached is
    reduced by one step and becomes the limit, and the panel is returned to the
    chosen brightness (never above that limit).
    """
    log_fn = log_fn or log
    path = _json_state_path(state_dir, DISPLAY_CHECK_STATE)
    if state is None:
        state = _load_state(path)
    if not state or state.get("status") != "running":
        _clear_state(path)
        return None
    settings = brightness_settings(cfg)
    step = _as_int(state.get("step"))
    last_level = _as_int(state.get("level"))
    limit = _as_int(state.get("limit"))
    if state.get("step") == "limit" and limit is None and last_level is not None:
        limit = max(0, last_level - settings["step"])
    payload = {
        "id": state.get("id"),
        "step": state.get("step"),
        "status": "interrupted",
        "level": last_level,
        "limit": limit,
        "log": state.get("log") or [],
        "detail": "the kiosk restarted during the check",
        "finishedAt": datetime.now(timezone.utc).isoformat(),
    }
    awake = True
    if panel_on is not None:
        try:
            awake = bool(panel_on())
        except Exception:
            awake = True
    if awake and last_level is not None:
        target = _safe_target(settings, limit)
        ramp_brightness(
            last_level,
            target,
            write=ddc.set_brightness,
            fault=controller.fault if controller else None,
            sleep=controller.sleep if controller else time_module.sleep,
            step=settings["step"],
            step_seconds=settings["step_seconds"],
            stop_on_fault=target > last_level,
            log_fn=log_fn,
        )
        if controller is not None:
            controller.level = target
    if report is not None:
        report(payload)
    _clear_state(path)
    log_fn(
        f"display check {state.get('id')} was interrupted by a restart; "
        f"returned to {_safe_target(settings, limit)} (limit {limit})"
    )
    return payload


def start_display_check(job, cfg, *, fetch, backend_url, controller, sleep=None):
    """Run a diagnostics job in a daemon thread; returns the thread."""
    def poll():
        return fetch(backend_url)

    def report(payload):
        post_display_check(backend_url, payload)

    runner = DisplayCheckRunner(
        job,
        cfg,
        ddc=controller.ddc,
        report=report,
        poll=poll,
        sleep=sleep or time_module.sleep,
        state_dir=controller.state_dir,
        controller=controller,
    )
    thread = threading.Thread(
        target=runner.run, daemon=True, name="calvin-display-check"
    )
    thread.start()
    return thread


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
    # The fallback is still aware: a naive "now" plus a UTC setAt is exactly
    # how a browser/Pi clock mismatch used to shift an expiry.
    return datetime.now().astimezone()


def run(
    backend_url,
    refresh_seconds,
    *,
    fetch=fetch_config,
    sleep=time_module.sleep,
    iterations=None,
    apply_device=None,
    brightness=None,
):
    if apply_device is None:
        apply_device = apply_device_physical
    controller = brightness
    last = None
    last_version = _UNSET
    update_state = {"attempted": set()}
    check_thread = None
    recovered = False

    def ramp_cancel(desired):
        """Notice a new on/off while a ramp is running, and cancel it cleanly."""

        def cancel():
            try:
                fresh = fetch(backend_url)
            except Exception:
                return False
            try:
                return desired_on(fresh, now_in(fresh)) != desired
            except Exception:
                return False

        return cancel

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
            if controller is not None and not recovered:
                recover_display_check(
                    controller.state_dir,
                    cfg,
                    ddc=controller.ddc,
                    report=lambda payload: post_display_check(backend_url, payload),
                    controller=controller,
                    panel_on=lambda: desired_on(cfg, now_in(cfg)),
                )
                recovered = True
            job = display_check_job(cfg)
            if (
                controller is not None
                and job is not None
                and (check_thread is None or not check_thread.is_alive())
            ):
                check_thread = start_display_check(
                    job,
                    cfg,
                    fetch=fetch,
                    backend_url=backend_url,
                    controller=controller,
                    sleep=sleep,
                )
            now = now_in(cfg)
            prev = last
            if controller is None:
                last = reconcile(cfg, now, last)
            else:
                desired = desired_on(cfg, now)
                last = controller.reconcile(
                    cfg, now, last, cancel=ramp_cancel(desired)
                )
            if prev != last:
                log(f"display -> {'ON' if last else 'OFF'}")
            secs = seconds_to_next_boundary(cfg, now)
            delay = (
                refresh_seconds if secs is None else max(1, min(secs, refresh_seconds))
            )
            if controller is not None and controller.reschedule:
                delay = min(delay, RAMP_RESCHEDULE_SECONDS)
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
    run(backend, refresh, brightness=BrightnessController())


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
