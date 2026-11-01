import importlib.util
import io
import os
from datetime import datetime, time
from types import SimpleNamespace

import pytest

_MOD = os.path.join(os.path.dirname(__file__), "calvin_display_agent.py")
_spec = importlib.util.spec_from_file_location("calvin_display_agent", _MOD)
agent = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(agent)


@pytest.fixture(autouse=True)
def _no_session_env(monkeypatch):
    """Default every test to X11.

    The agent auto-detects Wayland from the session environment, and this suite
    may run inside a Wayland desktop session; scrub those keys so the X11 tests
    exercise the X11 branch. Wayland tests pass an explicit env dict.
    """
    for key in ("CALVIN_DISPLAY_STACK", "XDG_SESSION_TYPE", "WAYLAND_DISPLAY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.delenv("XDG_RUNTIME_DIR", raising=False)


def _sched(on="06:00", off="22:00", days=range(7), enabled=True):
    return [{"day": d, "enabled": enabled, "onTime": on, "offTime": off} for d in days]


def _cfg(**over):
    base = {
        "display_schedule_enabled": True,
        "display_schedule": _sched(),
        "timezone": None,
    }
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
    cfg = {
        "displayScheduleEnabled": True,
        "displaySchedule": _sched(),
        "timezone": None,
    }
    assert agent.desired_on(cfg, datetime(2026, 7, 11, 23, 0)) is False


# desired_on — merged payload from a per-screen camelCase override ⇒ OFF (CLV-101)
def test_desired_on_merged_payload_honours_screen_override():
    """The server sends both spellings, both carrying the override value.

    The household schedule was enabled and the screen override disabled it; the
    agent reads the snake spelling first and must still turn the display off.
    """
    cfg = {
        "display_schedule_enabled": False,
        "displayScheduleEnabled": False,
        "display_schedule": _sched(),
        "displaySchedule": _sched(),
        "timezone": None,
    }
    now = datetime(2026, 7, 11, 23, 0)
    assert agent.desired_on(cfg, now) is True
    assert agent.seconds_to_next_boundary(cfg, now) is None


# desired_on — day not enabled ⇒ ON
def test_desired_on_day_disabled():
    cfg = _cfg(display_schedule=_sched(enabled=False))
    assert agent.desired_on(cfg, datetime(2026, 7, 11, 23, 0)) is True


# desired_on — malformed time ⇒ defensive ON
def test_desired_on_malformed_time():
    cfg = _cfg(
        display_schedule=[
            {"day": d, "enabled": True, "onTime": "oops", "offTime": "22:00"}
            for d in range(7)
        ]
    )
    assert agent.desired_on(cfg, datetime(2026, 7, 11, 23, 0)) is True


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
    assert (
        agent.seconds_to_next_boundary(
            _cfg(display_schedule_enabled=False), datetime(2026, 7, 11, 9, 0)
        )
        is None
    )


def test_apply_on_runs_both_when_effective(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        if cmd[0] == "vcgencmd":
            return SimpleNamespace(returncode=0, stdout="display_power=0\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on(False) == "vcgencmd+xset"
    assert calls[0][:3] == ["vcgencmd", "display_power", "0"]
    assert calls[1] == ["xset", "dpms", "force", "off"]


def test_apply_on_xset_only_when_vcgencmd_absent(monkeypatch):
    def fake_run(cmd, **kw):
        if cmd[0] == "vcgencmd":
            raise FileNotFoundError("no vcgencmd")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on(True) == "xset"


def test_apply_on_reports_none_when_xset_fails_and_vcgencmd_noop(monkeypatch):
    def fake_run(cmd, **kw):
        if cmd[0] == "vcgencmd":
            # exits 0 but does NOT echo the value -> treated as no-op
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="no display")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on(True) == "none"


def test_reconcile_applies_only_on_change():
    applied = []
    cfg = _cfg()  # 06:00-22:00
    at_off = datetime(2026, 7, 11, 23, 0)  # desired OFF
    at_on = datetime(2026, 7, 11, 9, 0)  # desired ON

    # first call (last=None) always applies
    last = agent.reconcile(cfg, at_off, None, applier=lambda on: applied.append(on))
    assert last is False and applied == [False]

    # same desired state → no new apply
    last = agent.reconcile(cfg, at_off, last, applier=lambda on: applied.append(on))
    assert last is False and applied == [False]

    # changed desired state → applies
    last = agent.reconcile(cfg, at_on, last, applier=lambda on: applied.append(on))
    assert last is True and applied == [False, True]


def test_reconcile_retries_when_the_platform_apply_fails():
    """A failed panel command must not advance the state (CLV-102).

    The next poll has to retry the same transition instead of waiting for the
    next schedule boundary, or a boot inside the off window can leave the panel
    dark for the rest of the on window.
    """
    cfg = _cfg()
    at_off = datetime(2026, 7, 11, 23, 0)
    at_on = datetime(2026, 7, 11, 9, 0)

    # First run failed: stay "never applied" so the next poll tries again.
    assert agent.reconcile(cfg, at_off, None, applier=lambda on: "none") is None
    # A failed ON keeps the previous OFF state, so the loop retries the wake-up.
    assert agent.reconcile(cfg, at_on, False, applier=lambda on: "none") is False
    # A failed OFF keeps the previous ON state, so the loop retries the blank.
    assert agent.reconcile(cfg, at_off, True, applier=lambda on: "none") is True
    # A successful apply advances the state; a test applier returning None counts
    # as success (only the platform helpers' documented "none" is a failure).
    assert agent.reconcile(cfg, at_on, False, applier=lambda on: "cog") is True
    assert agent.reconcile(cfg, at_on, False, applier=lambda on: None) is True


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
    assert applied == [False]  # applied OFF once
    assert slept == [900]  # capped by refresh, not 7h


def test_default_refresh_applies_schedule_edits_within_a_minute():
    # calvin-g4gi: owners expect a schedule edit to take effect within ~60 s.
    assert agent.DEFAULT_REFRESH_SECONDS <= 60


def test_main_uses_default_refresh_unless_overridden(monkeypatch):
    seen = []
    monkeypatch.setenv("CALVIN_BACKEND_URL", "http://x")
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG", "0")
    for key in (
        "CALVIN_DISPLAY_REFRESH_SECONDS",
        "CALVIN_DISPLAY_OUTPUT",
        "CALVIN_DISPLAY_RESOLUTION",
        "CALVIN_DISPLAY_ROTATION",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(agent, "check_python", lambda: None)
    monkeypatch.setattr(agent, "run", lambda url, refresh: seen.append(refresh))
    agent.main()
    monkeypatch.setenv("CALVIN_DISPLAY_REFRESH_SECONDS", "900")
    agent.main()
    assert seen == [agent.DEFAULT_REFRESH_SECONDS, 900]


def test_schedule_edit_mid_interval_applies_on_next_poll(monkeypatch):
    # 12:00, panel ON (06-22 window, next boundary 10 h away). The owner then
    # edits the schedule so 12:00 falls in the off window; the next poll, at
    # most DEFAULT_REFRESH_SECONDS (<= 60 s) later, blanks the panel.
    configs = [_cfg(), _cfg(display_schedule=_sched(on="13:00", off="22:00"))]
    moments = [datetime(2026, 7, 11, 12, 0), datetime(2026, 7, 11, 12, 1)]
    monkeypatch.setattr(agent, "now_in", lambda c: moments.pop(0))
    applied, slept = [], []
    monkeypatch.setattr(agent, "apply_on", lambda on: applied.append(on) or "test")
    agent.run(
        "http://x",
        agent.DEFAULT_REFRESH_SECONDS,
        fetch=lambda url: configs.pop(0),
        sleep=slept.append,
        iterations=2,
        apply_device=lambda cfg: None,
    )
    assert applied == [True, False]
    assert slept[0] <= 60  # the edit is picked up within a minute
    assert slept[1] == agent.DEFAULT_REFRESH_SECONDS  # boundary 13:00 is 59 min out


def test_run_keeps_state_and_backs_off_on_fetch_error(monkeypatch):
    slept = []
    applied = []
    monkeypatch.setattr(agent, "apply_on", lambda on: applied.append(on) or "test")

    def boom(url):
        raise OSError("network down")

    agent.run(
        "http://x", 900, fetch=boom, sleep=lambda s: slept.append(s), iterations=1
    )
    assert applied == []  # never touched the display
    assert slept == [agent.BACKOFF_SECONDS]


def test_run_survives_non_dict_config(monkeypatch):
    applied = []
    slept = []
    monkeypatch.setattr(agent, "apply_on", lambda on: applied.append(on) or "test")
    agent.run(
        "http://x",
        900,
        fetch=lambda url: "not a dict",
        sleep=lambda s: slept.append(s),
        iterations=1,
    )
    assert applied == []  # never touched the display
    assert slept == [agent.BACKOFF_SECONDS]


# --- boot inside the scheduled screen-off window (CLV-102) -------------------
# The cog stack powers the panel through its root helper ("off" = stop the unit
# and blank the framebuffer, "on" = unblank and start it). A Pi that boots at
# 23:00 has to survive the agent's first OFF (the unit may not have started yet)
# and bring the page back at the 06:00 boundary.


def _cog_run(monkeypatch, times, fake_run):
    moments = list(times)
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "cog")
    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    monkeypatch.setattr(agent, "now_in", lambda cfg: moments.pop(0))
    agent.run(
        "http://x",
        900,
        fetch=lambda url: _cfg(),
        sleep=lambda s: None,
        iterations=len(moments),
        apply_device=lambda cfg: None,
    )


def test_boot_in_off_window_then_on_starts_cog_again(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    _cog_run(
        monkeypatch,
        iter([datetime(2026, 7, 11, 23, 0), datetime(2026, 7, 12, 6, 0)]),
        fake_run,
    )
    # First poll inside the off window stops the unit (a unit that has not
    # started yet is left stopped); the on boundary always starts it again.
    assert calls == [
        ["sudo", "-n", agent.COG_PANEL_HELPER, "off"],
        ["sudo", "-n", agent.COG_PANEL_HELPER, "on"],
    ]


def test_screen_on_that_fails_is_retried_on_the_next_poll(monkeypatch):
    """A wake-up the helper could not apply is retried, not forgotten."""
    calls = []
    on_attempts = 0

    def fake_run(cmd, **kw):
        nonlocal on_attempts
        calls.append(cmd)
        if cmd[-1] == "on":
            on_attempts += 1
            if on_attempts == 1:
                # systemd was still stopping the unit when "on" ran.
                return SimpleNamespace(
                    returncode=1, stdout="", stderr="unit is stopping"
                )
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    _cog_run(
        monkeypatch,
        iter(
            [
                datetime(2026, 7, 11, 23, 0),
                datetime(2026, 7, 12, 6, 0),
                datetime(2026, 7, 12, 6, 15),
            ]
        ),
        fake_run,
    )
    assert [cmd[-1] for cmd in calls] == ["off", "on", "on"]
    assert on_attempts == 2


def test_repeated_on_is_idempotent_on_the_cog_helper(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    for _ in range(2):
        assert agent.apply_on_cog(True) == "cog"
    assert calls == [
        ["sudo", "-n", agent.COG_PANEL_HELPER, "on"],
        ["sudo", "-n", agent.COG_PANEL_HELPER, "on"],
    ]


def test_apply_rotation_invalid_is_skipped(monkeypatch):
    calls = []
    monkeypatch.setattr(agent.subprocess, "run", lambda *a, **k: calls.append(a))
    assert agent.apply_rotation("sideways", "HDMI-1") is None
    assert calls == []  # never shells out for an invalid value


def test_apply_rotation_runs_xrandr(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_rotation("left", "HDMI-1") == "HDMI-1"
    assert calls[-1] == ["xrandr", "--output", "HDMI-1", "--rotate", "left"]


def test_apply_rotation_autodetects_output(monkeypatch):
    def fake_run(cmd, **kw):
        if cmd[:2] == ["xrandr", "--query"]:
            return SimpleNamespace(
                returncode=0,
                stdout="HDMI-1 connected primary 1920x1080+0+0\n",
                stderr="",
            )
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_rotation("inverted") == "HDMI-1"


def test_detect_primary_output_parses_connected(monkeypatch):
    out = (
        "Screen 0: minimum 320 x 200, current 1920 x 1080\n"
        "HDMI-1 connected primary 1920x1080+0+0 (normal left inverted right) 510mm x 287mm\n"
        "HDMI-2 disconnected (normal left inverted right)\n"
    )
    monkeypatch.setattr(
        agent.subprocess,
        "run",
        lambda *a, **k: SimpleNamespace(returncode=0, stdout=out, stderr=""),
    )
    assert agent.detect_primary_output() == "HDMI-1"


def test_config_url_global_when_no_kiosk_id():
    assert agent._config_url("http://h:8000/", "", "pi") == "http://h:8000/api/config"


def test_config_url_per_kiosk_with_khost():
    assert (
        agent._config_url("http://h:8000", "kitchen-3f9a2c", "pi kitchen")
        == "http://h:8000/api/kiosks/kitchen-3f9a2c/config?khost=pi%20kitchen"
    )


def test_orientation_to_xrandr_mapping():
    assert agent.orientation_to_xrandr({"orientation": "landscape"}) == "normal"
    assert agent.orientation_to_xrandr({"orientation": "portrait"}) == "left"
    assert (
        agent.orientation_to_xrandr(
            {"orientation": "landscape", "orientationFlipped": True}
        )
        == "inverted"
    )
    assert (
        agent.orientation_to_xrandr(
            {"orientation": "portrait", "orientationFlipped": True}
        )
        == "inverted"
    )
    assert agent.orientation_to_xrandr({}) == "normal"  # default landscape


def test_apply_device_physical_uses_server_orientation():
    calls = []
    agent.apply_device_physical(
        {"orientation": "portrait", "applyDisplayRotation": True},
        applier=lambda rot, output=None: calls.append(rot),
        env={},
    )
    assert calls == ["left"]


def test_apply_device_physical_env_escape_hatch_wins():
    calls = []
    agent.apply_device_physical(
        {"orientation": "portrait", "applyDisplayRotation": True},
        applier=lambda rot, output=None: calls.append(rot),
        env={"CALVIN_DISPLAY_ROTATION": "inverted"},
    )
    assert calls == ["inverted"]  # env wins over server 'portrait'->'left'


def test_apply_device_physical_skips_when_rotation_disabled():
    calls = []
    agent.apply_device_physical(
        {"orientation": "portrait", "applyDisplayRotation": False},
        applier=lambda rot, output=None: calls.append(rot),
        env={},
    )
    assert calls == []


def test_apply_device_physical_forwards_output():
    calls = []
    mode_calls = []
    agent.apply_device_physical(
        {"orientation": "portrait", "applyDisplayRotation": True},
        applier=lambda rot, output=None: calls.append((rot, output)),
        mode_applier=lambda output, resolution: mode_calls.append((output, resolution)),
        env={"CALVIN_DISPLAY_OUTPUT": "HDMI-1"},
    )
    assert calls == [("left", "HDMI-1")]
    assert mode_calls == [("HDMI-1", None)]


def test_apply_device_physical_resolution_env_wins_over_server():
    mode_calls = []
    agent.apply_device_physical(
        {"displayResolution": "1280x720", "applyDisplayRotation": True},
        applier=lambda *a, **k: None,
        mode_applier=lambda output, resolution: mode_calls.append((output, resolution)),
        env={
            "CALVIN_DISPLAY_RESOLUTION": "1920x1080",
            "CALVIN_DISPLAY_OUTPUT": "HDMI-1",
        },
    )
    assert mode_calls == [("HDMI-1", "1920x1080")]


def test_apply_device_physical_uses_server_output_and_resolution():
    mode_calls = []
    agent.apply_device_physical(
        {
            "displayOutput": "HDMI-2",
            "displayResolution": "1280x720",
            "applyDisplayRotation": True,
        },
        applier=lambda *a, **k: None,
        mode_applier=lambda output, resolution: mode_calls.append((output, resolution)),
        env={},
    )
    assert mode_calls == [("HDMI-2", "1280x720")]


def test_apply_device_physical_applies_mode_before_rotation():
    order = []
    agent.apply_device_physical(
        {"orientation": "portrait", "applyDisplayRotation": True},
        applier=lambda rot, output=None: order.append("rotate"),
        mode_applier=lambda output, resolution: order.append("mode"),
        env={
            "CALVIN_DISPLAY_OUTPUT": "HDMI-1",
            "CALVIN_DISPLAY_RESOLUTION": "1920x1080",
        },
    )
    assert order == ["mode", "rotate"]


def test_apply_device_physical_applies_output_even_when_rotation_disabled():
    mode_calls = []
    rot_calls = []
    agent.apply_device_physical(
        {"displayOutput": "HDMI-1", "applyDisplayRotation": False},
        applier=lambda rot, output=None: rot_calls.append(rot),
        mode_applier=lambda output, resolution: mode_calls.append((output, resolution)),
        env={},
    )
    assert mode_calls == [("HDMI-1", None)]
    assert rot_calls == []  # rotation still gated off


def test_run_applies_once_when_version_absent(monkeypatch):
    monkeypatch.setattr(agent, "now_in", lambda c: datetime(2026, 7, 11, 12, 0))
    monkeypatch.setattr(agent, "reconcile", lambda cfg, now, last, applier=None: last)
    monkeypatch.setattr(agent, "seconds_to_next_boundary", lambda cfg, now: None)
    cfg = {"orientation": "portrait"}  # no deviceConfigVersion (global /api/config)
    applied = []
    agent.run(
        "http://h",
        999,
        fetch=lambda url: cfg,
        sleep=lambda s: None,
        iterations=3,
        apply_device=lambda c: applied.append(c.get("orientation")),
    )
    assert applied == [
        "portrait"
    ]  # applied once at startup, then skipped (version stays None)


def test_run_applies_device_physical_only_on_version_change(monkeypatch):
    monkeypatch.setattr(agent, "now_in", lambda c: datetime(2026, 7, 11, 12, 0))
    monkeypatch.setattr(agent, "reconcile", lambda cfg, now, last, applier=None: last)
    monkeypatch.setattr(agent, "seconds_to_next_boundary", lambda cfg, now: None)

    configs = [
        {"deviceConfigVersion": "v1", "orientation": "portrait"},
        {"deviceConfigVersion": "v1", "orientation": "portrait"},  # unchanged
        {"deviceConfigVersion": "v2", "orientation": "landscape"},  # changed
    ]
    it = iter(configs)
    applied = []
    agent.run(
        "http://h",
        999,
        fetch=lambda url: next(it),
        sleep=lambda s: None,
        iterations=3,
        apply_device=lambda cfg: applied.append(cfg.get("deviceConfigVersion")),
    )
    # v1 applied on first sight, skipped when unchanged, v2 applied on change
    assert applied == ["v1", "v2"]


def test_run_retries_apply_when_apply_device_raises(monkeypatch):
    monkeypatch.setattr(agent, "now_in", lambda c: datetime(2026, 7, 11, 12, 0))
    monkeypatch.setattr(agent, "reconcile", lambda cfg, now, last, applier=None: last)
    monkeypatch.setattr(agent, "seconds_to_next_boundary", lambda cfg, now: None)
    cfg = {"deviceConfigVersion": "v1", "orientation": "portrait"}
    attempts = []

    def boom(c):
        attempts.append(c.get("deviceConfigVersion"))
        raise RuntimeError("xrandr boom")

    # must not raise out of run(); apply retried each iteration since last_version not advanced
    agent.run(
        "http://h",
        999,
        fetch=lambda url: cfg,
        sleep=lambda s: None,
        iterations=3,
        apply_device=boom,
    )
    assert attempts == [
        "v1",
        "v1",
        "v1",
    ]  # retried every poll (last_version never advanced past the failure)


def test_orientation_to_xrandr_snake_case_flipped():
    assert (
        agent.orientation_to_xrandr(
            {"orientation": "portrait", "orientation_flipped": True}
        )
        == "inverted"
    )


def test_config_url_kiosk_id_empty_host_no_query():
    assert agent._config_url("http://h", "k", "") == "http://h/api/kiosks/k/config"


# --- output + resolution (dd9.1) ---
def _capture_xrandr(monkeypatch, rc=0, stderr=""):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=rc, stdout="", stderr=stderr)

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    return calls


def test_parse_resolution_plain():
    assert agent._parse_resolution("1920x1080") == ("1920x1080", None)


def test_parse_resolution_with_rate():
    assert agent._parse_resolution("1920x1080@60") == ("1920x1080", "60")


def test_parse_resolution_malformed():
    assert agent._parse_resolution("1080p") is None
    assert agent._parse_resolution("1920x") is None
    assert agent._parse_resolution("1920x1080@x") is None


def test_apply_mode_sets_output_and_mode(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    result = agent.apply_mode("HDMI-1", "1920x1080")
    expected = ["xrandr", "--output", "HDMI-1", "--primary", "--mode", "1920x1080"]
    assert result == expected
    assert calls[-1] == expected


def test_apply_mode_with_rate(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    agent.apply_mode("HDMI-1", "1920x1080@60")
    assert calls[-1] == [
        "xrandr",
        "--output",
        "HDMI-1",
        "--primary",
        "--mode",
        "1920x1080",
        "--rate",
        "60",
    ]


def test_apply_mode_output_only_marks_primary(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    agent.apply_mode("HDMI-1", None)
    assert calls[-1] == ["xrandr", "--output", "HDMI-1", "--primary"]


def test_apply_mode_noop_when_neither_configured(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    assert agent.apply_mode(None, None) is None
    assert calls == []


def test_apply_mode_skips_bad_mode_but_still_sets_primary(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    agent.apply_mode("HDMI-1", "1080p")
    assert calls[-1] == ["xrandr", "--output", "HDMI-1", "--primary"]  # no --mode


def test_apply_mode_does_not_raise_on_xrandr_failure(monkeypatch):
    _capture_xrandr(monkeypatch, rc=1, stderr="cannot find mode")
    assert agent.apply_mode("HDMI-1", "9999x9999") is None  # failure marker, no raise


def test_apply_mode_coerces_non_string_resolution(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    # int resolution coerced to "1080" -> not WxH -> no --mode; --primary still applied
    agent.apply_mode("HDMI-1", 1080)
    assert calls[-1] == ["xrandr", "--output", "HDMI-1", "--primary"]


def test_apply_mode_coerces_non_string_output(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    # int output coerced to "1080"; valid resolution -> --mode applied
    agent.apply_mode(1080, "1920x1080")
    assert calls[-1] == [
        "xrandr",
        "--output",
        "1080",
        "--primary",
        "--mode",
        "1920x1080",
    ]


def test_apply_mode_autodetects_output_for_resolution_only(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    monkeypatch.setattr(agent, "detect_primary_output", lambda: "HDMI-9")
    agent.apply_mode(None, "1920x1080")
    assert calls[-1] == [
        "xrandr",
        "--output",
        "HDMI-9",
        "--primary",
        "--mode",
        "1920x1080",
    ]


def test_apply_mode_skips_when_no_output_found(monkeypatch):
    calls = _capture_xrandr(monkeypatch)
    monkeypatch.setattr(agent, "detect_primary_output", lambda: None)
    result = agent.apply_mode(None, "1920x1080")
    assert result is None
    assert calls == []


def test_running_version_reads_state_file(tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "abc123def4560000"}')
    assert agent.running_version(str(tmp_path)) == "abc123def4560000"


def test_running_version_missing_is_none(tmp_path):
    assert agent.running_version(str(tmp_path)) is None


def test_config_url_appends_agent_report():
    url = agent._config_url("http://s:8000", "k1", "pi", kagent="v9", kstat="ok")
    assert "kagent=v9" in url and "kstat=ok" in url and "khost=pi" in url


def test_config_url_appends_update_message():
    url = agent._config_url(
        "http://s:8000", "k1", "pi", kstat="error", kmsg="device python < 3.9"
    )
    assert "kstat=error" in url
    assert "kmsg=device%20python%20%3C%203.9" in url


def test_update_report_reads_updater_state(tmp_path):
    (tmp_path / "agent-update-state.json").write_text(
        '{"status": "error", "phase": "python-too-old", '
        '"message": "device python < 3.9; keeping current agent"}'
    )
    assert agent.update_report(str(tmp_path)) == (
        "error",
        "device python < 3.9; keeping current agent",
    )


def test_update_report_missing_state_is_ok(tmp_path):
    assert agent.update_report(str(tmp_path)) == ("ok", None)


def test_update_report_ignores_unknown_status(tmp_path):
    (tmp_path / "agent-update-state.json").write_text('{"status": "weird", "message": "x"}')
    assert agent.update_report(str(tmp_path)) == ("ok", None)


def test_check_python_below_floor_exits(monkeypatch):
    monkeypatch.setattr(agent.sys, "version_info", (3, 8, 0))
    import pytest
    with pytest.raises(SystemExit):
        agent.check_python()


def test_maybe_update_triggers_when_requested_and_stale(monkeypatch, tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "current0000000000"}')
    calls = []
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "newer00000000000"}
    fired = agent.maybe_update(cfg, trigger=lambda: calls.append("go"),
                               state={"attempted": set()}, state_dir=str(tmp_path))
    assert fired is True and calls == ["go"]


def test_maybe_update_skips_when_already_current(tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "same000000000000"}')
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "same000000000000"}
    assert agent.maybe_update(cfg, trigger=lambda: None,
                              state={"attempted": set()}, state_dir=str(tmp_path)) is False


def test_maybe_update_no_retry_same_failed_version(tmp_path):
    (tmp_path / "agent-version.json").write_text('{"version": "cur0000000000000"}')
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "bad0000000000000"}
    st = {"attempted": {"bad0000000000000"}}   # already tried this version
    assert agent.maybe_update(cfg, trigger=lambda: None, state=st, state_dir=str(tmp_path)) is False


def test_maybe_update_durable_no_retry_after_restart(tmp_path):
    """Durable guard: error-state file from updater prevents re-firing even with fresh state."""
    # Running version differs from the failed version (simulates a rollback that restored old ver)
    (tmp_path / "agent-version.json").write_text('{"version": "old0000000000000"}')
    # Updater wrote an error state recording the failed bundle version
    (tmp_path / "agent-update-state.json").write_text(
        '{"status": "error", "phase": "rollback", "message": "rolled back", "version": "bad0000000000000"}'
    )
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "bad0000000000000"}
    # Fresh state (simulating agent restart — attempted set is empty)
    calls = []
    fired = agent.maybe_update(cfg, trigger=lambda: calls.append("go"),
                               state={"attempted": set()}, state_dir=str(tmp_path))
    assert fired is False, "should NOT fire when updater already recorded error for this version"
    assert calls == []


def test_maybe_update_durable_guard_clears_on_new_version(tmp_path):
    """A new bundle version (different hash) fires normally even when old one errored."""
    (tmp_path / "agent-version.json").write_text('{"version": "old0000000000000"}')
    (tmp_path / "agent-update-state.json").write_text(
        '{"status": "error", "phase": "rollback", "message": "rolled back", "version": "bad0000000000000"}'
    )
    cfg = {"agentUpdateRequested": True, "agentAvailableVersion": "new0000000000000"}
    calls = []
    fired = agent.maybe_update(cfg, trigger=lambda: calls.append("go"),
                               state={"attempted": set()}, state_dir=str(tmp_path))
    assert fired is True, "should fire for a different (new) version even when old one errored"
    assert calls == ["go"]


def test_last_failed_version_returns_version_on_error(tmp_path):
    (tmp_path / "agent-update-state.json").write_text(
        '{"status": "error", "phase": "rollback", "message": "rolled back", "version": "bad0000000000000"}'
    )
    assert agent.last_failed_version(str(tmp_path)) == "bad0000000000000"


def test_last_failed_version_returns_none_on_success(tmp_path):
    (tmp_path / "agent-update-state.json").write_text(
        '{"status": "success", "phase": "complete", "message": "ok", "version": "v1"}'
    )
    assert agent.last_failed_version(str(tmp_path)) is None


def test_last_failed_version_returns_none_when_missing(tmp_path):
    assert agent.last_failed_version(str(tmp_path)) is None


# --- display stack detection (phase 1: opt-in Wayland) ------------------------


def test_display_stack_explicit_setting_wins_over_session():
    env = {"CALVIN_DISPLAY_STACK": "x11", "XDG_SESSION_TYPE": "wayland",
           "WAYLAND_DISPLAY": "wayland-0"}
    assert agent.display_stack(env) == "x11"
    env["CALVIN_DISPLAY_STACK"] = "wayland"
    env["XDG_SESSION_TYPE"] = "x11"
    assert agent.display_stack(env) == "wayland"


def test_display_stack_detects_wayland_session():
    assert agent.display_stack(
        {"XDG_SESSION_TYPE": "wayland", "WAYLAND_DISPLAY": "wayland-0"}
    ) == "wayland"


def test_display_stack_ignores_stale_wayland_display_on_x11():
    # XWayland sets WAYLAND_DISPLAY-less X11 sessions; a stale variable alone is
    # not proof of a Wayland session.
    assert agent.display_stack({"WAYLAND_DISPLAY": "wayland-0"}) == "x11"
    assert agent.display_stack({"XDG_SESSION_TYPE": "wayland"}) == "x11"
    assert agent.display_stack({}) == "x11"


def test_wayland_env_defaults_from_uid():
    e = agent.wayland_env({})
    assert e["XDG_RUNTIME_DIR"] == f"/run/user/{os.getuid()}"
    assert e["WAYLAND_DISPLAY"] == "wayland-0"


def test_wayland_env_honours_session_values():
    e = agent.wayland_env(
        {"XDG_RUNTIME_DIR": "/run/user/1000", "WAYLAND_DISPLAY": "wayland-1"}
    )
    assert e == {"XDG_RUNTIME_DIR": "/run/user/1000", "WAYLAND_DISPLAY": "wayland-1"}


_WLR_RANDR_TEXT = """\
HDMI-A-1 "Dell Inc. DELL U2419H 0000"
  Make: Dell Inc.
  Model: DELL U2419H
  Enabled: no
  Modes:
    1920x1080 px, 60.000000 Hz (preferred, current)
"""


def _fake_tool(monkeypatch, outputs, log=None):
    def fake_run(cmd, **kw):
        if log is not None:
            log.append((cmd, kw.get("env")))
        if cmd[0] == "wlr-randr" and len(cmd) == 1:
            return SimpleNamespace(returncode=0, stdout=outputs, stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)


def test_detect_primary_wayland_output_parses_wlr_randr(monkeypatch):
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT)
    assert agent.detect_primary_wayland_output({}) == "HDMI-A-1"


def test_detect_primary_wayland_output_prefers_hdmi(monkeypatch):
    _fake_tool(monkeypatch, "DSI-1 \"panel\"\nHDMI-A-2 \"tv\"\n")
    assert agent.detect_primary_wayland_output({}) == "HDMI-A-2"
    _fake_tool(monkeypatch, "DSI-1 \"panel\"\n")
    assert agent.detect_primary_wayland_output({}) == "DSI-1"


def test_detect_primary_wayland_output_none_when_tool_missing(monkeypatch):
    def fake_run(cmd, **kw):
        raise FileNotFoundError("no wlr-randr")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.detect_primary_wayland_output({}) is None


def test_resolve_wayland_output_accepts_x11_name(monkeypatch):
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT)
    assert agent.resolve_wayland_output("HDMI-1", {}) == "HDMI-A-1"
    assert agent.resolve_wayland_output("HDMI-A-1", {}) == "HDMI-A-1"


def test_resolve_wayland_output_autodetects_when_unset(monkeypatch):
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT)
    assert agent.resolve_wayland_output(None, {}) == "HDMI-A-1"


def test_resolve_wayland_output_keeps_unknown_name(monkeypatch):
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT)
    assert agent.resolve_wayland_output("DP-1", {}) == "DP-1"


def test_apply_on_wayland_uses_wlopm(monkeypatch):
    calls = []
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT, calls)
    assert agent.apply_on_wayland(False, {}) == "wlopm"
    cmds = [c for c, _ in calls]
    assert ["wlopm", "--off", "HDMI-A-1"] in cmds
    assert not any(c[0] in ("xset", "vcgencmd") for c in cmds)
    env = next(e for c, e in calls if c[0] == "wlopm")
    assert env["XDG_RUNTIME_DIR"] == f"/run/user/{os.getuid()}"
    assert env["WAYLAND_DISPLAY"] == "wayland-0"


def test_apply_on_wayland_wake_falls_back_to_wlr_randr(monkeypatch):
    def fake_run(cmd, **kw):
        if cmd[0] == "wlr-randr" and len(cmd) == 1:
            return SimpleNamespace(returncode=0, stdout=_WLR_RANDR_TEXT, stderr="")
        if cmd[0] == "wlopm":
            return SimpleNamespace(returncode=1, stdout="", stderr="no output")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on_wayland(True, {}) == "wlr-randr"


def test_apply_on_wayland_off_does_not_use_wlr_randr_fallback(monkeypatch):
    def fake_run(cmd, **kw):
        if cmd[0] == "wlr-randr" and len(cmd) == 1:
            return SimpleNamespace(returncode=0, stdout=_WLR_RANDR_TEXT, stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on_wayland(False, {}) == "none"


def test_apply_on_dispatches_on_stack(monkeypatch):
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "wayland")
    monkeypatch.setattr(agent, "apply_on_wayland", lambda on, env=None: "wlopm")
    assert agent.apply_on(False) == "wlopm"


def test_apply_rotation_wayland_maps_to_wlr_transform(monkeypatch):
    for rotation, transform in (
        ("normal", "normal"),
        ("left", "90"),
        ("inverted", "180"),
        ("right", "270"),
    ):
        calls = []
        _fake_tool(monkeypatch, _WLR_RANDR_TEXT, calls)
        assert agent.apply_rotation_wayland(rotation, None, {}) == "HDMI-A-1"
        assert ["wlr-randr", "--output", "HDMI-A-1", "--transform", transform] in [
            c for c, _ in calls
        ]


def test_apply_rotation_wayland_ignores_invalid(monkeypatch):
    calls = []
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT, calls)
    assert agent.apply_rotation_wayland("sideways", None, {}) is None
    assert calls == []


def test_apply_rotation_dispatches_on_stack(monkeypatch):
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "wayland")
    monkeypatch.setattr(
        agent, "apply_rotation_wayland", lambda r, o=None, env=None: "WAY"
    )
    assert agent.apply_rotation("left") == "WAY"


def test_apply_mode_wayland_sets_mode_with_rate(monkeypatch):
    calls = []
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT, calls)
    argv = agent.apply_mode_wayland("HDMI-1", "1920x1080@60", {})
    assert argv == [
        "wlr-randr", "--output", "HDMI-A-1", "--mode", "1920x1080@60Hz"
    ]
    assert [c for c, _ in calls][-1] == argv


