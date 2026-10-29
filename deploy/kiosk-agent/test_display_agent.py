import importlib.util
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
