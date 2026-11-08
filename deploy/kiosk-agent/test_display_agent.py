import importlib.util
import io
import os
import threading
import time as time_module
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace

from pathlib import Path

import pytest

_MOD = os.path.join(os.path.dirname(__file__), "calvin_display_agent.py")
_spec = importlib.util.spec_from_file_location("calvin_display_agent", _MOD)
agent = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(agent)

TZ_PLUS_2 = timezone(timedelta(hours=2))


def _local(day=11, hour=9, minute=0):
    """A 2026-07-11/12 datetime in a fixed UTC+2 zone (Stockholm in summer)."""
    return datetime(2026, 7, day, hour, minute, tzinfo=TZ_PLUS_2)


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


@pytest.fixture
def stockholm_local_time():
    """Run a test with a known system zone for naive-datetime behaviour."""
    previous = os.environ.get("TZ")
    os.environ["TZ"] = "Europe/Stockholm"
    time_module.tzset()
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = previous
        time_module.tzset()


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


# desired_on — "Screen now" overrides the schedule until its next boundary
def test_desired_on_override_off_wins_during_on_window():
    cfg = _cfg(screen_now={"power": "off", "setAt": "2026-07-11T06:00:00Z"})
    assert agent.desired_on(cfg, _local(hour=9)) is False


def test_desired_on_override_on_wins_during_off_window():
    cfg = _cfg(screen_now={"power": "on", "setAt": "2026-07-11T21:00:00Z"})
    assert agent.desired_on(cfg, _local(hour=23, minute=30)) is True


def test_desired_on_expired_override_is_ignored():
    """After the first boundary after setAt the schedule rules again."""
    cfg = _cfg(screen_now={"power": "on", "setAt": "2026-07-11T05:00:00Z"})
    assert agent.desired_on(cfg, _local(hour=23)) is False


def test_desired_on_override_at_its_boundary_is_expired():
    cfg = _cfg(screen_now={"power": "on", "setAt": "2026-07-11T05:00:00Z"})
    assert agent.desired_on(cfg, _local(hour=21, minute=59)) is True
    assert agent.desired_on(cfg, _local(hour=22)) is False


def test_desired_on_override_survives_without_a_schedule():
    """No schedule: the manual choice stays until it is changed."""
    cfg = _cfg(
        display_schedule_enabled=False,
        screen_now={"power": "off", "setAt": "2026-07-11T09:00:00Z"},
    )
    assert agent.desired_on(cfg, _local(hour=23)) is False


def test_desired_on_camelcase_override_key():
    cfg = _cfg(screenNow={"power": "off", "setAt": "2026-07-11T07:00:00Z"})
    assert agent.desired_on(cfg, _local(hour=9)) is False


def test_desired_on_malformed_override_is_ignored():
    cfg = _cfg(screen_now={"power": "sideways", "setAt": "2026-07-11T07:00:00Z"})
    assert agent.desired_on(cfg, _local(hour=9)) is True


def test_desired_on_override_without_setat_is_ignored():
    cfg = _cfg(screen_now={"power": "off"})
    assert agent.desired_on(cfg, _local(hour=9)) is True


def test_desired_on_naive_setat_is_read_as_utc():
    """Legacy/naive setAt must not be read as local wall time."""
    cfg = _cfg(screen_now={"power": "on", "setAt": "2026-07-11T20:30:00"})
    # 20:30Z is 22:30 local: the next boundary is 06:00, so the override holds.
    # Read as 20:30 local it would already have expired at 22:00.
    assert agent.desired_on(cfg, _local(hour=23)) is True


def test_override_expiry_and_seconds_to_next_boundary_agree():
    cfg = _cfg(screen_now={"power": "off", "setAt": "2026-07-11T06:00:00Z"})
    now = _local(hour=9)
    expiry = agent.override_expiry(cfg, now)
    assert expiry == _local(hour=22)
    assert int((expiry - now).total_seconds()) == agent.seconds_to_next_boundary(cfg, now)


def test_next_boundary_excludes_now_exactly_on_a_boundary():
    cfg = _cfg()  # 06:00-22:00
    assert agent.seconds_to_next_boundary(cfg, _local(hour=6)) == 16 * 3600
    assert agent.seconds_to_next_boundary(cfg, _local(hour=22)) == 8 * 3600


def test_naive_now_matches_aware_now_for_a_utc_setat(stockholm_local_time):
    """A naive `now` (the old now_in fallback) is local; setAt stays UTC."""
    cfg = _cfg(screen_now={"power": "on", "setAt": "2026-07-11T20:30:00Z"})
    naive = datetime(2026, 7, 11, 23, 0)  # 23:00 in Stockholm
    aware = naive.astimezone()  # the same instant, aware in the system zone
    assert agent.desired_on(cfg, naive) is True
    assert agent.desired_on(cfg, aware) is True
    assert agent.seconds_to_next_boundary(cfg, naive) == 7 * 3600
    assert agent.seconds_to_next_boundary(cfg, aware) == 7 * 3600


def test_reconcile_applies_then_expires_to_the_schedule():
    """An override takes effect, then the schedule resumes at its boundary."""
    cfg = _cfg(screen_now={"power": "on", "setAt": "2026-07-11T07:00:00Z"})
    applied = []

    last = agent.reconcile(
        cfg, _local(hour=9), None, applier=lambda on: applied.append(on)
    )
    assert last is True and applied == [True]

    last = agent.reconcile(
        cfg, _local(hour=21), last, applier=lambda on: applied.append(on)
    )
    assert last is True and applied == [True]

    last = agent.reconcile(
        cfg, _local(hour=22), last, applier=lambda on: applied.append(on)
    )
    assert last is False and applied == [True, False]


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


def test_now_in_is_aware_when_no_tz():
    n = agent.now_in({"timezone": None})
    assert n.tzinfo is not None


def test_run_sleeps_min_of_boundary_and_refresh(monkeypatch):
    # desired OFF at 23:00; next boundary 06:00 (7h) but refresh caps to 900s
    # (an explicit CALVIN_DISPLAY_REFRESH_SECONDS override)
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
    monkeypatch.setattr(
        agent, "run", lambda url, refresh, **kw: seen.append(refresh)
    )
    agent.main()
    monkeypatch.setenv("CALVIN_DISPLAY_REFRESH_SECONDS", "900")
    agent.main()
    assert seen == [agent.DEFAULT_REFRESH_SECONDS, 900]


def test_schedule_edit_mid_interval_applies_on_next_poll(monkeypatch):
    # 12:00, panel ON (06-22 window, next boundary 10 h away). The owner then
    # edits the schedule so 12:00 falls in the off window; the next poll, at
    # most DEFAULT_REFRESH_SECONDS (<= 60 s) later, blanks the panel.
    # calvin-g4gi: owners expect a schedule edit to take effect within ~60 s.
    assert agent.DEFAULT_REFRESH_SECONDS <= 60
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


def test_config_url_appends_display_stack():
    url = agent._config_url("http://s:8000", "k1", "pi", kstack="cog")
    assert "kstack=cog" in url


def test_fetch_config_reports_the_display_stack(monkeypatch, tmp_path):
    """The agent tells the backend which display stack it runs (calvin-2ibz)."""
    monkeypatch.setenv("CALVIN_KIOSK_ID", "k1")
    monkeypatch.setenv("CALVIN_KIOSK_HOSTNAME", "pi")
    monkeypatch.setenv("CALVIN_DISPLAY_STACK", "cog")
    monkeypatch.setattr(agent, "running_version", lambda: "v9")
    monkeypatch.setattr(agent, "touch_ready", lambda: None)
    seen = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b"{}"

    def fake_urlopen(url, timeout=None):
        seen["url"] = url
        return FakeResponse()

    monkeypatch.setattr(agent.urllib.request, "urlopen", fake_urlopen)

    agent.fetch_config("http://s:8000")

    assert "kstack=cog" in seen["url"]


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


# --- per-screen brightness ramp (calvin-29ws) --------------------------------
# The agent owns brightness over DDC/CI: dim before sleep, settle then ramp
# back up after wake, and never write when the ramp is off. Every helper takes
# its writer/fault probe/clock/sleep as arguments, so this suite never runs
# ddcutil, vcgencmd, journalctl or systemctl.

DETECT_OUTPUT = """\
Display 1
   I2C bus:  /dev/i2c-2
   DRM connector:           card0-HDMI-A-1
   EDID synopsis:
      Mfg id:               LOG
      Model:                NOMAD TOUCH
      Serial number:
   VCP version:         2.1
"""


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


class FakeDdc:
    def __init__(self, bus=2, ok=True, on_write=None):
        self.bus = bus
        self.ok = ok
        self.writes = []
        self.on_write = on_write
        self.detect_info = {
            "bus": bus,
            "model": "NOMAD TOUCH",
            "connector": "card0-HDMI-A-1",
            "vcp_version": "2.1",
        }

    def available(self):
        return self.bus is not None

    def detect(self, refresh=False):
        return dict(self.detect_info)

    def set_brightness(self, level):
        if not self.ok:
            return False
        self.writes.append(level)
        if self.on_write is not None:
            self.on_write(level)
        return True

    def read_brightness(self):
        return None


class FakeFault:
    def __init__(self):
        self.faults = []

    def arm(self):
        self.faults = []

    def new_faults(self):
        return list(self.faults)

    def __call__(self):
        return bool(self.faults)


def _ramp_cfg(**over):
    base = {
        "display_schedule_enabled": True,
        "display_schedule": _sched(),
        "timezone": None,
        "brightness_ramp_enabled": True,
        "brightness": 19,
    }
    base.update(over)
    return base


def _controller(ddc=None, fault=None, clock=None):
    clock = clock or FakeClock()
    applied = []
    controller = agent.BrightnessController(
        ddc=ddc or FakeDdc(),
        fault=fault or FakeFault(),
        clock=clock,
        sleep=clock.sleep,
        applier=lambda on: applied.append(on) or "cog",
        connected=lambda: True,
        cog=lambda: True,
    )
    return controller, clock, applied


def _steps(writes):
    return [abs(b - a) for a, b in zip(writes, writes[1:])]


# -- config keys --------------------------------------------------------------
def test_brightness_settings_defaults_are_safe():
    settings = agent.brightness_settings({})
    assert settings["enabled"] is False
    assert settings["brightness"] is None
    assert settings["limit"] is None
    assert settings["step"] == 2
    assert settings["step_seconds"] == 1.5
    assert settings["conversion"] == []
    assert settings["sleep_mode"] == "standby"


def test_brightness_settings_accept_camel_and_snake_case():
    camel = agent.brightness_settings(
        {
            "brightnessRampEnabled": True,
            "brightness": 19,
            "brightnessLimit": 26,
            "brightnessStep": 3,
            "brightnessStepSeconds": 2,
            "brightnessConversion": [{"ddc": 5, "menu": 28}],
            "sleepMode": "dim",
        }
    )
    snake = agent.brightness_settings(
        {
            "brightness_ramp_enabled": True,
            "brightness": 19,
            "brightness_limit": 26,
            "brightness_step": 3,
            "brightness_step_seconds": 2,
            "brightness_conversion": [{"ddc": 5, "menu": 28}],
            "sleep_mode": "dim",
        }
    )
    assert camel == snake
    assert camel["enabled"] is True
    assert camel["limit"] == 26
    assert camel["step"] == 3
    assert camel["step_seconds"] == 2.0
    assert camel["sleep_mode"] == "dim"
    assert camel["conversion"] == [{"ddc": 5, "menu": 28}]


def test_brightness_settings_clamp_unsafe_values():
    settings = agent.brightness_settings(
        {
            "brightness": 250,
            "brightness_limit": -4,
            "brightness_step": 40,  # one big step reset the touch controller
            "brightness_step_seconds": 0,
            "sleep_mode": "nonsense",
        }
    )
    assert settings["brightness"] == 100
    assert settings["limit"] == 0
    assert settings["step"] == agent.BRIGHTNESS_STEP_MAX
    assert settings["step_seconds"] == agent.BRIGHTNESS_INTERVAL_MIN
    assert settings["sleep_mode"] == "standby"


def test_brightness_target_is_capped_at_the_limit():
    settings = agent.brightness_settings(
        {"brightness_ramp_enabled": True, "brightness": 50, "brightness_limit": 26}
    )
    assert agent.brightness_target(settings) == 26
    # Slider asks above the cap: the agent never steps above it.
    assert agent.brightness_target(settings, fault_ceiling=20) == 20


def test_brightness_target_defaults_to_ddc_twenty():
    settings = agent.brightness_settings({"brightness_ramp_enabled": True})
    assert agent.brightness_target(settings) == 20
    low = agent.brightness_settings(
        {"brightness_ramp_enabled": True, "brightness_limit": 18}
    )
    assert agent.brightness_target(low) == 18  # the limit is the ceiling


def test_menu_estimate_fits_the_owner_readings():
    settings = agent.brightness_settings(
        {
            "brightness_conversion": [
                {"ddc": 5, "menu": 28},
                {"ddc": 19, "menu": 61},
            ]
        }
    )
    assert agent.menu_estimate(settings, 5) == pytest.approx(28)
    assert agent.menu_estimate(settings, 19) == pytest.approx(61)
    assert agent.menu_estimate(settings, None) is None
    assert agent.menu_estimate(agent.brightness_settings({}), 10) is None