def test_apply_mode_wayland_plain_mode(monkeypatch):
    _fake_tool(monkeypatch, _WLR_RANDR_TEXT)
    assert agent.apply_mode_wayland(None, "1280x720", {}) == [
        "wlr-randr", "--output", "HDMI-A-1", "--mode", "1280x720"
    ]


def test_apply_mode_dispatches_on_stack(monkeypatch):
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "wayland")
    monkeypatch.setattr(
        agent, "apply_mode_wayland", lambda o, r, env=None: ["wlr-randr"]
    )
    assert agent.apply_mode("HDMI-1", "1920x1080") == ["wlr-randr"]
    # Neither configured: no-op on both stacks.
    assert agent.apply_mode(None, None) is None


# --- cog stack (WPE WebKit on DRM/KMS) ---------------------------------------
# cog has no X/Wayland session to talk to. Panel power and rotation go through
# /usr/local/bin/calvin-cog-panel.sh via sudo; the unit is stopped before the
# framebuffer is blanked because cog holds DRM master.


def test_display_stack_accepts_cog():
    assert agent.display_stack({"CALVIN_DISPLAY_STACK": "cog"}) == "cog"
    # An explicit setting still wins over a stale session environment.
    assert agent.display_stack(
        {"CALVIN_DISPLAY_STACK": "cog", "XDG_SESSION_TYPE": "wayland",
         "WAYLAND_DISPLAY": "wayland-0"}
    ) == "cog"


