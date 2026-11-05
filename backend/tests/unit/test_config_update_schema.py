"""Unit tests for the config-update schema and stored-override sanitising."""

import pytest
from loguru import logger

from app.schemas.config_update import ConfigUpdate, sanitize_overrides


def _design(**overrides):
    design = {
        "version": 1,
        "horizontal": {
            "zones": {
                "left": ["logo", "room", "pageDots"],
                "center": ["time", "date"],
                "right": ["tiles", "tile:weather", "status"],
            },
            "hidden": ["tile:energy"],
            "parts": {
                "logo": {"size": "m"},
                "room": {"size": "m"},
                "time": {"size": "m", "seconds": False},
                "date": {"size": "m", "underTime": False},
            },
            "barHeight": "normal",
            "tileSize": "m",
        },
        "vertical": {
            "zones": {"top": ["logo"], "middle": ["time"], "bottom": ["tiles", "status"]},
            "hidden": [],
            "parts": {"time": {"size": "l", "style": "stacked"}},
            "barHeight": "slim",
            "tileSize": 18,
        },
    }
    design.update(overrides)
    return design


@pytest.mark.unit
def test_clock_bar_design_accepts_the_documented_shape():
    update = ConfigUpdate(clockBarDesign=_design())

    design = update.model_dump()["clockBarDesign"]
    assert design["version"] == 1
    assert design["horizontal"]["zones"]["right"] == ["tiles", "tile:weather", "status"]
    assert design["horizontal"]["parts"]["time"]["size"] == "m"
    assert design["horizontal"]["parts"]["time"]["seconds"] is False


@pytest.mark.unit
def test_clock_bar_design_rejects_an_unknown_zone():
    design = _design()
    design["horizontal"]["zones"]["middle"] = ["time"]

    with pytest.raises(ValueError):
        ConfigUpdate(clockBarDesign=design)


@pytest.mark.unit
def test_clock_bar_design_rejects_an_unknown_size_step():
    design = _design()
    design["horizontal"]["parts"]["time"]["size"] = "huge"

    with pytest.raises(ValueError):
        ConfigUpdate(clockBarDesign=design)


@pytest.mark.unit
def test_clock_bar_design_rejects_a_custom_size_outside_the_cap():
    design = _design()
    design["horizontal"]["parts"]["date"]["size"] = 400

    with pytest.raises(ValueError):
        ConfigUpdate(clockBarDesign=design)


@pytest.mark.unit
def test_clock_bar_design_caps_the_whole_payload():
    long_id = "tile:" + ("x" * 120)
    design = _design()
    for shape in ("horizontal", "vertical"):
        for zone in design[shape]["zones"]:
            design[shape]["zones"][zone] = [long_id] * 200
        design[shape]["hidden"] = [long_id] * 200

    with pytest.raises(ValueError):
        ConfigUpdate(clockBarDesign=design)


@pytest.mark.unit
def test_clock_bar_design_is_admin_only():
    from app.security.route_policy import CONFIG_DISPLAY_KEYS

    assert "clockBarDesign" not in CONFIG_DISPLAY_KEYS


@pytest.mark.unit
def test_clock_bar_design_is_not_a_per_screen_override():
    """The design is one household key (§4); a stored per-screen copy is dropped."""
    assert sanitize_overrides({"clockBarDesign": _design()}) == {}


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