# -- ddcutil access -----------------------------------------------------------
def test_parse_ddcutil_detect_reads_bus_model_and_connector():
    info = agent.parse_ddcutil_detect(DETECT_OUTPUT)
    assert info == {
        "bus": 2,
        "model": "NOMAD TOUCH",
        "connector": "card0-HDMI-A-1",
        "vcp_version": "2.1",
    }


def test_parse_ddcutil_brightness():
    assert agent.parse_ddcutil_brightness("VCP 10 C current value =  19") == 19
    assert agent.parse_ddcutil_brightness("nonsense") is None


def test_ddc_controller_detects_once_uses_bus_and_caches_it(tmp_path):
    calls = []

    def run(argv, timeout=20):
        calls.append(argv)
        if argv[:2] == ["ddcutil", "detect"]:
            return SimpleNamespace(returncode=0, stdout=DETECT_OUTPUT, stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    ddc = agent.DdcController(run=run, state_dir=str(tmp_path))
    assert ddc.set_brightness(19) is True
    assert calls == [
        ["ddcutil", "detect"],
        ["ddcutil", "--bus", "2", "setvcp", "10", "19"],
    ]
    # A fresh process reads the cached bus instead of paying for detect again.
    calls.clear()
    again = agent.DdcController(run=run, state_dir=str(tmp_path))
    assert again.ensure_bus() == 2
    assert calls == []


def test_ddc_controller_reports_no_display_without_calling_setvcp(tmp_path):
    calls = []

    def run(argv, timeout=20):
        calls.append(argv)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    ddc = agent.DdcController(run=run, state_dir=str(tmp_path))
    assert ddc.set_brightness(19) is False
    assert calls == [["ddcutil", "detect"]]


def test_ddc_write_failure_is_reported(tmp_path):
    def run(argv, timeout=20):
        if argv[:2] == ["ddcutil", "detect"]:
            return SimpleNamespace(returncode=0, stdout=DETECT_OUTPUT, stderr="")
        return SimpleNamespace(returncode=1, stdout="", stderr="i2c error")

    ddc = agent.DdcController(run=run, state_dir=str(tmp_path))
    assert ddc.set_brightness(19) is False


def test_kernel_fault_lines_match_brownout_and_resets():
    text = (
        "usb 1-1.2: reset full-speed USB device number 4\n"
        "hci0: over-current change\n"
        "Under-voltage detected! (0x00050005)\n"
        "unrelated kernel line\n"
    )

    def run(argv, timeout=10):
        return SimpleNamespace(returncode=0, stdout=text, stderr="")

    lines = agent.kernel_fault_lines(1000, run=run)
    assert any("reset" in line for line in lines)
    assert any("over-current" in line for line in lines)
    assert any("Under-voltage" in line for line in lines)
    assert all("unrelated" not in line for line in lines)


def test_vcgencmd_under_voltage_bit_zero():
    def run(argv, timeout=5):
        return SimpleNamespace(returncode=0, stdout="throttled=0x50001\n", stderr="")

    assert agent.vcgencmd_under_voltage(run) is True

    def historical_only(argv, timeout=5):
        # Bits 16 and 18 are historical; only bit 0 means under-voltage now.
        return SimpleNamespace(returncode=0, stdout="throttled=0x50000\n", stderr="")

    assert agent.vcgencmd_under_voltage(historical_only) is False

    def clean(argv, timeout=5):
        return SimpleNamespace(returncode=0, stdout="throttled=0x0\n", stderr="")

    assert agent.vcgencmd_under_voltage(clean) is False


def test_fault_monitor_returns_only_new_kernel_lines():
    lines = {"text": ""}
    clock = FakeClock()

    def run(argv, timeout=10):
        return SimpleNamespace(returncode=0, stdout=lines["text"], stderr="")

    monitor = agent.FaultMonitor(run=run, clock=clock)
    monitor.arm()
    lines["text"] = "Under-voltage detected!\n"
    # vcgencmd is also called through the same runner; an empty stdout is clean.
    assert monitor.new_faults() == ["Under-voltage detected!"]
    assert monitor.new_faults() == []


def test_drm_connector_connected_and_cog_active():
    def listing(path):
        return ["card0-HDMI-A-1", "card0-DP-1"]

    statuses = {
        "/sys/class/drm/card0-HDMI-A-1/status": "connected\n",
        "/sys/class/drm/card0-DP-1/status": "disconnected\n",
    }
    assert (
        agent.drm_connector_connected(
            listing=listing, read=lambda p: statuses[p]
        )
        is True
    )
    statuses["/sys/class/drm/card0-HDMI-A-1/status"] = "disconnected\n"
    assert (
        agent.drm_connector_connected(
            listing=listing, read=lambda p: statuses[p]
        )
        is False
    )

    def active(argv, timeout=5):
        return SimpleNamespace(returncode=0, stdout="active\n", stderr="")

    assert agent.cog_active(active) is True


# -- the ramp -----------------------------------------------------------------
def test_ramp_down_reaches_zero_in_steps():
    clock = FakeClock()
    writes = []
    outcome = agent.ramp_brightness(
        19,
        0,
        write=lambda level: writes.append(level) or True,
        sleep=clock.sleep,
        step=2,
        step_seconds=1.5,
    )
    assert writes == [17, 15, 13, 11, 9, 7, 5, 3, 1, 0]
    assert max(_steps(writes)) <= 2
    assert outcome["level"] == 0


def test_ramp_up_reaches_target_in_steps():
    clock = FakeClock()
    writes = []
    outcome = agent.ramp_brightness(
        0,
        19,
        write=lambda level: writes.append(level) or True,
        sleep=clock.sleep,
        step=2,
        step_seconds=1.5,
    )
    assert writes == [2, 4, 6, 8, 10, 12, 14, 16, 18, 19]
    assert max(_steps([0] + writes)) <= 2
    assert outcome["level"] == 19


def test_ramp_fault_stops_steps_back_two_steps_and_records_the_limit():
    clock = FakeClock()
    writes = []
    state = {"level": 0}

    def write(level):
        writes.append(level)
        state["level"] = level
        return True

    outcome = agent.ramp_brightness(
        0,
        30,
        write=write,
        fault=lambda: state["level"] >= 26,
        sleep=clock.sleep,
        step=2,
        step_seconds=1.5,
    )
    # Fault at 26: limit is 24 (the last fine level), then two steps back to 22.
    assert outcome["fault"] is not None
    assert outcome["limit"] == 24
    assert outcome["ceiling"] == 22
    assert outcome["level"] == 22
    assert writes[-2:] == [24, 22]
    assert max(_steps(writes)) <= 2


def test_ramp_down_keeps_going_after_a_fault():
    clock = FakeClock()
    writes = []
    state = {"level": 40}

    def write(level):
        writes.append(level)
        state["level"] = level
        return True

    outcome = agent.ramp_brightness(
        40,
        0,
        write=write,
        fault=lambda: state["level"] <= 30,
        sleep=clock.sleep,
        step=2,
        step_seconds=1.5,
    )
    assert outcome["fault"] is not None
    assert outcome["level"] == 0
    assert writes[-1] == 0


def test_ramp_down_fault_backoff_never_overshoots_a_nonzero_target():
    writes = []
    outcome = agent.ramp_brightness(
        24,
        19,
        write=lambda level: writes.append(level) or True,
        fault=lambda: True,
        sleep=lambda seconds: None,
        step=2,
    )
    assert outcome["level"] == 19
    assert writes == [22, 20, 19]
    assert min(writes) == 19


def test_ramp_can_be_cancelled_cleanly():
    clock = FakeClock()
    writes = []
    calls = {"n": 0}

    def cancel():
        calls["n"] += 1
        return calls["n"] > 3

    outcome = agent.ramp_brightness(
        0,
        20,
        write=lambda level: writes.append(level) or True,
        sleep=clock.sleep,
        step=2,
        step_seconds=1.5,
        cancel=cancel,
    )
    assert outcome["cancelled"] is True
    assert len(writes) <= 3
    assert outcome["level"] == writes[-1]


def test_ramp_does_nothing_when_already_at_target():
    writes = []
    outcome = agent.ramp_brightness(
        19, 19, write=lambda level: writes.append(level) or True
    )
    assert writes == []
    assert outcome["steps"] == 0


# -- settle -------------------------------------------------------------------
def test_wait_for_settle_needs_five_quiet_seconds():
    clock = FakeClock()
    outcome = agent.wait_for_settle(
        fault_monitor=FakeFault(),
        connected=lambda: True,
        cog=lambda: True,
        clock=clock,
        sleep=clock.sleep,
        poll=1.0,
    )
    assert outcome["settled"] is True
    assert clock.t >= agent.SETTLE_QUIET_SECONDS


def test_wait_for_settle_resets_on_a_fault_and_caps_at_thirty_seconds():
    clock = FakeClock()
    fault = FakeFault()
    probes = {"n": 0}

    class Flapping:
        def new_faults(self):
            probes["n"] += 1
            return ["Undervoltage detected"] if probes["n"] < 4 else []

    outcome = agent.wait_for_settle(
        fault_monitor=Flapping(),
        connected=lambda: True,
        cog=lambda: True,
        clock=clock,
        sleep=clock.sleep,
        poll=1.0,
    )
    assert outcome["settled"] is True
    assert clock.t >= 4

    stuck = FakeClock()
    outcome = agent.wait_for_settle(
        fault_monitor=fault,
        connected=lambda: False,
        cog=lambda: True,
        clock=stuck,
        sleep=stuck.sleep,
        poll=1.0,
    )
    assert outcome["timed_out"] is True
    assert stuck.t >= agent.SETTLE_TIMEOUT_SECONDS


# -- the controller -----------------------------------------------------------
def test_sleep_with_ramp_dims_to_zero_then_powers_off():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.level = 19
    last = controller.reconcile(_ramp_cfg(), _local(hour=23), True)
    assert last is False
    assert applied == [False]
    assert ddc.writes[-1] == 0
    assert max(_steps([19] + ddc.writes)) <= 2
    assert controller.level == 0


def test_wake_with_ramp_settles_then_ramps_up():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.level = 0  # the panel slept at 0 (a known level)
    last = controller.reconcile(_ramp_cfg(), _local(hour=9), False)
    assert last is True
    assert applied == [True]
    assert ddc.writes == [2, 4, 6, 8, 10, 12, 14, 16, 18, 19]
    # The settle wait (5 s) happened before the first write.
    assert clock.t >= agent.SETTLE_QUIET_SECONDS
    assert controller.level == 19


def test_wake_ramp_never_exceeds_the_limit():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.reconcile(
        _ramp_cfg(brightness=50, brightness_limit=26), _local(hour=9), False
    )
    assert ddc.writes[-1] == 26  # the limit is the ceiling, not the chosen 50


def test_live_brightness_change_ramps_to_the_new_value_now():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    controller.reconcile(_ramp_cfg(), _local(hour=9), True)
    assert ddc.writes == []
    controller.reconcile(
        _ramp_cfg(brightness=31), _local(hour=10), True
    )
    assert ddc.writes == [21, 23, 25, 27, 29, 31]
    assert applied == []  # never touches panel power


def test_fault_during_wake_steps_back_and_caps_this_wake():
    fault = FakeFault()
    ddc = FakeDdc(
        on_write=lambda level: fault.faults.append("Under-voltage detected")
        if level >= 26
        else None
    )
    controller, clock, applied = _controller(ddc=ddc, fault=fault)
    controller.reconcile(
        _ramp_cfg(brightness=50), _local(hour=9), False
    )
    assert controller.last_fault is not None
    assert controller.last_limit == 24
    assert controller.level == 22

    # The same wake never tries above the ceiling again.
    before = len(ddc.writes)
    controller.reconcile(
        _ramp_cfg(brightness=50), _local(hour=10), True
    )
    assert ddc.writes[before:] == []
    assert controller.level == 22


def test_ramp_off_while_asleep_does_one_last_step_up_then_stops():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.level = 19
    controller.reconcile(_ramp_cfg(), _local(hour=23), True)
    assert controller.level == 0

    off_cfg = _ramp_cfg(brightness_ramp_enabled=False)
    controller.reconcile(off_cfg, _local(hour=23, minute=1), False)
    assert controller.pending_restore == 19

    before = len(ddc.writes)
    before_clock = clock.t
    controller.reconcile(off_cfg, _local(hour=9), False)  # the next wake
    # The one-last step-up is a wake ramp: it waits for the panel to settle too.
    assert clock.t - before_clock >= agent.SETTLE_QUIET_SECONDS
    once = ddc.writes[before:]
    assert once == [2, 4, 6, 8, 10, 12, 14, 16, 18, 19]
    assert controller.pending_restore is None
    assert applied == [False, True]  # standby wake still runs the normal power-on

    # After that single step-up the agent never touches brightness again.
    after = len(ddc.writes)
    controller.reconcile(
        _ramp_cfg(brightness_ramp_enabled=False, brightness=60),
        _local(hour=10),
        True,
    )
    assert ddc.writes[after:] == []


def test_ramp_off_and_no_diagnostics_never_calls_ddcutil():
    class BoomDdc:
        def available(self):
            raise AssertionError("ddcutil must not run with the ramp off")

        def set_brightness(self, level):
            raise AssertionError("ddcutil must not run with the ramp off")

    controller, clock, applied = _controller(ddc=BoomDdc())
    controller.reconcile(_cfg(), _local(hour=9), None)
    controller.reconcile(_cfg(), _local(hour=23), True)
    assert applied == [True, False]


def test_dim_sleep_never_powers_the_panel_off_and_wake_ramps_up():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    cfg = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim")

    assert controller.reconcile(cfg, _local(hour=23), True) is False
    assert applied == []  # no DPMS / cog stop
    assert ddc.writes[-1] == 0

    before = len(ddc.writes)
    assert controller.reconcile(cfg, _local(hour=9), False) is True
    assert applied == []  # still no panel helper
    assert ddc.writes[before:] == [2, 4, 6, 8, 10, 12, 14, 16, 18, 19]


def test_dim_sleep_at_agent_startup_does_not_power_cycle_on_wake():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.level = 19
    cfg = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim")

    assert controller.reconcile(cfg, _local(hour=23), None) is False
    assert applied == []
    before = len(ddc.writes)
    assert controller.reconcile(cfg, _local(hour=9), False) is True
    assert applied == []
    assert ddc.writes[before:] == [2, 4, 6, 8, 10, 12, 14, 16, 18, 19]


def test_dim_falls_back_to_standby_without_ddc():
    ddc = FakeDdc(bus=None)
    controller, clock, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    last = controller.reconcile(
        _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim"),
        _local(hour=23),
        True,
        )
    assert last is False
    assert applied == [False]  # standby off is the safe fallback
    assert ddc.writes == []


def test_switching_dim_to_standby_powers_off_at_the_next_sleep():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    dim = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim")
    controller.reconcile(dim, _local(hour=23), True)
    assert applied == []
    controller.reconcile(dim, _local(hour=9), False)  # wake

    controller.reconcile(
        _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="standby"),
        _local(hour=23),
        True,
    )
    assert applied == [False]


