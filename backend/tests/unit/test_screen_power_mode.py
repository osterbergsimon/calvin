"""The ``screenPower`` key: values, derivation and keeping the switch in step (calvin-25g9)."""

import pytest
from pydantic import ValidationError

from app.schemas.config_update import ConfigUpdate, sanitize_overrides
from app.services.screen_power import effective_mode, effective_mode_for, sync_mode_keys

pytestmark = pytest.mark.unit


def test_absent_derives_from_the_schedule_switch():
    assert effective_mode({}) == "always_on"
    assert effective_mode({"displayScheduleEnabled": False}) == "always_on"
    assert effective_mode({"displayScheduleEnabled": True}) == "schedule"
    assert effective_mode({"display_schedule_enabled": True}) == "schedule"


def test_the_explicit_key_wins_in_both_spellings():
    assert (
        effective_mode({"screenPower": "external", "displayScheduleEnabled": False}) == "external"
    )
    assert (
        effective_mode({"screen_power": "always_on", "displayScheduleEnabled": True}) == "always_on"
    )
    assert effective_mode({"screenPower": "schedule", "displayScheduleEnabled": False}) == (
        "schedule"
    )


def test_an_invalid_stored_value_falls_back_to_the_schedule_switch():
    assert effective_mode({"screenPower": "dim", "displayScheduleEnabled": True}) == "schedule"
    assert effective_mode({"screenPower": 3}) == "always_on"
    assert effective_mode({"screen_power": None, "displayScheduleEnabled": True}) == "schedule"


def test_a_screens_own_layer_decides_its_mode_over_the_household():
    """A layer from before the mode existed carries only the schedule switch."""
    household = {"screenPower": "schedule", "displayScheduleEnabled": True}
    assert effective_mode_for(household, {}) == "schedule"
    assert effective_mode_for(household, None) == "schedule"
    # The old per-screen toggle off still means Always on.
    assert effective_mode_for(household, {"displayScheduleEnabled": False}) == "always_on"
    assert effective_mode_for(household, {"display_schedule_enabled": False}) == "always_on"
    # A screen's own explicit mode wins over its switch.
    assert (
        effective_mode_for(household, {"screenPower": "external", "displayScheduleEnabled": True})
        == "external"
    )
    assert effective_mode_for(household, {"screen_power": "always_on"}) == "always_on"


def test_a_mode_write_keeps_the_schedule_switch_in_step():
    assert sync_mode_keys({"screenPower": "external", "displayName": "Hall"}) == {
        "screenPower": "external",
        "displayScheduleEnabled": False,
        "displayName": "Hall",
    }
    assert sync_mode_keys({"screenPower": "schedule"}) == {
        "screenPower": "schedule",
        "displayScheduleEnabled": True,
    }


def test_an_old_page_writing_the_switch_adds_the_mode():
    assert sync_mode_keys({"displayScheduleEnabled": True}) == {
        "screenPower": "schedule",
        "displayScheduleEnabled": True,
    }
    assert sync_mode_keys({"display_schedule_enabled": False}) == {
        "screenPower": "always_on",
        "displayScheduleEnabled": False,
    }


def test_the_mode_wins_when_a_write_carries_both():
    assert sync_mode_keys({"screenPower": "always_on", "displayScheduleEnabled": True}) == {
        "screenPower": "always_on",
        "displayScheduleEnabled": False,
    }


def test_a_write_without_either_key_is_untouched():
    layer = {"displayName": "Hall", "displaySchedule": []}
    assert sync_mode_keys(layer) is layer


def test_the_household_spelling_is_written_in_snake_case():
    assert sync_mode_keys({"screen_power": "external", "time_format": "12h"}, snake=True) == {
        "screen_power": "external",
        "display_schedule_enabled": False,
        "time_format": "12h",
    }
    # A camel/camel pair is normalised to the household spelling.
    assert sync_mode_keys({"screenPower": "schedule"}, snake=True) == {
        "screen_power": "schedule",
        "display_schedule_enabled": True,
    }


def test_the_schema_accepts_only_the_three_modes():
    for mode in ("schedule", "always_on", "external"):
        assert ConfigUpdate(screenPower=mode).model_dump()["screenPower"] == mode
    with pytest.raises(ValidationError):
        ConfigUpdate(screenPower="always-on")


def test_the_schema_validates_the_snake_case_spelling_too():
    assert ConfigUpdate(screen_power="external").model_dump()["screen_power"] == "external"
    with pytest.raises(ValidationError):
        ConfigUpdate(screen_power="always-on")


def test_set_mode_spellings_writes_both():
    from app.services.screen_power import set_mode_spellings

    cfg = {"screen_power": "external", "screenPower": "external", "display_schedule_enabled": False}
    set_mode_spellings(cfg, "schedule")
    assert cfg["screen_power"] == cfg["screenPower"] == "schedule"


def test_sanitize_drops_an_invalid_stored_mode():
    assert sanitize_overrides({"screenPower": "dim", "displayName": "Hall"}) == {
        "displayName": "Hall"
    }
    assert sanitize_overrides({"screen_power": "external"}) == {"screen_power": "external"}