def test_apply_on_dispatches_to_cog(monkeypatch):
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "cog")
    monkeypatch.setattr(agent, "apply_on_cog", lambda on, env=None: "cog")
    assert agent.apply_on(False) == "cog"
    assert agent.apply_on(True) == "cog"


def test_apply_on_cog_runs_the_root_helper(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    assert agent.apply_on_cog(False) == "cog"
    assert calls == [["sudo", "-n", agent.COG_PANEL_HELPER, "off"]]
    calls.clear()
    assert agent.apply_on_cog(True) == "cog"
    assert calls == [["sudo", "-n", agent.COG_PANEL_HELPER, "on"]]


def test_apply_on_cog_reports_none_when_helper_fails(monkeypatch):
    monkeypatch.setattr(
        agent.subprocess, "run",
        lambda cmd, **kw: SimpleNamespace(returncode=1, stdout="", stderr="nope"),
    )
    assert agent.apply_on_cog(True) == "none"


def test_cog_rotation_mapping_is_xrandr_ccw():
    # Calvin rotation names are xrandr's: left = 90 degrees counter-clockwise.
    # cog's rotation parameter is also counter-clockwise quarter turns.
    assert agent.COG_ROTATIONS["normal"] == 0
    assert agent.COG_ROTATIONS["left"] == 1
    assert agent.COG_ROTATIONS["inverted"] == 2
    assert agent.COG_ROTATIONS["right"] == 3


def test_apply_rotation_cog_runs_helper_for_each_rotation(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(agent.subprocess, "run", fake_run)
    for rotation, value in (
        ("normal", "0"), ("left", "1"), ("inverted", "2"), ("right", "3")
    ):
        assert agent.apply_rotation_cog(rotation) == "cog"
    assert calls == [
        ["sudo", "-n", agent.COG_PANEL_HELPER, "rotate", value]
        for value in ("0", "1", "2", "3")
    ]


def test_apply_rotation_cog_ignores_invalid(monkeypatch):
    calls = []
    monkeypatch.setattr(
        agent.subprocess, "run", lambda *a, **k: calls.append(a)
    )
    assert agent.apply_rotation_cog("sideways") is None
    assert calls == []


def test_apply_rotation_dispatches_to_cog(monkeypatch):
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "cog")
    monkeypatch.setattr(agent, "apply_rotation_cog", lambda r, env=None: "cog")
    assert agent.apply_rotation("left") == "cog"


def test_apply_mode_is_a_noop_on_cog(monkeypatch):
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "cog")

    def boom(*a, **k):  # xrandr/wlr-randr must never run on cog
        raise AssertionError("mode tool called on the cog stack")

    monkeypatch.setattr(agent.subprocess, "run", boom)
    assert agent.apply_mode("HDMI-1", "1920x1080") is None
    assert agent.apply_mode(None, None) is None