def test_switching_dim_to_standby_while_asleep_restores_brightness_on_wake():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    dim = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim")
    controller.reconcile(dim, _local(hour=23), True)
    assert controller.level == 0

    standby = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="standby")
    controller.reconcile(standby, _local(hour=23, minute=1), False)
    assert controller.pending_restore == 19
    assert applied == [False]  # standby off applies now (item 8)

    before = len(ddc.writes)
    assert controller.reconcile(standby, _local(hour=9), False) is True
    assert ddc.writes[before:] == [2, 4, 6, 8, 10, 12, 14, 16, 18, 19]
    assert controller.pending_restore is None
    assert applied == [False, True]  # and the wake powers it back on


def test_a_new_on_during_the_dim_cancels_and_brightens_back():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    cancels = {"n": 0}

    def cancel():
        cancels["n"] += 1
        return cancels["n"] > 3

    last = controller.reconcile(
        _ramp_cfg(), _local(hour=23), True, cancel=cancel
    )
    assert last is True  # never finished the off
    assert applied == []
    assert controller.reschedule is True
    assert controller.level == 13  # stopped where the cancel fired


# -- diagnostics job shape ----------------------------------------------------
def test_display_check_job_parses_the_proposed_config_shape():
    job = agent.display_check_job(
        {
            "displayCheck": {
                "id": "chk-1",
                "step": "conversion",
                "action": "start",
                "value": 19,
                "brightness": 19,
            }
        }
    )
    assert job == {
        "id": "chk-1",
        "step": "conversion",
        "action": "start",
        "value": 19,
        "brightness": 19,
        "ceiling": None,
        "seq": None,
        "panelLevel": None,
        "saved": False,
    }
    assert agent.display_check_job({"display_check": {"id": "x", "step": "limit"}})[
        "step"
    ] == "limit"
    assert agent.display_check_job({}) is None
    assert agent.display_check_job({"displayCheck": {"step": "detect"}}) is None


def test_display_check_report_url_and_post():
    assert (
        agent.display_check_report_url("http://h:8000/", "k1")
        == "http://h:8000/api/kiosks/k1/display-check"
    )
    seen = {}

    class Response:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    class Opener:
        def urlopen(self, request, timeout=None):
            seen["url"] = request.full_url
            seen["body"] = request.data
            return Response()

    assert agent.post_display_check(
        "http://h", {"id": "c1"}, kiosk_id="k1", opener=Opener()
    ) is True
    assert seen["url"] == "http://h/api/kiosks/k1/display-check"
    assert b'"c1"' in seen["body"]


# -- the diagnostics runner ---------------------------------------------------
def _runner(job, cfg, ddc, tmp_path, *, poll=None, panel_on=None, clock=None,
            known=None):
    clock = clock or FakeClock()
    reports = []
    runner = agent.DisplayCheckRunner(
        job,
        cfg,
        ddc=ddc,
        report=reports.append,
        poll=poll,
        clock=clock,
        sleep=clock.sleep,
        state_dir=str(tmp_path),
        panel_on=panel_on or (lambda: True),
    )
    if known is not None:
        # The level the agent itself last set: calibration's start level.
        runner.level = runner.last_set = known
    return runner, reports, clock


def test_runner_detect_reports_the_display(tmp_path):
    ddc = FakeDdc()
    job = {"id": "c1", "step": "detect", "action": "start", "value": None,
           "brightness": None}
    runner, reports, clock = _runner(job, _cfg(), ddc, tmp_path)
    runner.run()
    assert reports[-1]["status"] == "done"
    assert reports[-1]["info"]["model"] == "NOMAD TOUCH"
    assert ddc.writes == []  # detection never changes brightness


def test_runner_persists_each_level_so_a_reboot_can_finish_safely(tmp_path):
    ddc = FakeDdc()
    job = {"id": "c1", "step": "limit", "action": "start", "value": None,
           "brightness": 19}
    runner, reports, clock = _runner(job, _ramp_cfg(), ddc, tmp_path)
    assert runner._write_level(21) is True
    state = agent._load_state(str(tmp_path / agent.DISPLAY_CHECK_STATE))
    assert state["status"] == "running"
    assert state["level"] == 21


def test_runner_write_dims_then_returns(tmp_path):
    ddc = FakeDdc()
    job = {"id": "c1", "step": "write", "action": "start", "value": None,
           "brightness": 19}
    runner, reports, clock = _runner(job, _ramp_cfg(), ddc, tmp_path, known=19)
    runner.run()
    assert min(ddc.writes) == 9  # dimmed ten levels, can't overrun an unknown limit
    assert ddc.writes[-1] == 19
    assert reports[-1]["status"] == "done"


def test_runner_conversion_sets_the_value_and_waits(tmp_path):
    ddc = FakeDdc()
    job = {"id": "c1", "step": "conversion", "action": "start", "value": 19,
           "brightness": 19}
    runner, reports, clock = _runner(
        job, _ramp_cfg(), ddc, tmp_path, poll=_cfg, known=19  # job gone: dialog closed
    )
    runner.run()
    assert ddc.writes == []  # already at 19: nothing to write
    assert reports[-1]["status"] == "done"
    assert reports[-1]["level"] == 19






def test_runner_timeout_always_finishes_safely(tmp_path):
    ddc = FakeDdc()
    clock = FakeClock()
    job = {"id": "c1", "step": "conversion", "action": "start", "value": 19,
           "brightness": 19}
    # Keep offering the same job so the runner never sees it finish.
    same = {"displayCheck": dict(job)}
    runner, reports, clock = _runner(
        job, _ramp_cfg(), ddc, tmp_path, poll=lambda: same, clock=clock, known=19
    )
    runner.run()
    assert reports[-1]["status"] == "timeout"
    assert runner.level == agent.CHECK_FLOOR  # the end of life drops to the floor


def test_recover_display_check_after_a_reboot(tmp_path):
    ddc = FakeDdc()
    path = tmp_path / agent.DISPLAY_CHECK_STATE
    path.write_text(
        '{"id": "c1", "step": "write", "status": "running", '
        '"level": 28, "limit": 26, "log": []}'
    )
    reports = []
    payload = agent.recover_display_check(
        str(tmp_path),
        _ramp_cfg(),
        ddc=ddc,
        report=reports.append,
    )
    assert payload["status"] == "interrupted"
    assert payload["limit"] == 26  # the state file recorded it
    assert reports[-1]["status"] == "interrupted"
    assert ddc.writes[-1] == 19  # back to the chosen brightness
    assert not path.exists()


def test_recover_display_check_does_not_write_to_a_sleeping_panel(tmp_path):
    ddc = FakeDdc()
    (tmp_path / agent.DISPLAY_CHECK_STATE).write_text(
        '{"id": "c1", "step": "write", "status": "running", "level": 19}'
    )
    payload = agent.recover_display_check(
        str(tmp_path), _ramp_cfg(), ddc=ddc, panel_on=lambda: False
    )
    assert payload["status"] == "interrupted"
    assert ddc.writes == []


# -- the agent loop keeps the old behaviour unless the ramp is in use --------
def test_run_with_a_controller_never_touches_ddc_when_the_ramp_is_off(
    tmp_path, monkeypatch
):
    class BoomDdc:
        def available(self):
            raise AssertionError("ddcutil must not run with the ramp off")

        def set_brightness(self, level):
            raise AssertionError("ddcutil must not run with the ramp off")

    controller = agent.BrightnessController(
        ddc=BoomDdc(),
        state_dir=str(tmp_path),
        applier=lambda on: "cog",
    )
    applied = []
    controller.applier = lambda on: applied.append(on) or "cog"
    monkeypatch_cfg = _cfg()
    monkeypatch.setattr(agent, "now_in", lambda c: _local(hour=9))
    agent.run(
        "http://x",
        900,
        fetch=lambda url: monkeypatch_cfg,
        sleep=lambda s: None,
        iterations=2,
        apply_device=lambda cfg: None,
        brightness=controller,
    )
    assert applied == [True]  # on at startup, then no change


# -- fix round 1: the diagnostics thread must not race the main loop --------
def test_display_check_blocks_reconcile_ramps_and_keeps_the_step(tmp_path):
    """A live-apply while a check runs must not interleave a second ramp.

    The check owns the level until it finishes, so reconcile must skip all DDC
    work; otherwise two ramps interleave and a write can jump by more than one
    configured step (30 -> 14 -> 32).
    """
    writes = []
    reached = threading.Event()
    resume = threading.Event()

    def on_write(level):
        writes.append(level)
        if level == 30 and not reached.is_set():
            reached.set()
            resume.wait(2)  # pause the check's ramp mid-flight

    ddc = FakeDdc(on_write=on_write)
    controller, clock, applied = _controller(ddc=ddc)
    live_apply = _ramp_cfg(brightness=14)  # a lower value ramps *down*
    job = {"id": "c1", "step": "write", "action": "start",
           "value": None, "brightness": 19}
    runner, reports, rclock = _runner(job, _ramp_cfg(), ddc, tmp_path)
    runner.controller = controller
    runner.level = 0
    # A check is in progress (the runner owns the level until _finish).
    controller.check_running = True

    thread = threading.Thread(target=lambda: runner._ramp(30))
    thread.start()
    assert reached.wait(2), "the check ramp never reached level 30"
    try:
        # This is the very race: a live-apply poll arrives mid-check.
        controller.reconcile(live_apply, _local(hour=9), True)
    finally:
        resume.set()
    thread.join(2)
    assert not thread.is_alive()
    controller.check_running = False

    assert writes  # the check did ramp
    assert max(_steps([0] + writes)) <= 2  # never a jump > brightnessStep


def test_fault_monitor_never_loses_or_duplicates_lines_across_threads(monkeypatch):
    """Concurrent new_faults() calls must each see a line exactly once.

    A yield is forced *inside* the lines[self._seen:] slice, i.e. between the
    read of _seen and its update. Two threads racing there is exactly what
    swallows a fault line; the monitor's lock must serialize them.
    """
    lines = ["Under-voltage detected!", "usb 1-1.2: reset"]
    gate = threading.Event()

    class SlowLines(list):
        def __getitem__(self, key):
            gate.wait(2)  # release the GIL while new_faults is mid-slice
            return list.__getitem__(self, key)

    monkeypatch.setattr(
        agent, "kernel_fault_lines",
        lambda since, run=None: SlowLines(lines),
    )
    monitor = agent.FaultMonitor(
        run=lambda *a, **k: SimpleNamespace(
            returncode=0, stdout="", stderr=""
        ),
        clock=FakeClock(),
    )
    monitor.arm()
    collected = []
    started = threading.Barrier(3)

    def poll():
        started.wait()
        collected.extend(monitor.new_faults())

    threads = [threading.Thread(target=poll) for _ in range(2)]
    for t in threads:
        t.start()
    started.wait()
    time_module.sleep(0.05)  # let a worker reach the slice
    gate.set()
    for t in threads:
        t.join()
    assert sorted(collected) == sorted(lines)


# -- fix round 2 --------------------------------------------------------------
def _night_cfg(**over):
    return _ramp_cfg(**over)


def _check_job(step="limit", job_id="c1"):
    return {"id": job_id, "step": step, "action": "start", "value": None,
            "brightness": 19}


