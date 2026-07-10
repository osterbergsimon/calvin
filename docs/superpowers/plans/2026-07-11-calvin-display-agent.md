# Calvin Display-Power Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Mode-B kiosk (remote backend) working scheduled screen on/off by running a small local agent that reads the schedule from Calvin's API and drives the panel via `vcgencmd`/`xset`.

**Architecture:** A long-running Python service on the kiosk Pi computes on/off boundaries locally and sleeps to the exact next boundary (no per-minute polling). It re-fetches `/api/config` on a slow safety refresh (default 15 min) to catch UI edits. Decision logic mirrors the backend `display_power_service` exactly. Installed by `setup-kiosk.sh`; deployed manually to the existing older Pi.

**Tech Stack:** Python 3 standard library only (no third-party deps on the kiosk), systemd, bash (`setup-*.sh`), pytest for the tests.

## Global Constraints

- **Python 3 stdlib only** in `calvin_display_agent.py` — no `requests`, no `pytz`; use `urllib.request` and `zoneinfo`. (Kiosk Pi has no venv.)
- **Never blank a working display on a network blip** — a failed config fetch keeps the last applied state.
- **Decision semantics must match** `backend/app/services/display_power_service.py` exactly: `now.weekday()` (0=Mon…6=Sun); midnight-spanning rule `off < on ⇒ (now ≥ on or now < off)` else `on ≤ now < off`; schedule disabled or day-not-enabled ⇒ display ON.
- **Config keys**: accept snake_case first, camelCase fallback — `display_schedule_enabled`/`displayScheduleEnabled`, `display_schedule`/`displaySchedule`, `timezone`. Schedule entries: `{day:int, enabled:bool, onTime:"HH:MM", offTime:"HH:MM"}`.
- **Env**: `CALVIN_BACKEND_URL` (required), `CALVIN_DISPLAY_REFRESH_SECONDS` (optional, default 900). Read from `/etc/default/calvin-kiosk`.
- **Run user/paths on Pi**: user `calvin`, `DISPLAY=:0`, `XAUTHORITY=/home/calvin/.Xauthority`, script at `/usr/local/bin/calvin_display_agent.py`.
- **Test loading**: `test_display_agent.py` loads the module via `importlib` from its own directory (the module isn't an installed package). Pure functions take an injected `now: datetime` — no wall-clock in unit tests.

---

## Task 1: Decision core — `desired_on` / `_should_be_on` / `cfg_get`

**Files:**
- Create: `deploy/kiosk-agent/calvin_display_agent.py`
- Test: `deploy/kiosk-agent/test_display_agent.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `cfg_get(cfg: dict, *keys, default=None)` → first non-None value among keys.
  - `_should_be_on(now_t: datetime.time, on_t: time, off_t: time) -> bool`
  - `desired_on(cfg: dict, now: datetime) -> bool` (True = display ON)

- [ ] **Step 1: Write the failing tests**

Create `deploy/kiosk-agent/test_display_agent.py`:

```python
import importlib.util
import os
from datetime import datetime, time

_MOD = os.path.join(os.path.dirname(__file__), "calvin_display_agent.py")
_spec = importlib.util.spec_from_file_location("calvin_display_agent", _MOD)
agent = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(agent)


def _sched(on="06:00", off="22:00", days=range(7), enabled=True):
    return [{"day": d, "enabled": enabled, "onTime": on, "offTime": off} for d in days]


def _cfg(**over):
    base = {"display_schedule_enabled": True, "display_schedule": _sched(), "timezone": None}
    base.update(over)
    return base


# cfg_get precedence
def test_cfg_get_prefers_first_present():
    assert agent.cfg_get({"a": 1, "b": 2}, "a", "b") == 1
    assert agent.cfg_get({"b": 2}, "a", "b") == 2
    assert agent.cfg_get({"a": None, "b": 2}, "a", "b") == 2
    assert agent.cfg_get({}, "a", "b", default=9) == 9


# _should_be_on — normal window 06:00-22:00
def test_should_be_on_normal_window():
    on, off = time(6, 0), time(22, 0)
    assert agent._should_be_on(time(5, 59), on, off) is False
    assert agent._should_be_on(time(6, 0), on, off) is True
    assert agent._should_be_on(time(21, 59), on, off) is True
    assert agent._should_be_on(time(22, 0), on, off) is False
    assert agent._should_be_on(time(0, 0), on, off) is False


# _should_be_on — midnight-spanning 20:00-07:00
def test_should_be_on_spans_midnight():
    on, off = time(20, 0), time(7, 0)
    assert agent._should_be_on(time(19, 59), on, off) is False
    assert agent._should_be_on(time(20, 0), on, off) is True
    assert agent._should_be_on(time(23, 42), on, off) is True
    assert agent._should_be_on(time(6, 59), on, off) is True
    assert agent._should_be_on(time(7, 0), on, off) is False


# desired_on — schedule disabled ⇒ always ON
def test_desired_on_schedule_disabled():
    cfg = _cfg(display_schedule_enabled=False)
    assert agent.desired_on(cfg, datetime(2026, 7, 11, 23, 0)) is True


# desired_on — inside off-window ⇒ OFF
def test_desired_on_off_window():
    assert agent.desired_on(_cfg(), datetime(2026, 7, 11, 23, 0)) is False


# desired_on — inside on-window ⇒ ON
def test_desired_on_on_window():
    assert agent.desired_on(_cfg(), datetime(2026, 7, 11, 9, 0)) is True


# desired_on — camelCase keys accepted
def test_desired_on_camelcase_keys():
    cfg = {"displayScheduleEnabled": True, "displaySchedule": _sched(), "timezone": None}
    assert agent.desired_on(cfg, datetime(2026, 7, 11, 23, 0)) is False


# desired_on — day not enabled ⇒ ON
def test_desired_on_day_disabled():
    cfg = _cfg(display_schedule=_sched(enabled=False))
    assert agent.desired_on(cfg, datetime(2026, 7, 11, 23, 0)) is True


# desired_on — malformed time ⇒ defensive ON
def test_desired_on_malformed_time():
    cfg = _cfg(display_schedule=[{"day": d, "enabled": True, "onTime": "oops", "offTime": "22:00"} for d in range(7)])
    assert agent.desired_on(cfg, datetime(2026, 7, 11, 23, 0)) is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -v`
(If pytest is not on PATH: `uv run --project backend python -m pytest deploy/kiosk-agent/test_display_agent.py -v`.)
Expected: FAIL — `calvin_display_agent.py` does not exist / attributes undefined.

- [ ] **Step 3: Write the minimal module**

Create `deploy/kiosk-agent/calvin_display_agent.py`:

```python
#!/usr/bin/env python3
"""Calvin display-power agent for remote-backend (Mode B) kiosks.

Reads the display schedule from a remote Calvin backend and powers the local
panel on/off to match. Mirrors backend display_power_service semantics. Pure
Python 3 stdlib — no third-party deps (the kiosk Pi has no venv).
"""
from datetime import datetime, time

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -v`
Expected: PASS (all Task 1 tests).

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/calvin_display_agent.py deploy/kiosk-agent/test_display_agent.py
git commit -m "feat(kiosk): display-agent decision core (schedule → on/off)"
```

---

## Task 2: Next-boundary computation — `seconds_to_next_boundary`

**Files:**
- Modify: `deploy/kiosk-agent/calvin_display_agent.py`
- Test: `deploy/kiosk-agent/test_display_agent.py`

**Interfaces:**
- Consumes: `cfg_get` (Task 1).
- Produces: `seconds_to_next_boundary(cfg: dict, now: datetime) -> int | None` — seconds until the next on/off transition, or `None` when the schedule defines no boundaries (caller then sleeps the refresh interval).

- [ ] **Step 1: Write the failing tests**

Append to `deploy/kiosk-agent/test_display_agent.py`:

```python
# next boundary — 06:00-22:00, at 09:00 → 22:00 today (13h)
def test_next_boundary_daytime():
    secs = agent.seconds_to_next_boundary(_cfg(), datetime(2026, 7, 11, 9, 0))
    assert secs == 13 * 3600


# next boundary — at 23:00 → 06:00 next day (7h)
def test_next_boundary_overnight():
    secs = agent.seconds_to_next_boundary(_cfg(), datetime(2026, 7, 11, 23, 0))
    assert secs == 7 * 3600


# next boundary — midnight-spanning 20:00-07:00, at 23:00 → 07:00 next day (8h)
def test_next_boundary_spans_midnight():
    cfg = _cfg(display_schedule=_sched(on="20:00", off="07:00"))
    secs = agent.seconds_to_next_boundary(cfg, datetime(2026, 7, 11, 23, 0))
    assert secs == 8 * 3600


# next boundary — schedule disabled ⇒ None
def test_next_boundary_none_when_disabled():
    assert agent.seconds_to_next_boundary(_cfg(display_schedule_enabled=False),
                                          datetime(2026, 7, 11, 9, 0)) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -k next_boundary -v`
Expected: FAIL — `seconds_to_next_boundary` undefined.

- [ ] **Step 3: Add the implementation**

Add to `calvin_display_agent.py` (after `desired_on`, add `timedelta` to the datetime import):

```python
# change the datetime import at the top of the file to:
# from datetime import datetime, time, timedelta


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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -v`
Expected: PASS (Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/calvin_display_agent.py deploy/kiosk-agent/test_display_agent.py
git commit -m "feat(kiosk): compute seconds to next display boundary"
```

---

## Task 3: Screen control + apply-on-change — `apply_on` / `reconcile`

**Files:**
- Modify: `deploy/kiosk-agent/calvin_display_agent.py`
- Test: `deploy/kiosk-agent/test_display_agent.py`

**Interfaces:**
- Consumes: `desired_on` (Task 1).
- Produces:
  - `apply_on(on: bool) -> str` — runs `vcgencmd display_power 1|0`, falls back to `xset dpms force on|off`; returns the method used (`"vcgencmd"`, `"xset"`, or `"none (...)"`).
  - `reconcile(cfg: dict, now: datetime, last: bool | None, applier=apply_on) -> bool` — applies only when desired differs from `last` (or `last is None`); returns the new state.

- [ ] **Step 1: Write the failing tests**

Append to `deploy/kiosk-agent/test_display_agent.py`:

```python
import subprocess
from types import SimpleNamespace


def test_apply_on_uses_vcgencmd_when_effective(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="display_power=0\n", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on(False) == "vcgencmd"
    assert calls[0][:2] == ["vcgencmd", "display_power"]
    assert calls[0][2] == "0"


def test_apply_on_falls_back_to_xset(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        if cmd[0] == "vcgencmd":
            raise FileNotFoundError("no vcgencmd")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on(True) == "xset"
    assert calls[-1] == ["xset", "dpms", "force", "on"]


def test_reconcile_applies_only_on_change():
    applied = []
    cfg = _cfg()  # 06:00-22:00
    at_off = datetime(2026, 7, 11, 23, 0)   # desired OFF
    at_on = datetime(2026, 7, 11, 9, 0)     # desired ON

    # first call (last=None) always applies
    last = agent.reconcile(cfg, at_off, None, applier=lambda on: applied.append(on))
    assert last is False and applied == [False]

    # same desired state → no new apply
    last = agent.reconcile(cfg, at_off, last, applier=lambda on: applied.append(on))
    assert last is False and applied == [False]

    # changed desired state → applies
    last = agent.reconcile(cfg, at_on, last, applier=lambda on: applied.append(on))
    assert last is True and applied == [False, True]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -k "apply_on or reconcile" -v`
Expected: FAIL — `apply_on` / `reconcile` undefined (and `agent.subprocess` missing).

- [ ] **Step 3: Add the implementation**

Add to `calvin_display_agent.py` (add `import os`, `import subprocess` at the top):

```python
import os
import subprocess


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


def reconcile(cfg, now, last, applier=apply_on):
    """Apply desired state only when it changed (or on first run). Return new state."""
    on = desired_on(cfg, now)
    if last is None or on != last:
        applier(on)
    return on
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -v`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add deploy/kiosk-agent/calvin_display_agent.py deploy/kiosk-agent/test_display_agent.py
git commit -m "feat(kiosk): apply screen power via vcgencmd/xset, only on change"
```

---

## Task 4: Config fetch, control loop, and `main`

**Files:**
- Modify: `deploy/kiosk-agent/calvin_display_agent.py`
- Test: `deploy/kiosk-agent/test_display_agent.py`

**Interfaces:**
- Consumes: `reconcile`, `desired_on`, `seconds_to_next_boundary`.
- Produces:
  - `fetch_config(backend_url: str) -> dict`
  - `now_in(cfg: dict) -> datetime` (tz-aware if `timezone` set, else naive local)
  - `run(backend_url, refresh_seconds, *, fetch=fetch_config, sleep=time.sleep, iterations=None)` — the loop; `iterations` bounds it for tests.
  - `main()` — reads env, validates `CALVIN_BACKEND_URL`, calls `run`.

- [ ] **Step 1: Write the failing tests**

Append to `deploy/kiosk-agent/test_display_agent.py`:

```python
def test_now_in_naive_when_no_tz():
    n = agent.now_in({"timezone": None})
    assert n.tzinfo is None


def test_run_sleeps_min_of_boundary_and_refresh(monkeypatch):
    # desired OFF at 23:00; next boundary 06:00 (7h) but refresh caps to 900s
    cfg = _cfg()
    monkeypatch.setattr(agent, "now_in", lambda c: datetime(2026, 7, 11, 23, 0))
    slept = []
    applied = []
    monkeypatch.setattr(agent, "apply_on", lambda on: applied.append(on) or "test")

    def fake_sleep(s):
        slept.append(s)

    agent.run("http://x", 900, fetch=lambda url: cfg, sleep=fake_sleep, iterations=1)
    assert applied == [False]        # applied OFF once
    assert slept == [900]            # capped by refresh, not 7h


def test_run_keeps_state_and_backs_off_on_fetch_error(monkeypatch):
    slept = []
    applied = []
    monkeypatch.setattr(agent, "apply_on", lambda on: applied.append(on) or "test")

    def boom(url):
        raise OSError("network down")

    agent.run("http://x", 900, fetch=boom, sleep=lambda s: slept.append(s), iterations=1)
    assert applied == []             # never touched the display
    assert slept == [agent.BACKOFF_SECONDS]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -k "now_in or run_" -v`
Expected: FAIL — `now_in` / `run` / `BACKOFF_SECONDS` undefined.

- [ ] **Step 3: Add the implementation**

Add to `calvin_display_agent.py` (add `import json`, `import sys`, `import time`, `import urllib.request` at the top):

```python
import json
import sys
import time
import urllib.request

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


def run(backend_url, refresh_seconds, *, fetch=fetch_config, sleep=time.sleep, iterations=None):
    last = None
    n = 0
    while iterations is None or n < iterations:
        n += 1
        try:
            cfg = fetch(backend_url)
        except Exception as e:
            log(f"config fetch failed ({e}); keeping display state")
            sleep(BACKOFF_SECONDS)
            continue
        now = now_in(cfg)
        prev = last
        last = reconcile(cfg, now, last)
        if prev != last:
            log(f"display -> {'ON' if last else 'OFF'}")
        secs = seconds_to_next_boundary(cfg, now)
        sleep(refresh_seconds if secs is None else max(1, min(secs, refresh_seconds)))


def main():
    backend = os.environ.get("CALVIN_BACKEND_URL", "").strip()
    if not backend:
        log("CALVIN_BACKEND_URL not set")
        sys.exit(1)
    refresh = int(os.environ.get("CALVIN_DISPLAY_REFRESH_SECONDS", DEFAULT_REFRESH_SECONDS))
    log(f"starting: backend={backend} refresh={refresh}s")
    run(backend, refresh)


if __name__ == "__main__":
    main()
```

Note: `reconcile` calls module-level `apply_on`; the test monkeypatches `agent.apply_on`, so define `reconcile` to call `apply_on` by name (not the default-arg binding) when `applier` is not passed. Change Task 3's `reconcile` default handling to:

```python
def reconcile(cfg, now, last, applier=None):
    on = desired_on(cfg, now)
    if applier is None:
        applier = apply_on
    if last is None or on != last:
        applier(on)
    return on
```

(Re-run the Task 3 `reconcile` test after this change — still passes.)

- [ ] **Step 4: Run the full suite**

Run: `cd /home/tux/code/calvin && python3 -m pytest deploy/kiosk-agent/test_display_agent.py -v`
Expected: PASS (all tests).

- [ ] **Step 5: Sanity-run against the live server (manual, no hardware effect on dev box)**

Run:
```bash
CALVIN_BACKEND_URL=http://10.10.1.25:8000 CALVIN_DISPLAY_REFRESH_SECONDS=5 \
  timeout 3 python3 deploy/kiosk-agent/calvin_display_agent.py; true
```
Expected: logs `starting: backend=... refresh=5s`; `vcgencmd`/`xset` absent on the dev box so it logs a `none (...)` apply method but does not crash. (Schedule currently disabled ⇒ desired ON.)

- [ ] **Step 6: Commit**

```bash
git add deploy/kiosk-agent/calvin_display_agent.py deploy/kiosk-agent/test_display_agent.py
git commit -m "feat(kiosk): config fetch + transition-scheduling control loop"
```

---

## Task 5: systemd service unit

**Files:**
- Create: `deploy/systemd/calvin-display-agent.service`

**Interfaces:**
- Consumes: `/usr/local/bin/calvin_display_agent.py`, `/etc/default/calvin-kiosk`.
- Produces: an enable-able unit `calvin-display-agent.service`.

- [ ] **Step 1: Create the unit file**

Create `deploy/systemd/calvin-display-agent.service`:

```ini
[Unit]
Description=Calvin Kiosk Display-Power Agent (remote backend)
After=network-online.target calvin-frontend.service calvin-kiosk-remote.service
Wants=network-online.target

[Service]
Type=simple
User=calvin
Group=calvin
EnvironmentFile=/etc/default/calvin-kiosk
Environment="DISPLAY=:0"
Environment="XAUTHORITY=/home/calvin/.Xauthority"
ExecStart=/usr/bin/python3 /usr/local/bin/calvin_display_agent.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=calvin-display-agent

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Validate syntax**

Run: `systemd-analyze verify deploy/systemd/calvin-display-agent.service 2>&1 | grep -v 'Unknown\|not found\|Cannot' || true`
Expected: no fatal parse errors (warnings about the not-yet-installed ExecStart binary/EnvironmentFile are fine on the dev box).

- [ ] **Step 3: Commit**

```bash
git add deploy/systemd/calvin-display-agent.service
git commit -m "feat(kiosk): systemd unit for display-power agent"
```

---

## Task 6: Fix openbox autostart to keep DPMS on-demand while disabling idle blanking

**Files:**
- Modify: `scripts/setup-common.sh` (`configure_openbox_autostart`, around lines 651-700)

**Interfaces:**
- Consumes: nothing new.
- Produces: openbox `autostart` that sets `xset s off; xset s noblank; xset +dpms; xset dpms 0 0 0` and keeps `unclutter`.

- [ ] **Step 1: Read the current function**

Run: `sed -n '651,700p' scripts/setup-common.sh`
Expected: the `configure_openbox_autostart` body that currently writes only `unclutter -idle 3 -root &` in the non-chromium branch.

- [ ] **Step 2: Add the xset block to the generated autostart**

In `scripts/setup-common.sh`, inside `configure_openbox_autostart`, immediately before the line that writes the cursor-hide comment (`echo "# Hide cursor after 3 seconds"`), insert:

```bash
        echo "# Disable automatic screen blanking; keep DPMS available for scheduled off"
        echo "xset s off &"
        echo "xset s noblank &"
        echo "xset +dpms &"
        echo "xset dpms 0 0 0 &"
        echo ""
```

- [ ] **Step 3: Verify the generated block by dry-running the function**

Run:
```bash
bash -c 'source scripts/setup-common.sh; log(){ :; }; configure_openbox_autostart "$USER" "http://x:8000" "false"; cat "$HOME/.config/openbox/autostart"' 2>/dev/null | grep -E 'xset|unclutter'
```
Expected: four `xset` lines plus the `unclutter` line.
(If this dev box has a real `~/.config/openbox/autostart`, run it in a throwaway HOME: prefix `HOME=$(mktemp -d)`.)

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-common.sh
git commit -m "fix(kiosk): disable idle blanking but keep DPMS for scheduled off"
```

---

## Task 7: Wire the agent into `setup-kiosk.sh`

**Files:**
- Modify: `scripts/setup-kiosk.sh` (`install_kiosk_services`, `main`)

**Interfaces:**
- Consumes: `install_script` / `install_systemd_service` / `enable_systemd_service` / `start_systemd_service` from `setup-common.sh`; the repo files from Tasks 4-5.
- Produces: installed `/usr/local/bin/calvin_display_agent.py` and enabled `calvin-display-agent.service`.

- [ ] **Step 1: Install the agent script in `main`**

In `scripts/setup-kiosk.sh`, in `main()`, after `install_kiosk_config` and before `install_kiosk_services`, add:

```bash
    log "Installing display-power agent..."
    install_script "${CALVIN_DIR}/deploy/kiosk-agent/calvin_display_agent.py" \
        /usr/local/bin/calvin_display_agent.py "${CALVIN_USER}"
```

- [ ] **Step 2: Install + enable + start the unit**

In `install_kiosk_services()`, after the `calvin-kiosk-remote.service` install line, add:

```bash
    install_systemd_service "${CALVIN_DIR}/deploy/systemd/calvin-display-agent.service" "${CALVIN_DIR}"
```

In the `if systemd_available` enable block, after enabling `calvin-kiosk-remote.service`, add:

```bash
        enable_systemd_service "calvin-display-agent.service"
```

In `start_kiosk_services()`, after starting `calvin-kiosk-remote.service`, add:

```bash
        start_systemd_service "calvin-display-agent.service"
```

- [ ] **Step 3: Syntax-check**

Run: `bash -n scripts/setup-kiosk.sh && echo OK`
Expected: `OK`.

- [ ] **Step 4: Update the completion summary**

In `main()`'s closing `log` block, change the systemd-units line to include the agent:

```bash
    log "Systemd units:  calvin-x.service, calvin-kiosk-remote.service, calvin-display-agent.service"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-kiosk.sh
git commit -m "feat(kiosk): install + enable display-power agent in setup-kiosk.sh"
```

---

## Task 8: Document Mode-B screen scheduling

**Files:**
- Modify: `docs/setup/DEPLOYMENT_TOPOLOGIES.md`

- [ ] **Step 1: Add a subsection under Mode B**

In `docs/setup/DEPLOYMENT_TOPOLOGIES.md`, in the Mode B section, add:

```markdown
### Screen scheduling on a Mode-B kiosk

Calvin's screen on/off schedule is authored in the dashboard UI, but the
backend cannot reach a remote kiosk's display. `setup-kiosk.sh` therefore
installs **`calvin-display-agent.service`**, a small local agent that reads the
schedule from `${CALVIN_BACKEND_URL}/api/config` and powers the panel with
`vcgencmd`/`xset`. It computes on/off boundaries locally (no per-minute
polling) and re-checks the schedule every `CALVIN_DISPLAY_REFRESH_SECONDS`
(default 900) to pick up edits. Set the schedule in the UI as usual; the kiosk
follows it. Logs: `journalctl -u calvin-display-agent.service`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/setup/DEPLOYMENT_TOPOLOGIES.md
git commit -m "docs(kiosk): document Mode-B screen scheduling agent"
```

---

## Task 9: Deploy to the existing Pi + live verification (operational, not code)

This task runs against the live kiosk (`calvin@calvin`, backend `https://calvin.wholab.xyz`). It is the acceptance test for the whole plan. Commands are delivered to the Pi as base64 one-liners because that terminal truncates multi-line pastes.

**Files:** none in the repo. Creates on the Pi: `/etc/default/calvin-kiosk`, `/usr/local/bin/calvin_display_agent.py`, `/etc/systemd/system/calvin-display-agent.service`, updated `~/.config/openbox/autostart`.

- [ ] **Step 1: Confirm the working method on the panel**

On the Pi (screen currently ON):
```bash
export DISPLAY=:0 XAUTHORITY=/home/calvin/.Xauthority
vcgencmd display_power 0; sleep 3; vcgencmd display_power 1
xset +dpms; xset dpms force off; sleep 3; xset dpms force on
```
Record which command actually blanked the panel. (The agent tries both; this just tells us what to expect in the logs.)

- [ ] **Step 2: Create `/etc/default/calvin-kiosk`**

```bash
printf 'CALVIN_BACKEND_URL=https://calvin.wholab.xyz\nCALVIN_DISPLAY_REFRESH_SECONDS=900\n' | sudo tee /etc/default/calvin-kiosk >/dev/null
```

- [ ] **Step 3: Install the agent script**

From the dev box, generate the one-liner:
```bash
echo "echo '$(base64 -w0 deploy/kiosk-agent/calvin_display_agent.py)' | base64 -d | sudo tee /usr/local/bin/calvin_display_agent.py >/dev/null && sudo chmod 0755 /usr/local/bin/calvin_display_agent.py"
```
Run the printed line on the Pi.

- [ ] **Step 4: Install + enable the unit**

Generate similarly:
```bash
echo "echo '$(base64 -w0 deploy/systemd/calvin-display-agent.service)' | base64 -d | sudo tee /etc/systemd/system/calvin-display-agent.service >/dev/null && sudo systemctl daemon-reload && sudo systemctl enable --now calvin-display-agent.service"
```
Run the printed line on the Pi. Then: `systemctl status calvin-display-agent.service --no-pager` → `active (running)`.

- [ ] **Step 5: Fix the openbox autostart (anti-blank, DPMS on-demand)**

On the Pi:
```bash
printf '\nxset s off &\nxset s noblank &\nxset +dpms &\nxset dpms 0 0 0 &\n' >> ~/.config/openbox/autostart
```
(Remove any earlier `xset -dpms` line if one was added in a prior step: `grep -n 'xset -dpms' ~/.config/openbox/autostart` and delete it.)

- [ ] **Step 6: Live schedule test**

In Calvin's UI (on the server), enable the display schedule with an off-window covering the current time. Within `CALVIN_DISPLAY_REFRESH_SECONDS` (temporarily lower it to 30 via `/etc/default/calvin-kiosk` + `sudo systemctl restart calvin-display-agent.service` for a fast test), the panel powers down. Verify:
```bash
journalctl -u calvin-display-agent.service -n 20 --no-pager
```
Expected: `display -> OFF`. Then move the window so "now" is inside on-hours → panel powers back up (`display -> ON`).

- [ ] **Step 7: Restore + finalize**

Restore the desired real schedule and `CALVIN_DISPLAY_REFRESH_SECONDS=900` in `/etc/default/calvin-kiosk`; `sudo systemctl restart calvin-display-agent.service`. Reboot once to confirm unattended bring-up: `sudo reboot`, then after ~60s `systemctl is-active calvin-display-agent.service calvin-frontend.service`.

---

## Self-Review

**Spec coverage:**
- Agent decision logic mirroring backend → Tasks 1-2. ✓
- vcgencmd→xset, apply-on-change → Task 3. ✓
- Transition scheduling + slow refresh + never-blank-on-blip → Task 4. ✓
- systemd service (Type=simple, Restart=always) → Task 5. ✓
- DPMS-enabled-with-zero-timers autostart → Task 6 (repo) + Task 9 Step 5 (Pi). ✓
- setup-kiosk.sh integration → Task 7. ✓
- Docs → Task 8. ✓
- Manual Pi deploy via base64 + live verification → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `desired_on(cfg, now)`, `seconds_to_next_boundary(cfg, now)`, `apply_on(on)->str`, `reconcile(cfg, now, last, applier=None)->bool`, `now_in(cfg)->datetime`, `run(backend_url, refresh_seconds, *, fetch, sleep, iterations)` — names/signatures consistent across Tasks 1-4 and the test file. Task 4 revises `reconcile`'s default-arg to call module-level `apply_on` by name so Task 4's monkeypatch works; Task 3 test still valid. ✓
