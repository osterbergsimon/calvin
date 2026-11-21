"""Projection of the screen power mode into the agent's config (calvin-25g9, decision 6)."""

from datetime import UTC, datetime

import pytest

from app.services.screen_power import agent_view, desired_on, project_mode

pytestmark = pytest.mark.unit

SCHEDULE = [
    {"day": day, "enabled": True, "onTime": "07:00", "offTime": "22:00"} for day in range(7)
]
COMMAND = {
    "power": "off",
    "setAt": "2026-11-18T12:00:00Z",
    "by": "automation",
    "mode": "schedule",
    "keyName": "Homey",
}
EXTERNAL_COMMAND = {**COMMAND, "mode": "external"}


def _at(hour: int, minute: int = 0, day: int = 18) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


def _schedule_cfg(**overrides) -> dict:
    return {
        "screenPower": "schedule",
        "displayScheduleEnabled": True,
        "display_schedule_enabled": True,
        "displaySchedule": SCHEDULE,
        **overrides,
    }


def test_schedule_projects_only_screen_now():
    merged = _schedule_cfg(screenHold={"power": "on"}, screenNow={"power": "on"})
    project_mode(merged, "schedule", COMMAND)
    assert merged["displayScheduleEnabled"] is True
    assert merged["display_schedule_enabled"] is True
    expected = {"power": "off", "setAt": "2026-11-18T12:00:00Z"}
    assert merged["screenNow"] == merged["screen_now"] == expected
    assert "screenHold" not in merged and "screen_hold" not in merged
    assert "by" not in str(merged) and "Homey" not in str(merged)


def test_schedule_without_a_command_projects_none():
    merged = _schedule_cfg(screenNow={"power": "on", "setAt": "x"})
    project_mode(merged, "schedule", None)
    for key in ("screenNow", "screen_now", "screenHold", "screen_hold"):
        assert key not in merged


def test_always_on_turns_the_switch_off_and_projects_no_command():
    merged = _schedule_cfg()
    project_mode(merged, "always_on", COMMAND)
    assert merged["displayScheduleEnabled"] is False
    assert merged["display_schedule_enabled"] is False
    for key in ("screenNow", "screen_now", "screenHold", "screen_hold"):
        assert key not in merged


def test_external_projects_the_command_as_both_keys():
    merged = _schedule_cfg()
    project_mode(merged, "external", EXTERNAL_COMMAND)
    assert merged["displayScheduleEnabled"] is False
    assert merged["display_schedule_enabled"] is False
    expected = {"power": "off", "setAt": "2026-11-18T12:00:00Z"}
    for key in ("screenNow", "screen_now", "screenHold", "screen_hold"):
        assert merged[key] == expected


def test_external_without_a_command_projects_none():
    merged = _schedule_cfg()
    project_mode(merged, "external", None)
    assert merged["displayScheduleEnabled"] is False
    for key in ("screenNow", "screen_now", "screenHold", "screen_hold"):
        assert key not in merged


def test_an_old_agent_obeys_external():
    """agentHolds False: it ignores screenHold and follows screenNow, with no boundary."""
    merged = _schedule_cfg()
    project_mode(merged, "external", EXTERNAL_COMMAND)
    old = agent_view(merged, agent_holds=False)
    assert "screenHold" not in old and "screen_hold" not in old
    # Far past every boundary in the stored schedule: the command still stands.
    assert desired_on(old, _at(15)) is False
    assert desired_on(old, _at(3, day=25)) is False
    # A new agent obeys the hold just the same.
    assert desired_on(agent_view(merged, agent_holds=True), _at(3, day=25)) is False
    assert desired_on(agent_view(merged, agent_holds=None), _at(3, day=25)) is False


def test_external_without_a_command_is_on_for_every_agent():
    merged = _schedule_cfg()
    project_mode(merged, "external", None)
    for holds in (False, True, None):
        assert desired_on(agent_view(merged, agent_holds=holds), _at(12)) is True


def test_a_gated_unpaired_screen_receives_nothing_and_is_on():
    merged = _schedule_cfg()
    project_mode(merged, "external", EXTERNAL_COMMAND)
    gated = agent_view(merged, agent_holds=True, receives_hold=False)
    for key in ("screenNow", "screen_now", "screenHold", "screen_hold"):
        assert key not in gated
    assert desired_on(gated, _at(12)) is True


def test_a_schedule_command_still_ends_at_its_boundary_on_an_old_agent():
    merged = _schedule_cfg()
    project_mode(merged, "schedule", COMMAND)
    old = agent_view(merged, agent_holds=False)
    assert desired_on(old, _at(15)) is False
    # 22:00 is the first boundary after 12:00: the schedule rules again.
    assert desired_on(old, _at(23)) is False  # the schedule is off too
    assert desired_on(old, _at(8, day=19)) is True


def test_always_on_is_on_for_every_agent():
    merged = _schedule_cfg()
    project_mode(merged, "always_on", COMMAND)
    for holds in (False, True, None):
        assert desired_on(agent_view(merged, agent_holds=holds), _at(23)) is True