def test_display_check_refuses_a_sleeping_standby_panel(monkeypatch):
    """Item 2: a standby-off panel must not be written to by a check."""
    reports = []
    monkeypatch.setattr(
        agent, "post_display_check",
        lambda url, payload, **kw: reports.append(payload) or True,
    )
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    assert controller.reconcile(_ramp_cfg(), _local(hour=23), True) is False
    assert applied == [False] and controller.level == 0
    writes = list(ddc.writes)

    thread = agent.start_display_check(
        _check_job(), _ramp_cfg(), fetch=lambda url: _ramp_cfg(),
        backend_url="http://x", controller=controller, sleep=clock.sleep,
    )
    assert thread is None
    assert reports[-1]["status"] == "asleep"
    assert reports[-1]["id"] == "c1"
    assert ddc.writes == writes  # nothing written to the sleeping panel
    assert controller.level == 0
    assert controller.check_running is False


def test_display_check_refuses_a_dimmed_asleep_panel(monkeypatch):
    """Item 2: dim-asleep is asleep too; the backlight must stay at 0."""
    reports = []
    monkeypatch.setattr(
        agent, "post_display_check",
        lambda url, payload, **kw: reports.append(payload) or True,
    )
    ddc = FakeDdc()
    controller, clock, _applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    dim = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim")
    assert controller.reconcile(dim, _local(hour=23), True) is False
    assert controller.level == 0
    writes = list(ddc.writes)
    thread = agent.start_display_check(
        _check_job(), dim, fetch=lambda url: dim,
        backend_url="http://x", controller=controller, sleep=clock.sleep,
    )
    assert thread is None
    assert reports[-1]["status"] == "asleep"
    assert ddc.writes == writes
    assert controller.level == 0


def test_display_check_runner_gets_the_real_panel_state(monkeypatch):
    """Item 2: the runner's limit guard must see the live panel state."""
    seen = {}

    class Spy:
        def __init__(self, *a, **kw):
            seen.update(kw)

        def run(self):
            pass

    monkeypatch.setattr(agent, "DisplayCheckRunner", Spy)
    controller, clock, _ = _controller()
    controller.sleeping = False  # a transition succeeded: the panel is awake
    thread = agent.start_display_check(
        _check_job(), _ramp_cfg(), fetch=lambda url: _ramp_cfg(),
        backend_url="http://x", controller=controller, sleep=clock.sleep,
    )
    thread.join(2)
    assert seen["panel_on"]() is True
    controller.panel_off = True
    controller.sleeping = True
    assert seen["panel_on"]() is False


def test_boot_in_the_sleep_window_dims_to_zero_before_powering_off():
    """Item 3: an unknown level is written to 0 before the standby off."""
    order = []
    ddc = FakeDdc(on_write=lambda level: order.append(("w", level)))
    controller, _, _ = _controller(ddc=ddc)
    controller.applier = lambda on: order.append(("power", on)) or "cog"
    assert controller.reconcile(_ramp_cfg(), _local(hour=23), None) is False
    assert order == [("w", 0), ("power", False)]
    assert controller.level == 0


def test_dim_mode_boot_at_night_writes_zero():
    """Item 3: dim mode at boot must really take the backlight to 0."""
    ddc = FakeDdc()
    controller, _, applied = _controller(ddc=ddc)
    cfg = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim")
    assert controller.reconcile(cfg, _local(hour=23), None) is False
    assert ddc.writes == [0]
    assert controller.level == 0
    assert applied == []


def test_up_ramp_from_an_unknown_level_starts_at_zero_after_settle():
    """Item 3: never trust the pre-reboot DDC value."""
    ddc = FakeDdc()
    controller, _, _ = _controller(ddc=ddc)
    assert controller.level is None
    assert controller.reconcile(_ramp_cfg(), _local(hour=9), None) is True
    assert ddc.writes[0] == 0
    assert ddc.writes[1:] == [2, 4, 6, 8, 10, 12, 14, 16, 18, 19]


def _state(tmp_path, level=28, step="limit", limit="null"):
    (tmp_path / agent.DISPLAY_CHECK_STATE).write_text(
        f'{{"id": "c1", "step": "{step}", "status": "running", '
        f'"level": {level}, "limit": {limit}, "log": []}}'
    )


def test_recovery_runs_after_the_first_reconcile_with_an_armed_monitor(
    tmp_path, monkeypatch
):
    """Item 4a: recover only once the panel settled and the monitor is armed."""
    events = []

    class Fault(FakeFault):
        def arm(self):
            events.append(("arm", len(ddc.writes)))
            super().arm()

    ddc = FakeDdc(on_write=lambda level: events.append(("w", level)))
    controller, _, _ = _controller(ddc=ddc, fault=Fault())
    controller.state_dir = str(tmp_path)
    _state(tmp_path, step="write", limit="26")
    cfg = _ramp_cfg(brightness=40)
    monkeypatch.setattr(agent, "now_in", lambda c: _local(hour=9))
    agent.run(
        "http://x", 900, fetch=lambda url: cfg, sleep=lambda s: None,
        iterations=1, apply_device=lambda c: None, brightness=controller,
    )
    # the persisted run's limit (26) caps the wake ramp at 26
    # BEFORE it starts: it never rises above the limit and comes back down
    assert ddc.writes == [0] + list(range(2, 27, 2))
    assert ("arm", len(ddc.writes)) in events
    assert max(_steps(ddc.writes)) <= 2
    assert controller.level == 26
    assert not (tmp_path / agent.DISPLAY_CHECK_STATE).exists()


def test_recovery_records_the_ramps_actual_outcome(tmp_path):
    """Item 4b: a stopped ramp must not claim the target."""
    state = {"n": 0}

    def on_write(level):
        state["n"] += 1
        if state["n"] >= 2:
            ddc.ok = False

    ddc = FakeDdc(on_write=on_write)
    controller, _, _ = _controller(ddc=ddc)
    controller.panel_off = False
    _state(tmp_path, level=28, step="write")
    agent.recover_display_check(
        str(tmp_path), _ramp_cfg(), ddc=ddc, controller=controller,
        panel_on=lambda: True,
    )
    assert ddc.writes == [26, 24]
    assert controller.level == 24  # not the 19 target


def test_recovery_of_a_sleeping_panel_writes_zero_once_with_the_ramp_off(tmp_path):
    """Item 4c: the panel may still hold the check's level: write 0 once."""
    ddc = FakeDdc()
    controller, clock, _applied = _controller(ddc=ddc)
    controller.panel_off = True
    controller.sleeping = True
    off = _ramp_cfg(brightness_ramp_enabled=False)
    _state(tmp_path, level=28)
    agent.recover_display_check(
        str(tmp_path), off, ddc=ddc, controller=controller,
        panel_on=lambda: False,
    )
    assert ddc.writes == [0]
    assert controller.level == 0
    # the next wake does not bring it above 0 (the agent does not own it)
    assert controller.reconcile(off, _local(hour=9), False) is True
    assert ddc.writes == [0]


def test_recovery_of_a_sleeping_panel_with_a_failed_write_stays_unknown(tmp_path):
    ddc = FakeDdc(ok=False)
    controller, clock, _applied = _controller(ddc=ddc)
    controller.sleeping = True
    _state(tmp_path, level=28)
    agent.recover_display_check(
        str(tmp_path), _ramp_cfg(), ddc=ddc, controller=controller,
        panel_on=lambda: False,
    )
    assert controller.level is None


def test_a_failed_boot_off_counts_as_asleep_for_display_checks(monkeypatch):
    """Item D: until a transition succeeded the panel state is not 'awake'."""
    reports = []
    monkeypatch.setattr(
        agent, "post_display_check",
        lambda url, payload, **kw: reports.append(payload) or True,
    )
    ddc = FakeDdc()
    controller, clock, _applied = _controller(ddc=ddc)
    controller.applier = lambda on: "none"  # the boot OFF apply fails
    assert controller.reconcile(_ramp_cfg(), _local(hour=23), None) is None
    assert controller.sleeping is None
    writes = list(ddc.writes)
    thread = agent.start_display_check(
        _check_job(), _ramp_cfg(), fetch=lambda url: _ramp_cfg(),
        backend_url="http://x", controller=controller, sleep=clock.sleep,
    )
    assert thread is None
    assert reports[-1]["status"] == "asleep"
    assert ddc.writes == writes


def test_a_fault_from_the_last_up_step_is_caught():
    """Item 5: check once more after the final up-write."""
    writes = []
    clock = FakeClock()
    slept_after_final = {"v": False}

    def write(level):
        writes.append(level)
        return True

    def sleep(seconds):
        clock.sleep(seconds)
        if writes[-1:] == [4]:
            slept_after_final["v"] = True

    # the kernel only reports the trouble a moment after the last write
    def fault():
        return slept_after_final["v"] and writes.count(4) == 1

    outcome = agent.ramp_brightness(
        0, 4, write=write, fault=fault, sleep=sleep, step=2, step_seconds=1.5,
    )
    assert outcome["fault"]
    assert outcome["limit"] == 2
    assert writes == [2, 4, 2, 0]
    assert max(_steps([0] + writes)) <= 2


def test_the_journal_names_the_kernel_fault_line():
    fault = FakeFault()
    fault.faults = ["usb 1-1.2: reset high-speed USB device"]
    logs = []
    agent.ramp_brightness(
        0, 10, write=lambda level: True, fault=fault, sleep=lambda s: None,
        step=2, step_seconds=1.5, log_fn=logs.append,
    )
    line = next(m for m in logs if m.startswith("brightness: fault at"))
    assert "usb 1-1.2: reset high-speed USB device" in line
    assert "True" not in line


def test_switching_dim_to_standby_while_dimmed_powers_off_now():
    """Item 8: standby off applies at once, not at the next wake."""
    ddc = FakeDdc()
    controller, _, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    dim = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="dim")
    controller.reconcile(dim, _local(hour=23), True)
    assert applied == []
    standby = _ramp_cfg(brightness_ramp_enabled=False, sleep_mode="standby")
    last = controller.reconcile(standby, _local(hour=23, minute=1), False)
    assert last is False
    assert applied == [False]
    assert controller.panel_off is True


def test_ramp_cancel_polls_with_a_short_timeout_and_a_failure_is_not_a_cancel(
    monkeypatch,
):
    """Item 9: the per-step config check must not stall the ramp."""
    timeouts = []
    calls = {"n": 0}
    cfg = _ramp_cfg()

    def fake_fetch(url, kstat=None, kmsg=None, timeout=agent.HTTP_TIMEOUT):
        calls["n"] += 1
        if calls["n"] == 1:
            return cfg  # the main poll
        timeouts.append(timeout)
        raise OSError("backend down")

    monkeypatch.setattr(agent, "fetch_config", fake_fetch)
    ddc = FakeDdc()
    controller, _, applied = _controller(ddc=ddc)
    controller.panel_off = False
    controller.level = 19
    monkeypatch.setattr(agent, "now_in", lambda c: _local(hour=23))
    agent.run(
        "http://x", 900, fetch=agent.fetch_config, sleep=lambda s: None,
        iterations=1, apply_device=lambda c: None, brightness=controller,
    )
    assert timeouts and max(timeouts) <= 2
    assert ddc.writes[-1] == 0  # the ramp finished despite the failed checks
    assert applied == [False]


def test_post_display_check_warns_once_without_a_kiosk_id(monkeypatch, capsys):
    monkeypatch.delenv("CALVIN_KIOSK_ID", raising=False)
    monkeypatch.setattr(agent, "_warned_no_kiosk_id", False, raising=False)
    assert agent.post_display_check("http://x", {"id": "c1"}) is False
    assert agent.post_display_check("http://x", {"id": "c1"}) is False
    out = capsys.readouterr().out
    assert out.count("CALVIN_KIOSK_ID") == 1


# -- calibration v2 (calvin-c805) ---------------------------------------------
class ConsumingFault(FakeFault):
    """Like FaultMonitor: each fault line is reported once."""

    def new_faults(self):
        found, self.faults = list(self.faults), []
        return found


class ReadingDdc(FakeDdc):
    def __init__(self, read=None, **kw):
        super().__init__(**kw)
        self.read = read

    def read_brightness(self):
        return self.read


def _cal_job(step, value=None, ceiling=None, action="start"):
    return {"id": "c1", "step": step, "action": action, "value": value,
            "brightness": None, "ceiling": ceiling}


def _cal_runner(step, tmp_path, *, level=19, ddc=None, fault=None, value=None,
                ceiling=None, poll=None, cfg_over=None):
    """A runner with a controller, the screen's last set level known (or not)."""
    clock = FakeClock()
    fault = fault or ConsumingFault()
    ddc = ddc or FakeDdc()
    controller, _, _ = _controller(ddc, fault, clock)
    if level is not None:
        controller.set_level(level)
    reports = []
    runner = agent.DisplayCheckRunner(
        _cal_job(step, value, ceiling),
        _ramp_cfg(**(cfg_over or {})),
        ddc=ddc,
        report=reports.append,
        poll=poll,
        clock=clock,
        sleep=clock.sleep,
        state_dir=str(tmp_path),
        controller=controller,
    )
    return runner, reports, clock, ddc, fault


