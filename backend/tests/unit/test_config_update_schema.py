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


CLOCK_BAR_DESIGN = {
    "version": 1,
    "horizontal": {
        "zones": {
            "left": ["logo", "room", "pageDots"],
            "center": ["time", "date"],
            "right": ["tiles", "status"],
        },
        "hidden": [],
        "parts": {
            "time": {"size": "m", "seconds": False},
            "date": {"size": 13, "underTime": True},
        },
        "barHeight": "normal",
        "tileSize": "m",
    },
    "vertical": {
        "zones": {"top": ["logo"], "middle": ["time"], "bottom": ["tiles", "status"]},
        "hidden": ["room", "date"],
        "parts": {"time": {"size": "l", "style": "stacked"}, "date": {"style": "stacked"}},
        "barHeight": "slim",
        "tileSize": 18,
    },
}


@pytest.mark.unit
def test_clock_bar_design_accepts_the_documented_shape():
    update = ConfigUpdate(clockBarDesign=CLOCK_BAR_DESIGN)
    dumped = update.model_dump(exclude_unset=True)["clockBarDesign"]

    assert dumped["horizontal"]["zones"]["left"] == ["logo", "room", "pageDots"]
    assert dumped["horizontal"]["parts"]["date"]["size"] == 13
    assert dumped["vertical"]["barHeight"] == "slim"


@pytest.mark.unit
def test_clock_bar_design_accepts_only_one_shape():
    update = ConfigUpdate(
        clockBarDesign={"version": 1, "horizontal": CLOCK_BAR_DESIGN["horizontal"]}
    )
    assert update.model_dump(exclude_unset=True)["clockBarDesign"].get("vertical") is None


@pytest.mark.unit
@pytest.mark.parametrize(
    "patch",
    [
        {"version": 2},
        {"horizontal": {"zones": {"sideways": []}}},
        {"horizontal": {"zones": {"left": [123]}}},
        {"horizontal": {"zones": {"left": ["x" * 121]}}},
        {"horizontal": {"zones": {"left": ["x"] * 101}}},
        {"horizontal": {"zones": {}, "barHeight": "huge"}},
        {"horizontal": {"zones": {}, "tileSize": "xl"}},
        {"horizontal": {"zones": {}, "parts": {"time": {"size": 201}}}},
        {"horizontal": {"zones": {}, "parts": {"time": {"size": "xxl"}}}},
        {"horizontal": {"zones": {}, "parts": {"time": {"style": "diagonal"}}}},
        {"horizontal": {"zones": {}, "unknown": True}},
    ],
)
def test_clock_bar_design_rejects_bad_shapes(patch):
    with pytest.raises(ValueError):
        ConfigUpdate(clockBarDesign={"version": 1, **patch})


@pytest.mark.unit
def test_clock_bar_design_is_admin_only():
    """Editing the bar needs admin, like the other clock bar keys."""
    from app.security.route_policy import CONFIG_DISPLAY_KEYS

    assert "clockBarDesign" not in CONFIG_DISPLAY_KEYS
