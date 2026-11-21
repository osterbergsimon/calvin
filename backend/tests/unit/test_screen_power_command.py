"""The screen's power command: mode, key name, expiry and "no write on a read" (calvin-25g9)."""

from datetime import UTC, datetime

import pytest

from app.services.screen_power import (
    active_command,
    command_until,
    public_command,
)

pytestmark = pytest.mark.unit

# Every day on 07:00, off 22:00.
SCHEDULE = {
    "displayScheduleEnabled": True,
    "displaySchedule": [
        {"day": d, "enabled": True, "onTime": "07:00", "offTime": "22:00"} for d in range(7)
    ],
}
EXTERNAL = {"screenPower": "external", "displayScheduleEnabled": False}


def _at(hour: int, minute: int = 0, day: int = 18) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


def _command(**overrides) -> dict:
    command = {
        "power": "off",
        "setAt": "2026-11-18T12:00:00Z",
        "by": "automation",
        "mode": "schedule",
    }
    command.update(overrides)
    return command


def test_a_schedule_command_is_in_force_until_the_next_boundary():
    command = _command()
    assert active_command(command, SCHEDULE, _at(15)) is command
    # 22:00 is the first boundary after 12:00: from there the schedule rules.
    assert active_command(command, SCHEDULE, _at(22)) is None
    assert active_command(command, SCHEDULE, _at(23, 30)) is None
    assert active_command(command, SCHEDULE, _at(8, day=19)) is None


def test_an_external_command_stands():
    command = _command(mode="external")
    assert active_command(command, EXTERNAL, _at(15)) is command
    assert active_command(command, EXTERNAL, _at(15, day=25)) is command


def test_a_command_from_another_mode_is_absent():
    assert active_command(_command(mode="external"), SCHEDULE, _at(15)) is None
    assert active_command(_command(mode="schedule"), EXTERNAL, _at(15)) is None
    assert active_command(_command(mode="schedule"), {"screenPower": "always_on"}, _at(15)) is None


def test_absent_or_malformed_commands_are_absent():
    for value in (None, {}, "off", {"power": "off"}):
        assert active_command(value, SCHEDULE, _at(15)) is None
    # A Schedule command needs a usable time to know where it ends.
    assert active_command(_command(setAt="later"), SCHEDULE, _at(15)) is None


def test_a_schedule_without_a_boundary_keeps_the_command():
    cfg = {"displayScheduleEnabled": True, "displaySchedule": []}
    assert active_command(_command(), cfg, _at(3)) is not None


def test_until_is_the_boundary_of_a_schedule_command():
    assert command_until(_command(), SCHEDULE, _at(15)) == _at(22)
    assert command_until(_command(), SCHEDULE, _at(3)) == _at(22)
    assert command_until(_command(mode="external"), EXTERNAL, _at(15)) is None
    assert command_until(
        _command(), {"displayScheduleEnabled": True, "displaySchedule": []}, _at(15)
    ) is (None)
    assert command_until(None, SCHEDULE, _at(15)) is None


def test_until_uses_the_screens_time_zone():
    from zoneinfo import ZoneInfo

    auckland = ZoneInfo("Pacific/Auckland")
    now = _at(2).astimezone(auckland)  # 15:00 in Auckland (UTC+13 in November)
    # setAt is 01:00 the next day in Auckland; the schedule's 22:00 is the
    # screen's local 22:00, which is 09:00 UTC the next day.
    assert command_until(_command(), SCHEDULE, now) == datetime(2026, 11, 18, 18, tzinfo=UTC)


def test_public_command_never_carries_the_key_name():
    command = _command(keyName="Homey")
    public = public_command(command)
    assert public == {
        "power": "off",
        "setAt": "2026-11-18T12:00:00Z",
        "by": "automation",
        "mode": "schedule",
    }
    assert "Homey" not in str(public)
    assert public_command(None) is None