def _assert_small_steps(writes, step=2, exempt_first=False):
    """Safety (e): no write moves further than the configured step (0 excepted)."""
    previous = None
    for i, level in enumerate(writes):
        if previous is not None and level != 0 and not (exempt_first and i == 0):
            assert abs(level - previous) <= step, f"{previous} -> {level} in {writes}"
        previous = level


def test_display_check_job_carries_the_backend_ceiling():
    cfg = {"displayCheck": {"id": "c1", "step": "conversion", "value": 12, "ceiling": 14}}
    assert agent.display_check_job(cfg)["ceiling"] == 14
    cfg["displayCheck"].pop("ceiling")
    assert agent.display_check_job(cfg)["ceiling"] is None


# (c) preflight
def test_preflight_watches_for_ten_seconds_without_writing(tmp_path):
    seen = {}
    ddc = FakeDdc(on_write=lambda level: seen.setdefault("t", runner_clock.t))
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc)
    runner_clock = clock
    runner.run()
    assert seen["t"] >= agent.PREFLIGHT_SECONDS  # first write only after the watch
    pre = [r for r in reports if r.get("preflight")]
    assert pre and pre[0]["preflight"] == {"status": "clean", "faults": []}


def test_preflight_trouble_ends_the_run_before_any_write(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path)

    original = clock.sleep

    def sleep(seconds):
        original(seconds)
        if clock.t >= 4 and not fault.faults and not getattr(sleep, "done", False):
            sleep.done = True
            fault.faults.append("Under-voltage detected!")

    runner.sleep = sleep
    runner.run()
    assert ddc.writes == []
    final = reports[-1]
    assert final["status"] == "error"
    assert final["reason"] == "power_at_idle"
    assert final["preflight"]["status"] == "fault"
    assert "Under-voltage" in final["preflight"]["faults"][0]


# (a) calibration never writes above the start level
def test_write_step_from_a_known_start_dims_and_returns_never_above(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, level=19)
    runner.run()
    assert max(ddc.writes) <= 19
    assert min(ddc.writes) == 9
    assert ddc.writes[-1] == 19
    _assert_small_steps(ddc.writes)
    assert reports[-1]["start"] == {"level": 19, "known": True, "source": "last_set"}


def test_write_step_from_an_unknown_start_dims_to_the_floor_first(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, level=None)
    runner.run()
    assert ddc.writes[0] == agent.CHECK_FLOOR
    assert max(ddc.writes) <= agent.CHECK_FLOOR  # never above the floor it chose
    assert min(ddc.writes) == 0
    _assert_small_steps(ddc.writes, exempt_first=True)
    start = reports[-1]["start"]
    assert (start["level"], start["known"], start["source"]) == (5, False, None)


def test_a_read_back_that_matches_the_last_write_is_trusted(tmp_path):
    ddc = ReadingDdc(read=23)
    runner, reports, clock, ddc, fault = _cal_runner("detect", tmp_path, ddc=ddc, level=23)
    runner.run()
    assert reports[-1]["start"] == {"level": 23, "known": True, "source": "read"}
    assert reports[-1]["info"]["placeholderReads"] is False
    assert ddc.writes == []


def test_a_constant_non_zero_read_back_is_not_trusted(tmp_path):
    ddc = ReadingDdc(read=100)  # always 100 while the panel is really at 5
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, level=None)
    runner.run()
    assert reports[-1]["start"]["known"] is False
    assert reports[-1]["start"]["level"] == agent.CHECK_FLOOR
    assert ddc.writes[0] == agent.CHECK_FLOOR
    assert max(ddc.writes) <= agent.CHECK_FLOOR  # never the 5 -> 98 jump
    assert reports[-1]["info"]["placeholderReads"] is True if "info" in reports[-1] else True


def test_a_read_back_that_disagrees_with_the_last_write_is_a_placeholder(tmp_path):
    ddc = ReadingDdc(read=100)
    runner, reports, clock, ddc, fault = _cal_runner("detect", tmp_path, ddc=ddc, level=7)
    runner.run()
    assert reports[-1]["start"] == {"level": 7, "known": True, "source": "last_set"}
    assert reports[-1]["info"]["placeholderReads"] is True


def test_a_zero_read_back_is_a_placeholder(tmp_path):
    ddc = ReadingDdc(read=0)
    runner, reports, clock, ddc, fault = _cal_runner("detect", tmp_path, ddc=ddc, level=None)
    runner.run()
    assert reports[-1]["info"]["placeholderReads"] is True
    assert reports[-1]["start"] == {"level": None, "known": False, "source": None}


def test_detect_with_a_placeholder_read_uses_the_last_level_it_set(tmp_path):
    ddc = ReadingDdc(read=0)
    runner, reports, clock, ddc, fault = _cal_runner("detect", tmp_path, ddc=ddc, level=7)
    runner.run()
    assert reports[-1]["start"] == {"level": 7, "known": True, "source": "last_set"}
    assert reports[-1]["info"]["placeholderReads"] is True


def test_conversion_refuses_a_value_above_the_start_level(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("conversion", tmp_path, level=19, value=22)
    runner.run()
    assert all(w <= 19 for w in ddc.writes)
    assert reports[-1]["status"] == "error"
    assert reports[-1]["reason"] == "above_ceiling"


def test_conversion_refuses_above_the_backend_ceiling(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner(
        "conversion", tmp_path, level=19, value=13, ceiling=12
    )
    runner.run()
    assert reports[-1]["reason"] == "above_ceiling"
    assert max(ddc.writes, default=0) <= 19  # nothing was raised


# (b) a fault in steps 1-3 ends the run
def _fault_on_write(fault, ddc_ref, levels):
    def on_write(level):
        if level in levels and level not in on_write.seen:
            on_write.seen.add(level)
            fault.faults.append("Under-voltage detected!" if level == levels[0]
                                else "usb 1-1.1: reset full-speed USB device")

    on_write.seen = set()
    return on_write




def test_after_a_fault_the_run_settles_and_never_retries(tmp_path):
    fault = ConsumingFault()
    ddc = FakeDdc(on_write=_fault_on_write(fault, None, [13]))
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, fault=fault)
    writes_at = []
    inner = ddc.on_write
    ddc.on_write = lambda level: (inner(level), writes_at.append((clock.t, level)))
    runner.run()
    last_write_t = writes_at[-1][0]
    assert clock.t - last_write_t >= agent.SETTLE_QUIET_SECONDS  # held for clean power
    floor_writes = [w for w in ddc.writes if w == agent.CHECK_FLOOR]
    assert floor_writes  # went down to the floor
    assert ddc.writes[-1] == agent.CHECK_FLOOR  # nothing after: no retry, no raise
    assert len([r for r in reports if r["status"] in ("error", "done")]) >= 1


def test_settling_is_capped_when_the_power_never_clears(tmp_path):
    class Stubborn(ConsumingFault):
        def new_faults(self):
            return ["Under-voltage detected!"]

    runner, reports, clock, ddc, fault = _cal_runner(
        "write", tmp_path, fault=Stubborn(), ddc=FakeDdc()
    )
    runner.run()
    # The preflight itself already sees the stubborn fault: nothing is written.
    assert ddc.writes == []
    assert reports[-1]["reason"] == "power_at_idle"


def test_a_fault_while_waiting_on_a_conversion_value_ends_the_run(tmp_path):
    fault = ConsumingFault()
    job = _cal_job("conversion", 15)
    armed = {"on": False, "sent": False}
    ddc = FakeDdc(on_write=lambda level: armed.update(on=True) if level == 15 else None)

    def poll():
        # The screen reached the value; a moment later the supply browns out.
        if armed["on"] and not armed["sent"]:
            armed["sent"] = True
            fault.faults.append("Under-voltage detected!")
        return {"displayCheck": dict(job)}

    runner, reports, clock, ddc, fault = _cal_runner(
        "conversion", tmp_path, level=19, value=15, fault=fault, poll=poll, ddc=ddc
    )
    runner.run()
    final = reports[-1]
    assert final["status"] == "error"
    assert final["reason"] == "power_trouble"
    assert final["fault"]["step"] == "conversion"
    assert final["fault"]["level"] == 15
    assert ddc.writes[-1] == agent.CHECK_FLOOR






def test_finish_from_an_unknown_start_stays_at_the_floor(tmp_path):
    job = _cal_job("write")
    stop = {"on": False}
    ddc = FakeDdc(on_write=lambda level: stop.update(on=True) if level == 2 else None)

    def poll():
        return {"displayCheck": {**job, "action": "stop" if stop["on"] else "start"}}

    runner, reports, clock, ddc, fault = _cal_runner(
        "write", tmp_path, level=None, poll=poll, ddc=ddc
    )
    runner.run()
    assert reports[-1]["status"] == "stopped"
    assert ddc.writes[-1] <= agent.CHECK_FLOOR  # dropped, never climbing back up
    assert max(ddc.writes) <= agent.CHECK_FLOOR


def test_recovery_after_a_calibration_reboot_never_goes_above_the_start(tmp_path):
    ddc = FakeDdc()
    path = tmp_path / agent.DISPLAY_CHECK_STATE
    path.write_text(
        '{"id": "c1", "step": "write", "status": "running", '
        '"level": 9, "start": {"level": 12, "known": true, "source": "last_set"}, "log": []}'
    )
    agent.recover_display_check(str(tmp_path), _ramp_cfg(), ddc=ddc)
    assert ddc.writes[-1] == 12  # the configured brightness is 19: the start wins
    assert max(ddc.writes) <= 12

# --- calvin-r3wt: the agent's runtime state lives in its own calvin-owned subdir ---


def test_runtime_state_dir_is_a_subdir_of_the_updater_state_dir():
    assert agent.RUNTIME_STATE_DIR == os.path.join(agent.STATE_DIR, "agent")
    # The root-owned updater files stay where the updater writes them.
    assert agent.STATE_DIR == "/var/lib/calvin"


def test_default_ddc_and_brightness_state_use_the_runtime_dir():
    assert agent.DdcController().state_dir == agent.RUNTIME_STATE_DIR
    assert agent.BrightnessController().state_dir == agent.RUNTIME_STATE_DIR


def test_check_state_dir_writable_is_silent_when_writable(tmp_path):
    logs = []
    assert agent.check_state_dir_writable(str(tmp_path / "agent"), log_fn=logs.append)
    assert logs == []
    assert (tmp_path / "agent").is_dir()
    assert list((tmp_path / "agent").iterdir()) == []  # probe file cleaned up


def test_check_state_dir_writable_warns_once_and_keeps_going(tmp_path, monkeypatch):
    logs = []
    ro = tmp_path / "ro"
    ro.mkdir()

    def deny(*a, **k):
        raise PermissionError(13, "Permission denied")

    monkeypatch.setattr(agent.os, "makedirs", deny)
    monkeypatch.setattr("builtins.open", deny)
    assert agent.check_state_dir_writable(str(ro / "agent"), log_fn=logs.append) is False
    assert len(logs) == 1
    assert str(ro / "agent") in logs[0]
    assert "not writable" in logs[0]
    assert "repaired on the next agent update" in logs[0]


# -- review round: ceiling per job, start read once, idle faults, recovery ----
def _job_cfg(job, **over):
    cfg = _ramp_cfg(**over)
    cfg["displayCheck"] = job
    return cfg


def _later_job_runner(tmp_path, later, *, level, cfg_over=None, first="detect"):
    """A run whose second job (a step change) carries the ceiling."""
    stop = {"on": False}
    ddc = FakeDdc(
        on_write=lambda lv: stop.update(on=True) if lv == later.get("value") else None
    )
    state = {"offered": False}
    fault = ConsumingFault()

    def poll():
        if not state["offered"] and len(reports) >= 3:
            state["offered"] = True
        if state["offered"]:
            job = dict(later, action="stop" if stop["on"] else "start")
            return _job_cfg(job, **(cfg_over or {}))
        return _job_cfg(_cal_job(first))

    runner, reports, clock, ddc, fault = _cal_runner(
        first, tmp_path, level=level, ddc=ddc, fault=fault, poll=poll
    )
    return runner, reports, clock, ddc


def test_a_later_jobs_ceiling_reaches_the_agent(tmp_path):
    later = _cal_job("conversion", 4, ceiling=3)  # lower than the start 19
    runner, reports, clock, ddc = _later_job_runner(tmp_path, later, level=19)
    runner.run()
    assert reports[-1]["reason"] == "above_ceiling"
    assert max(ddc.writes, default=0) <= 19


def test_the_ceiling_never_replaces_the_start_with_a_higher_value(tmp_path):
    later = _cal_job("conversion", 12, ceiling=12)  # start 5 and no limit
    runner, reports, clock, ddc = _later_job_runner(tmp_path, later, level=5)
    runner.run()
    assert reports[-1]["reason"] == "above_ceiling"
    assert max(ddc.writes, default=0) <= 5




def test_a_value_above_the_start_is_refused_even_if_the_ceiling_allows_it(tmp_path):
    later = _cal_job("conversion", 21, ceiling=21)  # no limit, so no third reading
    runner, reports, clock, ddc = _later_job_runner(tmp_path, later, level=5)
    runner.run()
    assert reports[-1]["reason"] == "above_ceiling"
    assert max(ddc.writes, default=0) <= 5


# 5: the start is read once per run
def test_the_start_is_read_once_and_kept(tmp_path):
    ddc = ReadingDdc(read=19)
    later = _cal_job("detect")
    runner, reports, clock, ddc, fault = _cal_runner("detect", tmp_path, ddc=ddc, level=19)
    runner.run()
    first = dict(runner.start)
    ddc.read = 40  # e.g. the level after a limit test
    runner.level = 40
    runner.last_set = 40
    runner._find_start()
    assert runner.start == first


# 4: an idle fault with an unknown start never yields a limit
def test_an_idle_fault_with_an_unknown_start_has_no_level(tmp_path):
    fault = ConsumingFault()
    job = _cal_job("detect")
    seen = {"polls": 0}

    def poll():
        seen["polls"] += 1
        if seen["polls"] == 14:  # after the preflight, waiting for the next step
            fault.faults.append("Under-voltage detected!")
        return {"displayCheck": dict(job)}

    runner, reports, clock, ddc, fault = _cal_runner(
        "detect", tmp_path, level=None, fault=fault, poll=poll
    )
    runner.run()
    final = reports[-1]
    assert final["reason"] == "power_trouble"
    assert final["fault"]["level"] is None
    assert final["fault"]["lastGood"] is None


# m2: the persisted state names the current step
def test_the_persisted_state_records_the_current_step(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("detect", tmp_path, level=19)
    runner.current_step = "limit"
    runner._save()
    state = agent._load_state(str(tmp_path / agent.DISPLAY_CHECK_STATE))
    assert state["step"] == "limit"


def test_the_current_step_follows_the_job(tmp_path):
    later = _cal_job("write")
    seen = []
    runner, reports, clock, ddc = _later_job_runner(tmp_path, later, level=19)
    original = runner._save

    def save():
        seen.append(runner.current_step)
        original()

    runner._save = save
    runner.run()
    assert "write" in seen


# m1: recovery with an unknown start caps at the floor
def test_recovery_with_an_unknown_start_stays_at_the_floor(tmp_path):
    ddc = FakeDdc()
    (tmp_path / agent.DISPLAY_CHECK_STATE).write_text(
        '{"id": "c1", "step": "write", "status": "running", "level": 3, '
        '"start": {"level": null, "known": false, "source": null}, "log": []}'
    )
    agent.recover_display_check(str(tmp_path), _ramp_cfg(), ddc=ddc)
    assert max(ddc.writes, default=0) <= agent.CHECK_FLOOR
    assert ddc.writes[-1] == agent.CHECK_FLOOR


# -- calibration v3 (calvin-idts, calvin-qkm8) --------------------------------
def test_ramp_records_a_fault_that_arrives_in_the_same_poll_as_a_cancel():
    """The 2026-11-07 01:21 sequence: the touchscreen resets as Stop is pressed."""
    for stop_on_fault in (True, False):
        state = {"level": 20}
        writes = []

        def write(level, writes=writes, state=state):
            writes.append(level)
            state["level"] = level
            return True

        outcome = agent.ramp_brightness(
            20,
            40,
            write=write,
            fault=lambda: state["level"] >= 26,
            cancel=lambda: state["level"] >= 26,  # both arrive in the same poll
            sleep=lambda seconds: None,
            step=2,
            stop_on_fault=stop_on_fault,
        )
        assert outcome["fault"] is not None, stop_on_fault
        assert outcome["fault_level"] == 26
        assert outcome["last_good"] == 24


def test_a_fault_and_a_stop_in_one_poll_end_the_run_as_power_trouble(tmp_path):
    fault = ConsumingFault()
    job = _cal_job("conversion", 10)
    armed = {"on": False}
    ddc = FakeDdc(on_write=lambda level: armed.update(on=level <= 15))

    def poll():
        # Stop is pressed on the very poll the supply browns out.
        if armed["on"] and not fault.faults:
            fault.faults.append("usb 1-1.3: reset full-speed USB device")
        return {"displayCheck": {**job, "action": "stop" if armed["on"] else "start"}}

    runner, reports, clock, ddc, fault = _cal_runner(
        "conversion", tmp_path, level=19, value=10, fault=fault, poll=poll, ddc=ddc
    )
    runner.run()
    final = reports[-1]
    assert final["status"] == "error"
    assert final["reason"] == "power_trouble"
    assert final["fault"]["step"] == "conversion"
    assert final["fault"]["kind"] == "touch controller reset"


def test_a_fault_drops_to_the_floor_in_one_write(tmp_path):
    fault = ConsumingFault()
    ddc = FakeDdc(on_write=_fault_on_write(fault, None, [13]))
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, fault=fault)
    runner.run()
    assert ddc.writes[-2:] == [13, agent.CHECK_FLOOR]  # 13 -> 5 directly, no slow ramp
    assert reports[-1]["status"] == "error"


def test_stop_drops_to_the_floor_in_one_write_and_does_not_climb_back(tmp_path):
    job = _cal_job("conversion", 10)
    stop = {"on": False}
    ddc = FakeDdc(on_write=lambda level: stop.update(on=True) if level == 10 else None)

    def poll():
        return {"displayCheck": {**job, "action": "stop" if stop["on"] else "start"}}

    runner, reports, clock, ddc, fault = _cal_runner(
        "conversion", tmp_path, level=19, value=10, poll=poll, ddc=ddc
    )
    runner.run()
    assert reports[-1]["status"] == "stopped"
    assert ddc.writes[-2:] == [10, agent.CHECK_FLOOR]
    assert max(ddc.writes) <= 19


def test_the_floor_setting_is_the_drop_target(tmp_path):
    fault = ConsumingFault()
    ddc = FakeDdc(on_write=_fault_on_write(fault, None, [13]))
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, fault=fault)
    runner.live_settings = dict(runner.live_settings, floor=3)
    runner.run()
    assert ddc.writes[-1] == 3