def test_cog_skips_the_cdp_watchdog():
    # cog restarts its own web process (--webprocess-failure=restart) and has no
    # Chromium DevTools endpoint, so the CLV-25 watchdog must not run there.
    assert agent.watchdog_applies("cog") is False
    assert agent.watchdog_applies("x11") is True
    assert agent.watchdog_applies("wayland") is True


# --- crash-page recovery (CLV-25) -------------------------------------------
# Only the renderer died on the Pi 3B+, not the browser, so systemd's Restart=
# never fired and the kiosk stayed on "Aw, Snap!". The agent probes Chromium's
# remote-debugging endpoint on localhost and restarts the kiosk unit when the
# page stops answering. Every helper takes its I/O as an argument so the suite
# never opens a socket, runs systemctl or signals a process.

import signal  # noqa: E402  (kept next to the tests that assert on signals)

WATCHDOG_ENV = (
    "CALVIN_KIOSK_WATCHDOG",
    "CALVIN_KIOSK_CDP_PORT",
    "CALVIN_KIOSK_WATCHDOG_SECONDS",
    "CALVIN_KIOSK_WATCHDOG_FAILURES",
    "CALVIN_KIOSK_WATCHDOG_COOLDOWN",
)
PAGE_WS = "ws://127.0.0.1:9222/devtools/page/1"


