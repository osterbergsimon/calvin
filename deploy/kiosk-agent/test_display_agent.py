import importlib.util
import os
from datetime import datetime, time
from types import SimpleNamespace

_MOD = os.path.join(os.path.dirname(__file__), "calvin_display_agent.py")
_spec = importlib.util.spec_from_file_location("calvin_display_agent", _MOD)
agent = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(agent)


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