def test_a_drop_never_goes_above_the_runs_known_start(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, level=2)
    runner.start = {"level": 2, "known": True, "source": "last_set"}
    runner._drop_to_floor()
    assert ddc.writes == [2]  # the floor is 5, the start 2: never brighter than 2


def test_brightness_settings_reads_the_floor_both_spellings():
    assert agent.brightness_settings({"brightnessFloor": 3})["floor"] == 3
    assert agent.brightness_settings({"brightness_floor": "4"})["floor"] == 4
    assert agent.brightness_settings({})["floor"] is None
    assert agent.brightness_settings({"brightnessFloor": 400})["floor"] == 100


def test_the_floor_is_the_lowest_target():
    settings = agent.brightness_settings({"brightness": 2, "brightnessFloor": 6})
    assert agent.brightness_target(settings) == 6
    unset = agent.brightness_settings({"brightness": 2})
    assert agent.brightness_target(unset) == 2


def test_dim_only_sleep_dims_to_the_floor_not_zero():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc)
    cfg = _ramp_cfg(sleep_mode="dim", brightnessFloor=4, brightness=10)
    controller.level = 4 + 6
    controller.panel_off = False
    controller.sleeping = False
    controller.settings = agent.brightness_settings(cfg)
    controller._sleep_dim(controller.settings, None)
    assert ddc.writes[-1] == 4
    assert 0 not in ddc.writes


def test_the_limit_step_is_gone_from_the_agent():
    assert "limit" not in agent.DISPLAY_CHECK_STEPS
    assert "read" in agent.DISPLAY_CHECK_STEPS
    assert "read" in agent.CALIBRATION_STEPS


def test_the_agent_has_no_limit_step_runner_path(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("limit", tmp_path, level=20)
    runner.run()
    assert reports[-1]["status"] == "error"
    assert max(ddc.writes, default=0) <= 20  # never climbs


def test_read_reports_the_ddc_level_without_writing(tmp_path):
    ddc = ReadingDdc(read=61)
    runner, reports, clock, ddc, fault = _cal_runner("read", tmp_path, level=5, ddc=ddc)
    runner._execute(runner.job)
    done = [r for r in reports if r["status"] == "done"][0]
    assert done["step"] == "read"
    assert done["level"] == 61
    assert done["lastWrite"] is None
    assert ddc.writes == []


def test_read_reports_the_level_the_agent_last_wrote(tmp_path):
    ddc = ReadingDdc(read=5)
    runner, reports, clock, ddc, fault = _cal_runner("read", tmp_path, level=19, ddc=ddc)
    runner._write_level(5)
    ddc.writes.clear()
    runner._execute(_cal_job("read"))
    done = reports[-1]
    assert (done["status"], done["level"], done["lastWrite"]) == ("done", 5, 5)
    assert ddc.writes == []


def test_a_failed_read_is_an_error_with_a_detail(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("read", tmp_path, level=19, ddc=ReadingDdc(read=None))
    runner.run()
    assert reports[-1]["status"] == "error"
    assert reports[-1]["detail"]
    assert ddc.writes == []


def test_a_fault_while_reading_ends_the_run_as_power_trouble(tmp_path):
    class ReadFaults(ReadingDdc):
        def read_brightness(self_inner):
            fault.faults.append("Under-voltage detected!")
            return 40

    fault = ConsumingFault()
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=19, ddc=ReadFaults(), fault=fault
    )
    runner.run()
    assert reports[-1]["status"] == "error"
    assert reports[-1]["reason"] == "power_trouble"
    assert reports[-1]["fault"]["step"] == "read"


def test_read_may_repeat_after_the_first(tmp_path):
    ddc = ReadingDdc(read=61)
    stage = {"n": 0}

    def poll():
        stage["n"] += 1
        step = "read" if stage["n"] < 4 else "detect"
        return {"displayCheck": {**_cal_job(step, value=stage["n"] // 4), "id": "c1"}}

    runner, reports, clock, ddc, fault = _cal_runner("detect", tmp_path, level=19, ddc=ddc, poll=poll)
    first = _cal_job("read")
    runner._execute(first)
    runner._execute(first)
    assert len([r for r in reports if r.get("level") == 61]) == 2


# -- shutdown: power the panel on low next boot --------------------------------
def test_shutdown_dim_writes_the_floor_once_when_the_panel_is_lit():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc)
    controller.settings = agent.brightness_settings(_ramp_cfg(brightnessFloor=3))
    controller.level = 40
    controller.panel_off = False
    controller.sleeping = False
    logs = []
    assert agent.shutdown_dim(controller, log_fn=logs.append) is True
    assert ddc.writes == [3]
    assert any("shutdown" in line for line in logs)


def test_shutdown_dim_writes_zero_without_a_floor():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc)
    controller.settings = agent.brightness_settings(_ramp_cfg())
    controller.level = 40
    controller.panel_off = False
    controller.sleeping = False
    agent.shutdown_dim(controller, log_fn=lambda line: None)
    assert ddc.writes == [0]


def test_shutdown_dim_skips_a_sleeping_panel_and_a_ramp_that_is_off():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc)
    controller.settings = agent.brightness_settings(_ramp_cfg())
    controller.level = 0
    controller.panel_off = True
    controller.sleeping = True
    assert agent.shutdown_dim(controller, log_fn=lambda line: None) is False
    controller.panel_off = False
    controller.sleeping = False
    controller.level = 40
    controller.settings = agent.brightness_settings(_ramp_cfg(brightness_ramp_enabled=False))
    assert agent.shutdown_dim(controller, log_fn=lambda line: None) is False
    controller.settings = None  # never reconciled yet
    assert agent.shutdown_dim(controller, log_fn=lambda line: None) is False
    assert ddc.writes == []


def test_shutdown_dim_never_blocks_longer_than_its_bound():
    import threading

    release = threading.Event()

    class Hung(FakeDdc):
        def set_brightness(self, level):
            release.wait(30)
            return True

    controller, clock, applied = _controller(Hung())
    controller.settings = agent.brightness_settings(_ramp_cfg())
    controller.level = 40
    controller.panel_off = False
    controller.sleeping = False
    started = time_module.monotonic()
    result = agent.shutdown_dim(controller, log_fn=lambda line: None, timeout=0.2)
    release.set()
    assert result is False
    assert time_module.monotonic() - started < 3


def test_the_service_unit_allows_the_shutdown_write_time():
    unit = (
        Path(__file__).resolve().parents[1] / "systemd" / "calvin-display-agent.service"
    ).read_text()
    assert "TimeoutStopSec=" in unit


# -- review round: read never moves the level, floor capped, shutdown safety ---
def test_a_fake_read_back_never_moves_the_runs_level(tmp_path):
    ddc = ReadingDdc(read=100)  # a panel whose read-back is a constant 100
    runner, reports, clock, ddc, fault = _cal_runner("read", tmp_path, level=19, ddc=ddc)
    runner._execute(_cal_job("read"))
    done = reports[-1]
    assert done["level"] == 100  # reported as read
    assert runner.level == 19
    assert runner.last_set == 19
    assert runner.controller.get_level() == 19
    runner._execute(_cal_job("write"))
    assert ddc.writes and max(ddc.writes) <= 19  # nothing above the start
    runner._finish("done")
    assert max(ddc.writes) <= 19
    assert runner.start["source"] == "last_set"  # 100 is not mistaken for a known start


def test_a_fault_during_read_blames_the_last_write_not_the_read(tmp_path):
    fault = ConsumingFault()

    class ReadFaults(ReadingDdc):
        def read_brightness(self_inner):
            fault.faults.append("Under-voltage detected!")
            return 100

    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=19, ddc=ReadFaults(), fault=fault
    )
    runner._write_level(9)
    runner._execute(_cal_job("read"))
    incident = runner.fault
    assert incident["step"] == "read"
    assert incident["level"] is None  # the agent's level is not where the panel was
    assert incident["lastGood"] is None