def _clear_watchdog_env(monkeypatch):
    for key in WATCHDOG_ENV:
        monkeypatch.delenv(key, raising=False)


def _unit(active=True, pid=4242, uptime=600, unit="calvin-kiosk-remote.service"):
    return {
        "unit": unit,
        "active": active,
        "main_pid": pid,
        "uptime_seconds": uptime,
    }


def _never(unit):  # a restart that must not happen
    raise AssertionError(f"restarted {unit} unexpectedly")


def _recorder(store):
    """A restart stub that records the unit and reports success."""

    def restart(unit):
        store.append(unit)
        return True

    return restart


def test_watchdog_config_defaults(monkeypatch):
    _clear_watchdog_env(monkeypatch)
    assert agent.kiosk_watchdog_config() == {
        "enabled": True,
        "port": 9222,
        "interval": 30,
        "failures": 3,
        "cooldown": 300,
        "backoff_max": 900,
    }


def test_watchdog_config_reads_environment(monkeypatch):
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG", "0")
    monkeypatch.setenv("CALVIN_KIOSK_CDP_PORT", "9333")
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_SECONDS", "15")
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_FAILURES", "5")
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_COOLDOWN", "60")
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_BACKOFF_MAX", "900")
    assert agent.kiosk_watchdog_config() == {
        "enabled": False,
        "port": 9333,
        "interval": 15,
        "failures": 5,
        "cooldown": 60,
        "backoff_max": 900,
    }


@pytest.mark.parametrize("value", ["off", "false", "no", "0", "OFF"])
def test_watchdog_enabled_accepts_false_spellings(monkeypatch, value):
    _clear_watchdog_env(monkeypatch)
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG", value)
    assert agent.kiosk_watchdog_config()["enabled"] is False


def test_watchdog_enabled_by_default_and_when_blank(monkeypatch):
    _clear_watchdog_env(monkeypatch)
    assert agent.kiosk_watchdog_config()["enabled"] is True
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG", "")
    assert agent.kiosk_watchdog_config()["enabled"] is True
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG", "1")
    assert agent.kiosk_watchdog_config()["enabled"] is True


def test_watchdog_backoff_cap_never_shrinks_below_the_base_cooldown(monkeypatch):
    _clear_watchdog_env(monkeypatch)
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_COOLDOWN", "300")
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_BACKOFF_MAX", "30")
    assert agent.kiosk_watchdog_config()["backoff_max"] == 300


def test_watchdog_config_ignores_garbage(monkeypatch):
    _clear_watchdog_env(monkeypatch)
    monkeypatch.setenv("CALVIN_KIOSK_CDP_PORT", "99999")  # not a port
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_SECONDS", "0")  # too eager
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_FAILURES", "many")
    monkeypatch.setenv("CALVIN_KIOSK_WATCHDOG_COOLDOWN", "-5")
    cfg = agent.kiosk_watchdog_config()
    assert cfg["port"] == 9222
    assert cfg["interval"] == 5
    assert cfg["failures"] == 3
    assert cfg["cooldown"] == 0


# --- the CDP probe: WebSocket framing ---------------------------------------
def test_ws_accept_key_matches_the_rfc6455_vector():
    assert (
        agent.ws_accept_key("dGhlIHNhbXBsZSBub25jZQ==")
        == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
    )


def test_ws_encode_text_is_masked_and_framed():
    frame = agent.ws_encode_text(b"hi", mask=b"\x01\x02\x03\x04")
    assert frame[0] == 0x81  # FIN + text
    assert frame[1] == 0x80 | 2  # MASK + length
    assert frame[2:6] == b"\x01\x02\x03\x04"
    assert frame[6:] == bytes([ord("h") ^ 1, ord("i") ^ 2])


