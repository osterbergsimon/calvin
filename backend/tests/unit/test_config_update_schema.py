"""Unit tests for the config-update schema and stored-override sanitising."""

import pytest
from loguru import logger

from app.schemas.config_update import ConfigUpdate, sanitize_overrides


@pytest.mark.unit
def test_unknown_keys_are_still_allowed():
    update = ConfigUpdate(**{"pluginWeatherUnits": {"unit": "celsius"}})
    assert update.model_dump()["pluginWeatherUnits"] == {"unit": "celsius"}


@pytest.mark.unit
def test_sanitize_drops_invalid_values_and_keeps_the_rest():
    stored = {
        "effectsLevel": "turbo",
        "themeMode": "dark",
        "hotCornerSize": "big",
        "pluginWeatherUnits": {"unit": "celsius"},
        "_agentUpdateRequested": True,
        "screenNow": {"mode": "off"},
        "displayName": "Kitchen",
    }

    assert sanitize_overrides(stored) == {
        "themeMode": "dark",
        "pluginWeatherUnits": {"unit": "celsius"},
        "_agentUpdateRequested": True,
        "screenNow": {"mode": "off"},
        "displayName": "Kitchen",
    }


@pytest.mark.unit
def test_sanitize_returns_an_empty_dict_for_none():
    assert sanitize_overrides(None) == {}


@pytest.mark.unit
def test_sanitize_validates_the_snake_case_alias_too():
    """A legacy layer may store show_ui/theme_mode; a bad value is dropped."""
    stored = {"show_ui": "maybe", "theme_mode": "dark"}
    assert sanitize_overrides(stored) == {"theme_mode": "dark"}


@pytest.mark.unit
def test_sanitize_logs_a_warning_per_dropped_key():
    messages: list[str] = []
    sink_id = logger.add(
        lambda message: messages.append(message.record["message"]), level="WARNING"
    )
    try:
        sanitize_overrides({"themeMode": "sepia", "hotCornerOpacity": "lots"}, kiosk_id="kitchen")
    finally:
        logger.remove(sink_id)

    assert len(messages) == 2
    assert all("kitchen" in message for message in messages)
    assert any("themeMode" in message for message in messages)
    assert any("hotCornerOpacity" in message for message in messages)