def _dim_controller(level, **cfg):
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc)
    controller.settings = agent.brightness_settings(_ramp_cfg(**cfg))
    controller.level = level
    controller.panel_off = False
    controller.sleeping = False
    return controller, ddc


def test_dim_only_sleep_is_capped_by_the_ceiling():
    controller, ddc = _dim_controller(50, brightnessFloor=40, brightness_limit=30)
    controller._sleep_dim(controller.settings, None)
    assert ddc.writes[-1] == 30  # the limit is the ceiling, not the floor 40
    assert controller.dim_level == 30


def test_dim_only_sleep_never_goes_up_to_the_floor():
    controller, ddc = _dim_controller(10, brightnessFloor=40)
    controller._sleep_dim(controller.settings, None)
    assert all(w <= 10 for w in ddc.writes)
    assert controller.dim_level == 10


def test_dim_level_remembers_what_was_written_when_the_floor_changes_later():
    controller, ddc = _dim_controller(30, brightnessFloor=4)
    controller._sleep_dim(controller.settings, None)
    assert controller.dim_level == 4
    controller.settings = agent.brightness_settings(_ramp_cfg(brightnessFloor=9))
    assert controller.level == controller.dim_level  # still recognised as asleep


def test_shutdown_dim_is_capped_and_never_goes_up():
    controller, ddc = _dim_controller(10, brightnessFloor=40)
    agent.shutdown_dim(controller, log_fn=lambda line: None)
    assert all(w <= 10 for w in ddc.writes)
    controller, ddc = _dim_controller(60, brightnessFloor=40, brightness_limit=30)
    agent.shutdown_dim(controller, log_fn=lambda line: None)
    assert ddc.writes == [30]


def test_a_check_drop_with_an_unknown_start_never_brightens(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner(
        "write", tmp_path, level=10, cfg_over={"brightnessFloor": 40}
    )
    assert runner.start is None
    runner._drop_to_floor()
    assert ddc.writes == [agent.CHECK_FLOOR]  # min(5, floor 40, level 10): never up


def test_a_check_drop_with_an_unknown_level_is_the_check_floor(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner(
        "write", tmp_path, level=None, cfg_over={"brightnessFloor": 40}
    )
    runner._drop_to_floor()
    assert ddc.writes == [agent.CHECK_FLOOR]


def test_a_floor_of_zero_does_not_black_the_screen_during_a_check(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner(
        "write", tmp_path, level=19, cfg_over={"brightnessFloor": 0}
    )
    runner._drop_to_floor()
    assert ddc.writes == [1]


def test_stop_with_the_ramp_off_returns_to_the_start_level(tmp_path):
    job = _cal_job("conversion", 10)
    stop = {"on": False}
    ddc = FakeDdc(on_write=lambda level: stop.update(on=True) if level == 10 else None)

    def poll():
        return {"displayCheck": {**job, "action": "stop" if stop["on"] else "start"}}

    runner, reports, clock, ddc, fault = _cal_runner(
        "conversion", tmp_path, level=19, value=10, poll=poll, ddc=ddc,
        cfg_over={"brightness_ramp_enabled": False},
    )
    runner.run()
    assert reports[-1]["status"] == "stopped"
    assert ddc.writes[-1] == 19
    assert max(ddc.writes) <= 19


def test_writes_stop_once_the_agent_is_shutting_down(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path, level=19)
    runner.controller.stopping.set()
    assert runner._write_level(5) is False
    assert ddc.writes == []


def test_a_controller_ramp_stops_when_the_agent_is_shutting_down():
    ddc = FakeDdc()
    controller, clock, applied = _controller(ddc)
    controller.settings = agent.brightness_settings(_ramp_cfg())
    controller.level = 0
    controller.stopping.set()
    controller._ramp(20)
    assert ddc.writes == []


def test_shutdown_dim_waits_for_the_lock_then_writes_once():
    controller, ddc = _dim_controller(40)
    order = []
    ddc.on_write = lambda level: order.append(("write", level))
    held = threading.Event()

    def holder():
        with controller.lock:
            held.set()
            time_module.sleep(0.2)
            order.append(("released", None))

    t = threading.Thread(target=holder)
    t.start()
    held.wait(2)
    assert agent.shutdown_dim(controller, log_fn=lambda line: None, lock_timeout=2) is True
    t.join()
    assert order == [("released", None), ("write", 0)]
    assert controller.stopping.is_set()


def test_the_sigterm_handler_dims_only_on_a_real_system_shutdown():
    for stopping, expected in ((True, [0]), (False, [])):
        controller, ddc = _dim_controller(40)
        handler = agent.make_shutdown_handler(controller, is_stopping=lambda: stopping)
        with pytest.raises(SystemExit):
            handler(15, None)
        assert ddc.writes == expected


def test_system_stopping_reads_systemctl():
    def fake(out):
        return lambda argv, **kw: SimpleNamespace(stdout=out, returncode=0)

    assert agent.system_stopping(run=fake("stopping\n")) is True
    assert agent.system_stopping(run=fake("running\n")) is False

    def boom(argv, **kw):
        raise OSError("no systemctl")

    assert agent.system_stopping(run=boom) is False


# -- every step request runs, even a repeated one (seq) ------------------------
def test_display_check_job_carries_seq():
    cfg = {"displayCheck": {"id": "c1", "step": "read", "seq": 3}}
    assert agent.display_check_job(cfg)["seq"] == 3
    assert agent.display_check_job({"displayCheck": {"id": "c1", "step": "read"}})["seq"] is None


def test_two_identical_reads_both_run_and_report_their_seq(tmp_path):
    ddc = ReadingDdc(read=61)
    jobs = [
        {**_cal_job("detect"), "seq": 0},
        {**_cal_job("read"), "seq": 1},
        {**_cal_job("read"), "seq": 2},  # the very same step and value again
        {**_cal_job("read"), "seq": 3},
    ]

    def poll():
        # The next request arrives once the current job has reported done.
        finished = len([r for r in reports if r["status"] == "done"])
        if finished >= len(jobs):
            return {"displayCheck": {**jobs[-1], "action": "stop"}}
        return {"displayCheck": dict(jobs[finished])}

    runner, reports, clock, ddc, fault = _cal_runner(
        "detect", tmp_path, level=19, ddc=ddc, poll=poll
    )
    runner.job = jobs[0]
    runner.run()
    reads = [r for r in reports if r["status"] == "done" and r["step"] == "read"]
    assert [r["seq"] for r in reads] == [1, 2, 3]
    # the reads wrote nothing; the only writes are the end-of-run restore
    assert max(ddc.writes, default=0) <= agent.DEFAULT_BRIGHTNESS


def test_without_seq_the_old_signature_still_dedupes(tmp_path):
    ddc = ReadingDdc(read=61)
    n = {"polls": 0}

    def poll():
        n["polls"] += 1
        action = "stop" if n["polls"] > 12 else "start"
        return {"displayCheck": {**_cal_job("read"), "action": action}}

    job = _cal_job("read")
    runner, reports, clock, ddc, fault = _cal_runner("read", tmp_path, level=19, ddc=ddc, poll=poll)
    runner.run()
    assert len([r for r in reports if r["status"] == "done" and r["step"] == "read"]) == 1


# -- calvin-rjyn: limit is the ceiling, restore after calibration, fault level --
def test_the_limit_is_the_ceiling_with_no_subtraction():
    settings = agent.brightness_settings({"brightness_limit": 21, "brightness": 18})
    assert agent.brightness_ceiling(settings) == 21
    assert agent.brightness_target(settings) == 18


def test_a_fault_during_read_records_no_level(tmp_path):
    fault = ConsumingFault()

    class ReadFaults(ReadingDdc):
        def read_brightness(self_inner):
            fault.faults.append("Under-voltage detected!")
            return 100

    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=5, ddc=ReadFaults(), fault=fault
    )
    job = dict(_cal_job("read"), panelLevel=74)
    runner._execute(job)
    assert runner.fault["level"] is None
    assert runner.fault["lastGood"] is None
    assert runner.fault["panelLevel"] == 74


def test_display_check_job_carries_the_panel_level():
    cfg = {"displayCheck": {"id": "c1", "step": "read", "panelLevel": 74}}
    assert agent.display_check_job(cfg)["panelLevel"] == 74
    assert agent.display_check_job({"displayCheck": {"id": "c1", "step": "read"}})["panelLevel"] is None


def _restore_runner(tmp_path, *, level, new_cfg, ramp=False):
    cfg_over = {"brightness_ramp_enabled": ramp, "brightness_limit": 17, "brightness": 17}
    polls = []

    def poll():
        polls.append(1)
        return new_cfg if len(polls) >= 2 else _ramp_cfg(**cfg_over)

    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=level, ddc=ReadingDdc(read=21), poll=poll, cfg_over=cfg_over
    )
    return runner, reports, ddc, polls


def _the_stop_says_saved(runner, new_cfg):
    """What the poll that carries Stop-after-Save gives the runner."""
    runner.live_settings = agent.brightness_settings(new_cfg)
    runner._note_job({**_cal_job("read", action="stop"), "saved": True})


def test_a_run_that_took_readings_restores_the_saved_everyday_level(tmp_path):
    new_cfg = _ramp_cfg(brightness_ramp_enabled=False, brightness_limit=21, brightness=18)
    runner, reports, ddc, polls = _restore_runner(tmp_path, level=None, new_cfg=new_cfg)
    runner._execute(_cal_job("read"))
    _the_stop_says_saved(runner, new_cfg)
    runner._finish("done")
    assert ddc.writes[0] == 5  # dropped at once
    assert ddc.writes[1] == 0  # then the restore starts from 0
    assert ddc.writes[-1] == 18  # the NEW saved level, not the stale 17
    assert max(ddc.writes) <= 21


def test_the_restore_is_capped_by_the_new_ceiling(tmp_path):
    new_cfg = _ramp_cfg(brightness_ramp_enabled=False, brightness_limit=21, brightness=50)
    runner, reports, ddc, polls = _restore_runner(tmp_path, level=5, new_cfg=new_cfg)
    runner._execute(_cal_job("read"))
    _the_stop_says_saved(runner, new_cfg)
    runner._finish("stopped")
    assert ddc.writes[-1] == 21


def test_no_restore_without_readings(tmp_path):
    new_cfg = _ramp_cfg(brightness_ramp_enabled=False, brightness_limit=21, brightness=18)
    runner, reports, ddc, polls = _restore_runner(tmp_path, level=5, new_cfg=new_cfg)
    runner._finish("done")
    assert ddc.writes == []


def test_no_restore_after_power_trouble(tmp_path):
    fault = ConsumingFault()

    class ReadFaults(ReadingDdc):
        def read_brightness(self_inner):
            fault.faults.append("Under-voltage detected!")
            return 21

    new_cfg = _ramp_cfg(brightness_ramp_enabled=False, brightness_limit=21, brightness=18)
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=5, ddc=ReadFaults(), fault=fault,
        poll=lambda: new_cfg,
    )
    runner._execute(_cal_job("read"))
    ddc.writes.clear()
    runner._finish("error")
    assert 18 not in ddc.writes and max(ddc.writes, default=0) <= 5


# -- calvin-rjyn review: restore only after a Save, waits record no level ------
@pytest.mark.parametrize("status", ["stopped", "error", "timeout", "done"])
def test_no_restore_without_a_save_never_uses_the_default_or_an_old_value(tmp_path, status):
    unchanged = _ramp_cfg(brightness_ramp_enabled=False, brightness=60)
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=5, ddc=ReadingDdc(read=21),
        poll=lambda: unchanged, cfg_over={"brightness_ramp_enabled": False, "brightness": 60},
    )
    runner._execute(_cal_job("read"))
    runner._finish(status)
    assert max(ddc.writes, default=0) <= 5  # no 20, no old 60
    assert reports[-1]["status"] == status


def test_no_restore_when_nothing_was_ever_saved_and_no_brightness_exists(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=5, ddc=ReadingDdc(read=21),
        poll=lambda: _ramp_cfg(brightness=None), cfg_over={"brightness": None},
    )
    runner._execute(_cal_job("read"))
    runner._finish("stopped")
    assert agent.DEFAULT_BRIGHTNESS not in ddc.writes


def test_a_fault_waiting_when_the_run_ends_is_recorded_before_any_write(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=19, ddc=ReadingDdc(read=21), poll=lambda: {},
    )
    runner._execute(_cal_job("read"))
    fault.faults.append("Under-voltage detected!")
    n = len(ddc.writes)
    runner._finish("stopped")
    assert runner.fault is not None and runner.fault["level"] is None
    assert reports[-1]["status"] == "error"
    assert 21 not in ddc.writes[n:]