def test_ws_encode_text_uses_the_extended_length_fields():
    two_byte = agent.ws_encode_text(b"x" * 126, mask=b"\0\0\0\0")
    assert two_byte[1] == 0x80 | 126
    assert int.from_bytes(two_byte[2:4], "big") == 126
    eight_byte = agent.ws_encode_text(b"x" * 70000, mask=b"\0\0\0\0")
    assert eight_byte[1] == 0x80 | 127
    assert int.from_bytes(eight_byte[2:10], "big") == 70000
    assert len(eight_byte) == 10 + 4 + 70000


def _reader(data):
    """A _WSReader over a scripted byte stream (recv hands out what is left)."""
    buf = {"left": data}

    def recv(n):
        out, buf["left"] = buf["left"][:n], buf["left"][n:]
        return out

    return agent._WSReader(recv)


def test_ws_read_frame_decodes_text():
    assert agent.ws_read_frame(_reader(b"\x81\x02hi")) == (0x1, b"hi")


def test_ws_read_frame_unmasks_and_spans_recv_calls():
    payload = bytes([ord("h") ^ 5, ord("i") ^ 6])
    frame = b"\x81\x82\x05\x06\x07\x08" + payload
    # _WSReader.exact() asks for small chunks, so the frame arrives in pieces.
    assert agent.ws_read_frame(_reader(frame)) == (0x1, b"hi")


def test_ws_read_frame_returns_control_frames():
    assert agent.ws_read_frame(_reader(b"\x89\x00")) == (0x9, b"")


def test_ws_read_frame_raises_on_truncated_stream():
    with pytest.raises(EOFError):
        agent.ws_read_frame(_reader(b"\x81\x05h"))


class _FakeSocket:
    """Scripted stand-in for socket.create_connection()'s return value."""

    def __init__(self, chunks):
        self.chunks = list(chunks)
        self.sent = b""
        self.timeouts = []
        self.closed = False

    def settimeout(self, timeout):
        self.timeouts.append(timeout)

    def sendall(self, data):
        self.sent += data

    def recv(self, n):
        return self.chunks.pop(0) if self.chunks else b""

    def close(self):
        self.closed = True


def _server_text(payload):
    return b"\x81" + bytes([len(payload)]) + payload


HANDSHAKE_OK = (
    b"HTTP/1.1 101 Switching Protocols\r\n"
    b"Upgrade: websocket\r\n"
    b"Connection: Upgrade\r\n"
    b"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n"
)


def _cdp_socket(*replies):
    import json as _json  # local: only the tests build CDP payloads

    chunks = [HANDSHAKE_OK] + [_server_text(_json.dumps(r).encode()) for r in replies]
    return _FakeSocket(chunks)


def _cdp(sock, expression="1+1"):
    return agent.cdp_eval(
        PAGE_WS,
        expression,
        connect=lambda host, port, timeout: sock,
        key="dGhlIHNhbXBsZSBub25jZQ==",
    )


def _sent_text(sock):
    """The client's text frame, unmasked (clients mask their frames)."""
    frame = sock.sent.split(b"\r\n\r\n", 1)[1]
    length = frame[1] & 0x7F
    mask = frame[2:6]
    payload = frame[6 : 6 + length]
    return bytes(b ^ mask[i % 4] for i, b in enumerate(payload))


def test_cdp_eval_true_when_the_page_answers():
    sock = _cdp_socket({"id": 1, "result": {"result": {"type": "number", "value": 2}}})
    assert _cdp(sock) is True
    assert b'"Runtime.evaluate"' in _sent_text(sock)
    assert b"GET /devtools/page/1 HTTP/1.1" in sock.sent
    assert sock.closed is True


def test_cdp_eval_false_on_a_refused_handshake():
    sock = _FakeSocket([b"HTTP/1.1 403 Forbidden\r\n\r\n"])
    assert _cdp(sock) is False


def test_cdp_eval_false_on_a_wrong_accept_key():
    bad = HANDSHAKE_OK.replace(b"s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", b"not-the-accept")
    sock = _FakeSocket([bad])
    assert _cdp(sock) is False


def test_cdp_eval_false_on_a_target_error():
    sock = _cdp_socket({"id": 1, "error": {"code": -32000, "message": "Target closed"}})
    assert _cdp(sock) is False


def test_cdp_eval_false_when_the_stream_ends():
    sock = _FakeSocket([HANDSHAKE_OK])  # no frame ever arrives
    assert _cdp(sock) is False


def test_cdp_eval_false_when_the_host_refuses():
    def refuse(host, port, timeout):
        raise OSError("connection refused")

    assert agent.cdp_eval(PAGE_WS, connect=refuse) is False


def test_cdp_page_target_picks_the_page():
    targets = [
        {"type": "browser", "webSocketDebuggerUrl": "ws://x/browser"},
        {"type": "service_worker", "webSocketDebuggerUrl": "ws://x/sw"},
        {"type": "page", "url": "http://tower:8000/", "webSocketDebuggerUrl": PAGE_WS},
    ]
    assert agent.cdp_page_target(9222, fetch=lambda u, t: targets) == PAGE_WS


def test_cdp_page_target_none_without_a_page():
    assert agent.cdp_page_target(9222, fetch=lambda u, t: []) is None
    assert agent.cdp_page_target(9222, fetch=lambda u, t: "nonsense") is None


# --- the health verdict ------------------------------------------------------
def test_probe_page_unreachable_when_nothing_listens():
    def closed(url, timeout):
        raise OSError("connection refused")

    assert agent.probe_page(9222, fetch=closed) == agent.PAGE_UNREACHABLE


def test_probe_page_unreachable_for_a_non_chromium_json_response():
    # Only a JSON *array* (Chromium's target list) is evidence of Chromium. Some
    # other server answering with a JSON object must not make us kill the kiosk.
    assert agent.probe_page(9222, fetch=lambda u, t: {"hello": "world"}) == (
        agent.PAGE_UNREACHABLE
    )


def test_probe_page_dead_without_a_page_target():
    targets = [{"type": "browser", "webSocketDebuggerUrl": "ws://x/browser"}]
    assert agent.probe_page(9222, fetch=lambda u, t: targets) == agent.PAGE_DEAD


def test_probe_page_dead_for_an_empty_chromium_target_list():
    # CLV-35: the renderer can die before it ever appears as a page target, so
    # Chromium answers with an empty list. That is still Chromium answering, and
    # the page is dead - it must not be mistaken for "nothing listens here".
    assert agent.probe_page(9222, fetch=lambda u, t: []) == agent.PAGE_DEAD


def test_probe_page_unreachable_for_a_json_array_that_is_not_chromium():
    # Only Chromium's target list (objects with a `type`) is evidence; some other
    # server returning a JSON array must stay fail-safe.
    assert (
        agent.probe_page(9222, fetch=lambda u, t: ["hello"]) == agent.PAGE_UNREACHABLE
    )
    assert (
        agent.probe_page(9222, fetch=lambda u, t: [{"hello": "world"}])
        == agent.PAGE_UNREACHABLE
    )


def test_probe_page_dead_when_evaluate_fails():
    targets = [{"type": "page", "webSocketDebuggerUrl": PAGE_WS}]
    assert (
        agent.probe_page(
            9222, fetch=lambda u, t: targets, evaluate=lambda ws, timeout: False
        )
        == agent.PAGE_DEAD
    )


def test_probe_page_ok_when_evaluate_answers():
    targets = [{"type": "page", "webSocketDebuggerUrl": PAGE_WS}]
    seen = []

    def evaluate(ws, timeout):
        seen.append((ws, timeout))
        return True

    assert (
        agent.probe_page(9222, fetch=lambda u, t: targets, evaluate=evaluate)
        == agent.PAGE_OK
    )
    assert seen == [(PAGE_WS, agent.WATCHDOG_TIMEOUT)]


def test_probe_page_dead_when_evaluate_raises():
    targets = [{"type": "page", "webSocketDebuggerUrl": PAGE_WS}]

    def boom(ws, timeout):
        raise OSError("target closed")

    assert agent.probe_page(9222, fetch=lambda u, t: targets, evaluate=boom) == (
        agent.PAGE_DEAD
    )


# --- the decision: one probe at a time ---------------------------------------
def test_watchdog_step_healthy_page_resets_the_count():
    state = {"failures": 2, "last_restart": None}
    assert agent.watchdog_step(state, agent.PAGE_OK, None, restart=_never, now=1.0) == (
        "ok"
    )
    assert state["failures"] == 0


def test_watchdog_step_never_restarts_without_a_cdp_endpoint():
    # No remote-debugging endpoint (older unit file, non-kiosk host): the port
    # never answers, so the watchdog must stay out of the way forever.
    state = agent.new_watchdog_state()
    for i in range(10):
        action = agent.watchdog_step(
            state,
            agent.PAGE_UNREACHABLE,
            _unit(),
            restart=_never,
            now=float(i),
        )
        assert action == "unreachable"
    assert state["failures"] == 0


