"""Screen power: the agent's precedence on the server, the projection, the limiter (calvin-2ifv)."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.screen_power import ChangeLimiter, desired_on, now_in, project_hold

pytestmark = pytest.mark.unit

# Every day on 07:00, off 22:00.
SCHEDULE = {
    "displayScheduleEnabled": True,
    "displaySchedule": [
        {"day": d, "enabled": True, "onTime": "07:00", "offTime": "22:00"} for d in range(7)
    ],
}


def _at(hour: int, minute: int = 0, day: int = 18) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


def test_no_schedule_is_on():
    assert desired_on({}, _at(3)) is True


def test_schedule_window():
    assert desired_on(SCHEDULE, _at(12)) is True
    assert desired_on(SCHEDULE, _at(23)) is False


def test_screen_now_holds_until_the_next_boundary():
    cfg = {**SCHEDULE, "screenNow": {"power": "off", "setAt": "2026-11-18T12:00:00Z"}}
    assert desired_on(cfg, _at(15)) is False
    # 22:00 is the next boundary: from there the schedule rules again.
    assert desired_on(cfg, _at(23)) is False  # the schedule says off too
    assert desired_on(cfg, _at(8, day=19)) is True


def test_screen_now_without_schedule_never_ends():
    cfg = {"screenNow": {"power": "off", "setAt": "2026-11-01T12:00:00Z"}}
    assert desired_on(cfg, _at(12)) is False


def test_hold_wins_across_boundaries():
    cfg = {
        **SCHEDULE,
        "screenHold": {"power": "off", "setAt": "2026-11-18T12:00:00Z"},
        "screenNow": {"power": "on", "setAt": "2026-11-18T12:00:00Z"},
    }
    assert desired_on(cfg, _at(8, day=19)) is False
    assert desired_on(cfg, _at(8, day=25)) is False


def test_malformed_hold_and_override_are_ignored():
    cfg = {**SCHEDULE, "screenHold": {"power": "dim"}, "screenNow": {"power": "off"}}
    assert desired_on(cfg, _at(12)) is True


def test_now_is_in_the_screens_timezone():
    cfg = {**SCHEDULE, "timezone": "Pacific/Auckland"}
    assert str(now_in(cfg).tzinfo) == "Pacific/Auckland"
    # 12:00 UTC is 01:00 the next day in Auckland (UTC+13 in November): off.
    assert desired_on(cfg, _at(12).astimezone(ZoneInfo("Pacific/Auckland"))) is False
    assert now_in({"timezone": "Not/AZone"}).tzinfo is not None


def test_project_hold_sets_all_four_keys():
    merged = {"screenNow": {"power": "on", "setAt": "old"}, "screen_now": {"power": "on"}}
    project_hold(merged, {"power": "off", "setAt": "2026-11-18T12:00:00Z", "by": "automation"})
    expected = {"power": "off", "setAt": "2026-11-18T12:00:00Z"}
    for key in ("screenHold", "screen_hold", "screenNow", "screen_now"):
        assert merged[key] == expected
    assert "automation" not in str(merged)


def test_project_without_hold_changes_nothing():
    merged = {"screenNow": {"power": "on", "setAt": "x"}}
    project_hold(merged, None)
    assert merged == {"screenNow": {"power": "on", "setAt": "x"}}


def test_limiter_allows_thirty_a_minute():
    limiter = ChangeLimiter(limit=30, window=60.0)
    for i in range(30):
        assert limiter.check("key:a", now=1000 + i) == 0
        limiter.record("key:a", now=1000 + i)
    wait = limiter.check("key:a", now=1030)
    assert wait > 0
    assert limiter.check("key:b", now=1030) == 0  # per caller
    assert limiter.check("key:a", now=1061) == 0  # the window slides


def test_agent_view_for_an_agent_that_cannot_hold():
    """An old agent obeys the projected screenNow, so it follows the next boundary."""
    from app.services.screen_power import agent_view

    merged = {**SCHEDULE}
    project_hold(merged, {"power": "off", "setAt": "2026-11-18T12:00:00Z", "by": "automation"})
    old = agent_view(merged, agent_holds=False)
    assert "screenHold" not in old and "screen_hold" not in old
    assert desired_on(old, _at(15)) is False
    assert desired_on(old, _at(8, day=19)) is True  # past 22:00: the schedule again
    for holds in (True, None):
        assert desired_on(agent_view(merged, agent_holds=holds), _at(8, day=19)) is False
    assert "screenHold" in merged  # the input is not changed


def test_strip_holds_drops_a_hold_that_did_not_come_from_the_column():
    from app.services.screen_power import strip_holds

    merged = {"screenHold": {"power": "off"}, "screen_hold": {"power": "off"}, "x": 1}
    strip_holds(merged)
    assert merged == {"x": 1}


def test_drop_superseded_screen_now_keeps_only_a_fresh_choice():
    from app.services.screen_power import drop_superseded_screen_now

    changed_at = _at(12)
    now = _at(15)  # nothing in this layer is near "now", so only the old rule runs
    layer = {
        "displayName": "Kitchen",
        "screenNow": {"power": "off", "setAt": "2026-11-18T11:59:59Z"},
    }
    assert drop_superseded_screen_now(layer, changed_at, now=now) == {"displayName": "Kitchen"}
    # Set at exactly the change time: replaced by it.
    layer["screenNow"] = {"power": "off", "setAt": "2026-11-18T12:00:00Z"}
    assert drop_superseded_screen_now(layer, changed_at, now=now) == {"displayName": "Kitchen"}
    # Strictly newer: the person's own fresh choice stays.
    layer["screenNow"] = {"power": "on", "setAt": "2026-11-18T12:00:01Z"}
    assert drop_superseded_screen_now(layer, changed_at, now=now) == layer
    # Both spellings are checked; a malformed one is not a choice.
    both = {
        "screenNow": {"power": "on", "setAt": "2026-11-18T12:00:01Z"},
        "screen_now": {"power": "on", "setAt": "2026-11-18T10:00:00Z"},
    }
    assert drop_superseded_screen_now(both, changed_at, now=now) == {
        "screenNow": {"power": "on", "setAt": "2026-11-18T12:00:01Z"}
    }
    for malformed in ({"power": "on"}, {"power": "on", "setAt": "later"}, "on", None):
        assert drop_superseded_screen_now({"screenNow": malformed}, changed_at, now=now) == {}


def test_a_fresh_choice_survives_a_slow_client_clock_and_is_restamped():
    """The page stamps ``setAt`` with the BROWSER clock; the server judges with its own.

    Ending a hold writes the tombstone on the server, and the page saves the new
    choice milliseconds later. A phone a few seconds behind, or ahead, must not
    have that press silently dropped (calvin-ldeu). Its ``setAt`` is re-stamped
    with the server's now so every later comparison uses one clock.
    """
    from app.services.screen_power import drop_superseded_screen_now

    changed_at = _at(12)  # the hold ended at 12:00:00 on the server
    now = datetime(2026, 11, 18, 12, 0, 0, 400000, tzinfo=UTC)
    for offset in (-5, 5):
        set_at = (now + timedelta(seconds=offset)).isoformat()
        layer = {"displayName": "Kitchen", "screenNow": {"power": "off", "setAt": set_at}}
        kept = drop_superseded_screen_now(layer, changed_at, now=now)
        assert kept == {
            "displayName": "Kitchen",
            "screenNow": {"power": "off", "setAt": "2026-11-18T12:00:00.400Z"},
        }
        assert layer["screenNow"]["setAt"] == set_at  # the input is not changed


def test_the_tolerance_does_not_keep_an_old_choice():
    """A stale page carries the time it was set: minutes or hours old, so it is dropped."""
    from app.services.screen_power import drop_superseded_screen_now

    now = datetime(2026, 11, 18, 12, 0, 30, tzinfo=UTC)
    for age_s in (61, 120, 3600):
        stale = (now - timedelta(seconds=age_s)).isoformat()
        layer = {"displayName": "Kitchen", "screenNow": {"power": "on", "setAt": stale}}
        assert drop_superseded_screen_now(layer, _at(12), now=now) == {"displayName": "Kitchen"}


def test_a_choice_far_in_the_future_is_not_fresh():
    """Beyond the tolerance: not re-stamped forward, and the old rule decides."""
    from app.services.screen_power import drop_superseded_screen_now

    now = datetime(2026, 11, 18, 12, 0, 0, tzinfo=UTC)
    ahead = (now + timedelta(hours=1)).isoformat()
    layer = {"screenNow": {"power": "on", "setAt": ahead}}
    # Strictly newer than the last change: kept as it is, not moved forward.
    assert drop_superseded_screen_now(layer, _at(12), now=now) == layer
    # Older than a later change: dropped like any superseded choice.
    assert drop_superseded_screen_now(layer, _at(13), now=now) == {}


def test_drop_superseded_screen_now_without_a_change_keeps_the_layer():
    from app.services.screen_power import drop_superseded_screen_now

    layer = {"screenNow": {"power": "off", "setAt": "2026-11-18T12:00:00Z"}}
    assert drop_superseded_screen_now(layer, None) == layer