@pytest.mark.parametrize("step", ["read", "detect"])
def test_a_fault_in_the_wait_between_panel_steps_records_no_level(tmp_path, step):
    fault = ConsumingFault()
    holder = {}

    def poll():
        # Once the step has reported, the owner is moving the panel by hand.
        if any(r["status"] == "done" for r in holder["reports"]) and not holder.get("sent"):
            holder["sent"] = True
            fault.faults.append("Under-voltage detected!")
        return {"displayCheck": dict(_cal_job(step), panelLevel=74)}

    runner, reports, clock, ddc, fault = _cal_runner(
        step, tmp_path, level=19, ddc=ReadingDdc(read=19), fault=fault, poll=poll
    )
    holder["reports"] = reports
    runner.run()
    incident = runner.fault
    assert incident["step"] == step
    assert incident["level"] is None and incident["lastGood"] is None
    assert "panelLevel" not in incident  # the typed level belongs to the earlier read
    assert reports[-1]["status"] == "error"


def test_a_fault_during_the_restore_is_recorded_dropped_and_capped(tmp_path):
    fault = ConsumingFault()

    def on_write(level):
        if level == 12:
            fault.faults.append("Under-voltage detected!")

    new_cfg = _ramp_cfg(brightness_ramp_enabled=False, brightness_limit=21, brightness=18)
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=5, ddc=ReadingDdc(read=21, on_write=on_write), fault=fault,
        poll=lambda: new_cfg, cfg_over={"brightness_ramp_enabled": False},
    )
    runner._execute(_cal_job("read"))
    _the_stop_says_saved(runner, new_cfg)
    runner._finish("done")
    assert runner.fault is not None and runner.fault["level"] == 12
    assert reports[-1]["status"] == "error"
    assert max(ddc.writes) == 12  # never went on climbing
    assert ddc.writes[-1] <= 5  # dropped
    assert runner.controller.fault_ceiling is not None and runner.controller.fault_ceiling < 12
    assert agent.brightness_target(
        agent.brightness_settings(new_cfg), runner.controller._ceiling()
    ) < 12  # reconcile cannot climb to the same target


# -- calvin-rjyn re-review: an identical Save, the guards ----------------------
def _run_ending(tmp_path, *, saved, cfg_over, ended_cfg=None):
    """A whole run: one read, then the dialog ends it (Stop/Done/close) with `saved`."""
    holder = {}
    base = _ramp_cfg(**cfg_over)

    def poll():
        done = any(r["status"] == "done" for r in holder["reports"])
        job = {**_cal_job("read", action="stop" if done else "start"), "saved": saved and done}
        return {**(ended_cfg if done and ended_cfg else base), "displayCheck": job}

    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=5, ddc=ReadingDdc(read=21), poll=poll, cfg_over=cfg_over
    )
    holder["reports"] = reports
    runner.run()
    return ddc


SAME = {"brightness_ramp_enabled": False, "brightness_limit": 21, "brightness": 18}


def test_done_after_a_save_restores_even_with_identical_values(tmp_path):
    ddc = _run_ending(tmp_path, saved=True, cfg_over=SAME)
    assert ddc.writes[-1] == 18


def test_close_after_a_save_restores_too(tmp_path):
    # X sends the same Stop-with-saved as Done: the agent cannot tell them apart.
    ddc = _run_ending(tmp_path, saved=True, cfg_over={**SAME, "brightness": 17},
                      ended_cfg=_ramp_cfg(**SAME))
    assert ddc.writes[-1] == 18


def test_a_whole_layer_write_or_changed_brightness_without_a_save_does_not_restore(tmp_path):
    changed = _ramp_cfg(brightness_ramp_enabled=False, brightness=60, brightness_limit=None)
    ddc = _run_ending(
        tmp_path, saved=False, cfg_over={"brightness_ramp_enabled": False, "brightness": 40},
        ended_cfg=changed,
    )
    assert max(ddc.writes, default=0) <= 5  # no 60, no 40, no default 20


def test_display_check_job_carries_the_saved_flag():
    assert agent.display_check_job({"displayCheck": {"id": "c1", "step": "read", "saved": True}})["saved"] is True
    assert agent.display_check_job({"displayCheck": {"id": "c1", "step": "read"}})["saved"] is False


def test_a_save_with_no_brightness_chosen_never_ramps_to_the_default(tmp_path):
    cfg = _ramp_cfg(brightness_ramp_enabled=False, brightness=None)
    cfg["displayCheck"] = {**_cal_job("read"), "saved": True}
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=5, ddc=ReadingDdc(read=21), poll=lambda: cfg,
        cfg_over={"brightness_ramp_enabled": False, "brightness": None},
    )
    runner._execute(_cal_job("read"))
    _the_stop_says_saved(runner, cfg)
    runner._finish("stopped")
    assert agent.DEFAULT_BRIGHTNESS not in ddc.writes
    assert max(ddc.writes, default=0) <= 5


def test_a_waiting_fault_is_recorded_before_the_drop_is_written(tmp_path):
    seen = []
    holder = {}

    def on_write(level):
        seen.append(holder["runner"].fault is not None)

    ddc = ReadingDdc(read=21, on_write=on_write)
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=19, ddc=ddc, poll=lambda: {},
    )
    holder["runner"] = runner
    runner._execute(_cal_job("read"))
    seen.clear()
    fault.faults.append("Under-voltage detected!")
    runner._finish("stopped")
    assert seen and seen[0] is True  # the incident existed before the first write


# -- after a drop: wait for the touch controller to go quiet (calvin-v996) ------
def _second_run(step, tmp_path, runner, fault, *, job_id="c2", cfg_over=None):
    """A new run on the same controller and clock, as the dialog's Try again makes."""
    reports = []
    clock = runner.clock
    second = agent.DisplayCheckRunner(
        dict(_cal_job(step), id=job_id),
        _ramp_cfg(**(cfg_over or {})),
        ddc=runner.ddc,
        report=reports.append,
        poll=None,
        clock=clock,
        sleep=runner.sleep,
        state_dir=str(tmp_path),
        controller=runner.controller,
    )
    return second, reports


def test_a_run_right_after_a_drop_waits_for_the_touch_controller_to_go_quiet(tmp_path):
    fault = ConsumingFault()
    ddc = FakeDdc(on_write=_fault_on_write(fault, None, [13]))
    first, _, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, fault=fault)
    first.run()
    assert first.reason == "power_trouble"

    second, reports = _second_run("write", tmp_path, first, fault)
    began = clock.t
    # The touch controller resets again 10 s and 30 s into the next run, as seen on a 3B+.
    resets = [began + 10, began + 30]
    original = clock.sleep

    def sleep(seconds):
        original(seconds)
        if resets and clock.t >= resets[0]:
            resets.pop(0)
            fault.faults.append("usb 1-1.1: reset full-speed USB device")

    second.sleep = sleep
    second.run()
    settling = [r for r in reports if (r.get("preflight") or {}).get("status") == "settling"]
    assert settling, "the dialog needs a waiting state to show"
    assert all(r["preflight"]["settleLeft"] >= 0 for r in settling)
    # Not failed by the resets it waited out: the power check then ran clean.
    assert second.reason != "power_at_idle"
    assert reports[-1]["preflight"] == {"status": "clean", "faults": []}
    assert clock.t - began >= 30 + agent.AFTER_DROP_QUIET_SECONDS


def test_waiting_after_a_drop_is_bounded_and_can_be_stopped(tmp_path):
    class Stubborn(ConsumingFault):
        def new_faults(self):
            return ["usb 1-1.1: reset full-speed USB device"]

    fault = ConsumingFault()
    ddc = FakeDdc(on_write=_fault_on_write(fault, None, [13]))
    first, _, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, fault=fault)
    first.run()
    second, reports = _second_run("write", tmp_path, first, fault)
    second.controller.fault = Stubborn()
    began = clock.t
    second.run()
    waited = clock.t - began
    assert agent.AFTER_DROP_TIMEOUT_SECONDS <= waited < agent.AFTER_DROP_TIMEOUT_SECONDS + 15
    # Out of patience it checks the power honestly, so the verdict is the real one.
    assert second.reason == "power_at_idle"


def test_a_stop_while_waiting_after_a_drop_ends_the_run(tmp_path):
    fault = ConsumingFault()
    ddc = FakeDdc(on_write=_fault_on_write(fault, None, [13]))
    first, _, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, fault=fault)
    first.run()
    second, reports = _second_run("write", tmp_path, first, fault)
    stop = {"job": dict(_cal_job("write"), id="c2", action="stop")}
    second.poll = lambda: {"displayCheck": stop["job"]}
    second.run()
    assert reports[-1]["status"] == "stopped"
    assert reports[-1].get("reason") != "power_at_idle"


def test_a_first_run_does_not_wait(tmp_path):
    runner, reports, clock, ddc, fault = _cal_runner("write", tmp_path)
    runner.run()
    assert not [r for r in reports if (r.get("preflight") or {}).get("status") == "settling"]


# -- the power watch between steps reacts within a second or so (calvin-puiw) ---
def test_a_fault_between_steps_is_noticed_within_a_second(tmp_path):
    fault = ConsumingFault()

    def poll():
        # The dialog is waiting for the owner's next step (the read already answered).
        return {"displayCheck": dict(_cal_job("read"), id="c1")}

    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=19, ddc=ReadingDdc(read=40), fault=fault, poll=poll
    )
    fault_at = {}
    original = clock.sleep

    def sleep(seconds):
        original(seconds)
        if "t" not in fault_at and clock.t >= agent.PREFLIGHT_SECONDS + 4:
            fault_at["t"] = clock.t
            fault.faults.append("usb 1-1.1: reset full-speed USB device")

    first_report = {}

    def report(payload):
        if payload.get("fault") and "t" not in first_report:
            first_report["t"] = clock.t
        reports.append(payload)

    runner.sleep = sleep
    runner.report = report
    runner.run()
    assert reports[-1]["reason"] == "power_trouble"
    assert first_report["t"] - fault_at["t"] <= 1.0


# -- coordinator review of #337 -------------------------------------------------
def _after_a_drop(tmp_path, cfg_over=None):
    fault = ConsumingFault()
    ddc = FakeDdc(on_write=_fault_on_write(fault, None, [13]))
    first, _, clock, ddc, fault = _cal_runner("write", tmp_path, ddc=ddc, fault=fault)
    first.run()
    second, reports = _second_run("write", tmp_path, first, fault, cfg_over=cfg_over)
    return first, second, reports, clock, fault, ddc


def test_real_under_voltage_while_waiting_ends_the_run_and_drops_at_once(tmp_path):
    first, second, reports, clock, fault, ddc = _after_a_drop(
        tmp_path, cfg_over={"brightness_floor": 0}
    )
    began = clock.t
    original = clock.sleep
    fired = {}

    def sleep(seconds):
        original(seconds)
        if "t" not in fired and clock.t >= began + 3:
            fired["t"] = clock.t
            fault.faults.append("Under-voltage detected!")

    second.sleep = sleep
    writes_before = len(ddc.writes)
    second.run()
    assert second.reason == "power_at_idle"
    assert reports[-1]["status"] == "error"
    assert reports[-1]["preflight"]["status"] == "fault"
    new_writes = ddc.writes[writes_before:]
    assert new_writes, "the screen was dimmed"
    # Dimmed once and left there: nothing climbs back up after real under-voltage.
    assert max(new_writes) <= new_writes[0]
    assert new_writes[-1] == new_writes[0]
    assert clock.t - fired["t"] < 10, "did not sit out the whole wait"


def test_touch_only_resets_21_and_19_seconds_apart_do_not_fail_the_next_power_check(tmp_path):
    first, second, reports, clock, fault, ddc = _after_a_drop(tmp_path)
    began = clock.t
    resets = [began + 5, began + 26, began + 45]  # gaps of 21 s and 19 s, as on the 3B+
    original = clock.sleep

    def sleep(seconds):
        original(seconds)
        if resets and clock.t >= resets[0]:
            resets.pop(0)
            fault.faults.append("usb 1-1.1: reset full-speed USB device")

    second.sleep = sleep
    second.run()
    assert second.reason != "power_at_idle"
    assert agent.AFTER_DROP_QUIET_SECONDS >= 30


def test_after_waiting_the_report_says_watching_so_the_dialog_stops_showing_settling(tmp_path):
    first, second, reports, clock, fault, ddc = _after_a_drop(tmp_path)
    second.run()
    kinds = [(r.get("preflight") or {}).get("status") for r in reports]
    assert "settling" in kinds
    last_settling = max(i for i, k in enumerate(kinds) if k == "settling")
    assert kinds[last_settling + 1] == "watching"


def test_the_drop_is_written_before_the_blocking_report(tmp_path):
    order = []
    fault = ConsumingFault()
    ddc = ReadingDdc(read=40, on_write=lambda level: order.append(("write", level)))
    runner, reports, clock, ddc, fault = _cal_runner(
        "read", tmp_path, level=19, ddc=ddc, fault=fault
    )
    runner.report = lambda payload: order.append(("report", bool(payload.get("fault"))))
    fault.faults.append("Under-voltage detected!")
    runner._calibration_fault("read", 19, 19, ["Under-voltage detected!"])
    kinds = [k for k, _ in order]
    assert kinds.index("write") < kinds.index("report")