def test_watchdog_step_restarts_after_consecutive_dead_probes():
    state = {"failures": 0, "last_restart": None}
    restarted = []
    steps = [
        (1000.0, "waiting"),
        (1030.0, "waiting"),
        (1060.0, "restarted"),
    ]
    for now, expected in steps:
        action = agent.watchdog_step(
            state, agent.PAGE_DEAD, _unit(), restart=_recorder(restarted), now=now
        )
        assert action == expected
    assert restarted == ["calvin-kiosk-remote.service"]
    assert state["failures"] == 0
    assert state["last_restart"] == 1060.0


def test_watchdog_step_healthy_probe_clears_the_count():
    state = {"failures": 2, "last_restart": None}
    assert agent.watchdog_step(state, agent.PAGE_OK, None, restart=_never, now=0) == (
        "ok"
    )
    assert state["failures"] == 0
    assert (
        agent.watchdog_step(state, agent.PAGE_DEAD, _unit(), restart=_never, now=5)
        == "waiting"
    )
    assert state["failures"] == 1


def test_watchdog_step_arms_on_a_page_that_was_never_alive():
    # CLV-35: the renderer crashed before the watchdog ever saw the page alive,
    # so no PAGE_OK ever arrives. Three dead probes must still arm recovery.
    state = agent.new_watchdog_state()
    restarted = []

    def restart(unit):
        restarted.append(unit)
        return True

    actions = [
        agent.watchdog_step(state, agent.PAGE_DEAD, _unit(), restart=restart, now=now)
        for now in (1000.0, 1030.0, 1060.0)
    ]
    assert actions == ["waiting", "waiting", "restarted"]
    assert restarted == ["calvin-kiosk-remote.service"]


def test_watchdog_step_unreachable_never_restarts_but_keeps_the_evidence():
    # A crashed renderer can stall Chromium's DevTools endpoint for a probe or
    # two. That must never trigger a restart on its own (fail-safe), but it must
    # not erase the dead-page evidence either: the page may never have answered.
    state = {"failures": 1, "last_restart": None}
    assert (
        agent.watchdog_step(state, agent.PAGE_DEAD, _unit(), restart=_never, now=0)
        == "waiting"
    )
    assert state["failures"] == 2
    assert (
        agent.watchdog_step(
            state, agent.PAGE_UNREACHABLE, _unit(), restart=_never, now=30
        )
        == "unreachable"
    )
    assert state["failures"] == 2
    restarted = []
    assert (
        agent.watchdog_step(
            state, agent.PAGE_DEAD, _unit(), restart=_recorder(restarted), now=60
        )
        == "restarted"
    )
    assert restarted == ["calvin-kiosk-remote.service"]


def test_watchdog_step_respects_the_cooldown():
    state = {"failures": 3, "last_restart": 1000.0}
    assert (
        agent.watchdog_step(
            state, agent.PAGE_DEAD, _unit(), restart=_never, now=1100.0
        )
        == "cooldown"
    )
    assert state["failures"] == 3
    assert (
        agent.watchdog_step(
            state, agent.PAGE_DEAD, _unit(), restart=lambda u: True, now=1300.0
        )
        == "restarted"
    )


def _fail_until_restart(state, restart, now, **over):
    """Give the state the failures a dead page needs, then take one step."""
    state["failures"] = 3
    return agent.watchdog_step(
        state, agent.PAGE_DEAD, _unit(), restart=restart, now=now, **over
    )


def test_watchdog_restart_backoff_doubles_and_caps():
    state = {"failures": 0, "last_restart": None, "restarts": 0}
    restarted = []
    restart = _recorder(restarted)

    # 1st restart, then the wait is one base cooldown (300s).
    assert _fail_until_restart(state, restart, 1000.0, backoff_max=1000.0) == (
        "restarted"
    )
    assert state["restarts"] == 1
    assert (
        _fail_until_restart(state, restart, 1299.0, backoff_max=1000.0) == "cooldown"
    )
    assert _fail_until_restart(state, restart, 1300.0, backoff_max=1000.0) == (
        "restarted"
    )
    assert state["restarts"] == 2

    # 2nd restart doubles the wait to 600s, so 1600 is still too early.
    assert (
        _fail_until_restart(state, restart, 1899.0, backoff_max=1000.0) == "cooldown"
    )
    assert _fail_until_restart(state, restart, 1900.0, backoff_max=1000.0) == (
        "restarted"
    )
    assert state["restarts"] == 3

    # 3rd restart would wait 1200s; the cap holds it at 1000s.
    assert (
        _fail_until_restart(state, restart, 2899.0, backoff_max=1000.0) == "cooldown"
    )
    assert _fail_until_restart(state, restart, 2900.0, backoff_max=1000.0) == (
        "restarted"
    )
    assert state["restarts"] == 4
    assert restarted == ["calvin-kiosk-remote.service"] * 4


def test_watchdog_healthy_page_resets_the_backoff():
    state = {"failures": 2, "last_restart": 1000.0, "restarts": 3}
    assert agent.watchdog_step(state, agent.PAGE_OK, None, restart=_never, now=1100) == (
        "ok"
    )
    assert state["restarts"] == 0
    # The next crash waits one base cooldown again, not 4x.
    assert _fail_until_restart(state, _recorder([]), 1299.0) == "cooldown"
    assert _fail_until_restart(state, _recorder([]), 1300.0) == "restarted"


def test_watchdog_step_leaves_a_stopped_or_starting_unit_alone():
    state = {"failures": 0, "last_restart": None}
    assert (
        agent.watchdog_step(
            state, agent.PAGE_DEAD, _unit(active=False), restart=_never, now=0
        )
        == "idle"
    )
    assert (
        agent.watchdog_step(
            state, agent.PAGE_DEAD, _unit(uptime=30), restart=_never, now=0
        )
        == "warmup"
    )
    assert (
        agent.watchdog_step(state, agent.PAGE_DEAD, None, restart=_never, now=0)
        == "idle"
    )
    assert state["failures"] == 0


def test_watchdog_step_backs_off_when_the_restart_fails():
    state = {"failures": 3, "last_restart": None}
    assert (
        agent.watchdog_step(
            state, agent.PAGE_DEAD, _unit(), restart=lambda u: False, now=50.0
        )
        == "restart-failed"
    )
    assert state["last_restart"] == 50.0  # no hammering: the cooldown applies
    assert state["failures"] == 0


def test_watchdog_step_honours_a_custom_threshold():
    state = {"failures": 0, "last_restart": None}
    restarted = []
    for now in (0.0, 10.0):
        agent.watchdog_step(
            state,
            agent.PAGE_DEAD,
            _unit(),
            restart=_recorder(restarted),
            now=now,
            failures_needed=2,
        )
    assert restarted == ["calvin-kiosk-remote.service"]


# --- systemd: which unit, is it healthy, restart it -------------------------
def test_unit_state_parses_systemctl_show():
    out = (
        "ActiveState=active\n"
        "MainPID=4242\n"
        "ActiveEnterTimestampMonotonic=1000000000\n"
    )
    argv_seen = []

    def run(argv):
        argv_seen.append(argv)
        return SimpleNamespace(returncode=0, stdout=out, stderr="")

    state = agent.kiosk_unit_state(
        "calvin-kiosk-remote.service", run=run, monotonic=lambda: 1001.0
    )
    assert state["active"] is True
    assert state["main_pid"] == 4242
    assert state["uptime_seconds"] == pytest.approx(1.0)
    assert argv_seen[0][:2] == ["systemctl", "show"]
    assert "calvin-kiosk-remote.service" in argv_seen[0]


def test_unit_state_inactive_and_without_a_pid():
    out = "ActiveState=inactive\nMainPID=0\nActiveEnterTimestampMonotonic=0\n"

    def run(argv):
        return SimpleNamespace(returncode=0, stdout=out, stderr="")

    state = agent.kiosk_unit_state("u", run=run, monotonic=lambda: 5.0)
    assert state["active"] is False
    assert state["main_pid"] == 0
    assert state["uptime_seconds"] is None


def test_unit_state_systemctl_failure_is_inactive():
    def missing(argv):
        raise FileNotFoundError("systemctl")

    assert agent.kiosk_unit_state("u", run=missing)["active"] is False

    def failed(argv):
        return SimpleNamespace(returncode=1, stdout="", stderr="no such unit")

    assert agent.kiosk_unit_state("u", run=failed)["active"] is False


def test_watched_kiosk_unit_falls_back_to_the_all_in_one_unit():
    def state(unit):
        return _unit(unit=unit, active=unit == "calvin-kiosk.service")

    assert agent.watched_kiosk_unit(state=state)["unit"] == "calvin-kiosk.service"
    assert agent.watched_kiosk_unit(state=lambda u: _unit(active=False)) is None


def test_pid_in_unit_reads_the_cgroup():
    def read(path):
        return "0::/system.slice/calvin-kiosk-remote.service\n"

    assert agent.pid_in_unit(42, "calvin-kiosk-remote.service", read=read) is True
    assert agent.pid_in_unit(42, "calvin-kiosk.service", read=read) is False


def test_pid_in_unit_false_when_proc_is_gone():
    def read(path):
        raise FileNotFoundError(path)

    assert agent.pid_in_unit(42, "calvin-kiosk-remote.service", read=read) is False


