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
