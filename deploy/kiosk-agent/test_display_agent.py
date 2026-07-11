import importlib.util
import os
import subprocess
from datetime import datetime, time
from types import SimpleNamespace

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


def test_run_survives_non_dict_config(monkeypatch):
    applied = []
    slept = []
    monkeypatch.setattr(agent, "apply_on", lambda on: applied.append(on) or "test")
    agent.run("http://x", 900, fetch=lambda url: "not a dict",
              sleep=lambda s: slept.append(s), iterations=1)
    assert applied == []                 # never touched the display
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
                returncode=0, stdout="HDMI-1 connected primary 1920x1080+0+0\n", stderr=""
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
        agent.subprocess, "run",
        lambda *a, **k: SimpleNamespace(returncode=0, stdout=out, stderr=""),
    )
    assert agent.detect_primary_output() == "HDMI-1"