def test_pid_alive_reads_the_proc_state():
    assert agent.pid_alive(42, read=lambda p: "42 (chromium) S 1 2 3") is True
    assert agent.pid_alive(42, read=lambda p: "42 (chromium) Z 1 2 3") is False
    assert agent.pid_alive(42, read=lambda p: "42 (my (yes)) R 1 2 3") is True
    assert agent.pid_alive(42, read=lambda p: "malformed") is True


def test_pid_alive_false_when_proc_is_gone():
    def gone(path):
        raise FileNotFoundError(path)

    assert agent.pid_alive(42, read=gone) is False


def _signals():
    calls = []

    def kill(pid, sig):
        calls.append(("kill", pid, sig))

    def killpg(pid, sig):
        calls.append(("killpg", pid, sig))

    return calls, kill, killpg


def test_restart_refuses_a_stopped_unit():
    calls, kill, killpg = _signals()
    ok = agent.restart_kiosk_unit(
        "u",
        state=lambda unit: _unit(active=False, pid=0),
        kill=kill,
        killpg=killpg,
        sleep=lambda s: None,
    )
    assert ok is False
    assert calls == []


def test_restart_refuses_a_pid_outside_the_unit():
    calls, kill, killpg = _signals()
    ok = agent.restart_kiosk_unit(
        "u",
        state=lambda unit: _unit(),
        in_unit=lambda pid, unit: False,
        kill=kill,
        killpg=killpg,
        sleep=lambda s: None,
    )
    assert ok is False
    assert calls == []


def test_restart_signals_the_whole_service_group():
    calls, kill, killpg = _signals()
    ok = agent.restart_kiosk_unit(
        "u",
        state=lambda unit: _unit(),
        in_unit=lambda pid, unit: True,
        getpgid=lambda pid: pid,
        kill=kill,
        killpg=killpg,
        alive=lambda pid: not calls,  # dies once signalled
        sleep=lambda s: None,
    )
    assert ok is True
    assert calls == [("killpg", 4242, signal.SIGTERM)]


def test_restart_escalates_to_sigkill_when_the_browser_ignores_sigterm():
    calls, kill, killpg = _signals()
    ok = agent.restart_kiosk_unit(
        "u",
        state=lambda unit: _unit(),
        in_unit=lambda pid, unit: True,
        getpgid=lambda pid: pid,
        kill=kill,
        killpg=killpg,
        alive=lambda pid: True,  # never dies
        sleep=lambda s: None,
        grace_seconds=2.0,
    )
    assert ok is True
    assert calls[0] == ("killpg", 4242, signal.SIGTERM)
    assert calls[-1] == ("killpg", 4242, signal.SIGKILL)


def test_restart_signals_only_the_pid_without_its_own_group():
    calls, kill, killpg = _signals()
    agent.restart_kiosk_unit(
        "u",
        state=lambda unit: _unit(),
        in_unit=lambda pid, unit: True,
        getpgid=lambda pid: 999,  # shared with something else: never killpg
        kill=kill,
        killpg=killpg,
        alive=lambda pid: not calls,  # dies once signalled
        sleep=lambda s: None,
    )
    assert calls == [("kill", 4242, signal.SIGTERM)]


# --- the loop ---------------------------------------------------------------
def test_run_watchdog_restarts_the_unit_after_three_dead_probes():
    probes = iter([agent.PAGE_DEAD] * 3 + [agent.PAGE_OK])
    restarted = []
    slept = []
    agent.run_watchdog(
        9222,
        30,
        failures_needed=3,
        cooldown=300,
        iterations=4,
        probe=lambda: next(probes, agent.PAGE_OK),
        state=lambda unit: _unit(unit=unit),
        restart=_recorder(restarted),
        sleep=slept.append,
        clock=lambda: 1000.0,
        watchdog_state={"failures": 0, "last_restart": None},
    )
    assert restarted == ["calvin-kiosk-remote.service"]
    assert slept == [30, 30, 30, 30]


def test_run_watchdog_never_restarts_when_cdp_never_answers(capsys):
    restarted = []
    slept = []
    agent.run_watchdog(
        9222,
        30,
        failures_needed=3,
        cooldown=300,
        iterations=50,
        probe=lambda: agent.PAGE_UNREACHABLE,  # disabled, missing flag, old Chromium
        state=lambda unit: _unit(),
        restart=_recorder(restarted),
        sleep=slept.append,
        clock=lambda: 1.0,
    )
    assert restarted == []
    assert len(slept) == 50
    out = capsys.readouterr().out
    assert out.count("crash recovery is idle") == 1


def test_run_watchdog_restarts_only_after_cdp_reports_a_dead_page():
    probes = iter([agent.PAGE_UNREACHABLE] * 5 + [agent.PAGE_DEAD] * 3)
    restarted = []
    agent.run_watchdog(
        9222,
        30,
        failures_needed=3,
        cooldown=300,
        iterations=8,
        probe=lambda: next(probes, agent.PAGE_OK),
        state=lambda unit: _unit(),
        restart=_recorder(restarted),
        sleep=lambda s: None,
        clock=lambda: 1000.0,
    )
    assert restarted == ["calvin-kiosk-remote.service"]


def test_run_watchdog_restarts_a_page_that_was_never_alive():
    # CLV-35: DevTools only came up after the renderer had already crashed, and
    # it flapped in and out. Recovery must still arm on the dead probes.
    probes = iter(
        [
            agent.PAGE_UNREACHABLE,
            agent.PAGE_DEAD,
            agent.PAGE_UNREACHABLE,
            agent.PAGE_DEAD,
            agent.PAGE_DEAD,
        ]
    )
    restarted = []
    agent.run_watchdog(
        9222,
        30,
        failures_needed=3,
        cooldown=300,
        iterations=5,
        probe=lambda: next(probes),
        state=lambda unit: _unit(),
        restart=_recorder(restarted),
        sleep=lambda s: None,
        clock=lambda: 1000.0,
    )
    assert restarted == ["calvin-kiosk-remote.service"]


def test_watchdog_crash_loop_backs_off_to_fifteen_minutes(capsys):
    # A page that crashes on every load must not restart-loop: the wait doubles
    # from the base cooldown and stops at the 15-minute default cap, and every
    # restart after the first says so loudly.
    state = agent.new_watchdog_state()
    restarted = []
    waits = []
    now = 0.0
    for _ in range(5):
        state["failures"] = 3
        assert (
            agent.watchdog_step(
                state,
                agent.PAGE_DEAD,
                _unit(),
                restart=_recorder(restarted),
                now=now,
            )
            == "restarted"
        )
        wait = agent.next_cooldown(
            state["restarts"],
            agent.WATCHDOG_DEFAULT_COOLDOWN,
            agent.WATCHDOG_DEFAULT_BACKOFF_MAX,
        )
        waits.append(wait)
        now += wait + 1
    assert waits == [300, 600, 900, 900, 900]
    out = capsys.readouterr().out
    assert "crash loop" in out
    assert out.count("crash loop") == 4  # every restart after the first


def test_http_json_never_sends_the_loopback_probe_through_a_proxy(monkeypatch):
    # A proxy in the kiosk's environment must not swallow the DevTools probe:
    # that would look like "no endpoint" forever and disarm recovery.
    seen = {}

    class FakeResponse(io.StringIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    class FakeOpener:
        def open(self, url, timeout=None):
            seen["url"] = url
            seen["timeout"] = timeout
            return FakeResponse('["ok"]')

    monkeypatch.setattr(agent, "_LOOPBACK_OPENER", FakeOpener())
    assert agent._http_json("http://127.0.0.1:9222/json/list", 3) == ["ok"]
    assert seen == {"url": "http://127.0.0.1:9222/json/list", "timeout": 3}


def test_cdp_targets_returns_none_for_a_non_chromium_array():
    assert agent.cdp_targets(9222, fetch=lambda u, t: ["nope"]) is None


def test_cdp_targets_accepts_an_empty_target_list():
    assert agent.cdp_targets(9222, fetch=lambda u, t: []) == []


def test_run_watchdog_survives_probe_errors():
    def boom():
        raise OSError("socket timeout")

    slept = []
    agent.run_watchdog(
        9222,
        30,
        failures_needed=3,
        cooldown=300,
        iterations=2,
        probe=boom,
        state=lambda unit: _unit(),
        restart=_never,
        sleep=slept.append,
    )
    assert slept == [30, 30]


def test_start_watchdog_runs_in_a_daemon_thread():
    seen = []
    thread = agent.start_watchdog(
        9222,
        5,
        failures_needed=3,
        cooldown=300,
        iterations=1,
        probe=lambda: seen.append("probe") or agent.PAGE_OK,
        state=lambda unit: _unit(),
        restart=_never,
        sleep=lambda s: None,
    )
    thread.join(2)
    assert seen == ["probe"]
    assert thread.daemon is True
    assert not thread.is_alive()
