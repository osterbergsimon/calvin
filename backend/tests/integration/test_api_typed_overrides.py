"""Per-screen settings are typed on both config write paths (settings-scope §7.8).

Every key a screen page can write is declared on ``ConfigUpdate``, so a value of
the wrong shape is rejected instead of being stored and later rendered. The
kiosk override route answers 400 (it validates with that model); ``POST
/api/config`` answers 422 like every other request-body validation error.

Plugin and future household keys stay allowed (``extra="allow"``), so this is
not a closed schema.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

# (key, a valid value, a value the type/range rejects)
PER_SCREEN_VALUES = [
    ("effectsLevel", "full", "turbo"),
    ("orientation", "portrait", "sideways"),
    ("orientationFlipped", True, "maybe"),
    ("applyDisplayRotation", False, "maybe"),
    ("displayScheduleEnabled", True, "sometimes"),
    ("displaySchedule", [], 5),
    ("displayTimeoutEnabled", True, "maybe"),
    ("displayTimeout", 0, "soon"),
    ("touchControls", "on", "sometimes"),
    ("onScreenKeyboard", "off", 2),
    ("photoFrameEnabled", True, "maybe"),
    ("photoFrameTimeout", 300, "later"),
    ("photoFrameSourceIds", ["album"], "album"),
    ("loadingLight", "pulse", "sparkle"),
    ("layoutMode", "phone", "tablet"),
    ("showUI", False, "maybe"),
    ("clockBarShowInKiosk", True, "maybe"),
    ("tapAnywhereReveal", True, "maybe"),
    ("hotCornerPosition", "top-right", "middle"),
    ("hotCornerOpacity", 55, 150),
    ("hotCornerSize", 64, 0),
    ("hotCornerLongPressMs", 500, -1),
    ("focusLightMode", "always", "sometimes"),
    ("focusLightDimOthers", True, "maybe"),
    ("keyboardFeedbackEnabled", True, "maybe"),
    ("keyboardFeedbackMode", "small", "huge"),
    ("touchControlSize", "large", "huge"),
    ("uiSize", "compact", "tiny"),
    ("themeMode", "dark", "sepia"),
    ("selectedTheme", "midnight", 5),
    ("darkModeStart", 21, 24),
    ("darkModeEnd", 7, -1),
    ("typeTheme", "marquee", 3),
    ("availableScreens", ["screen-home"], "screen-home"),
    ("defaultScreenId", "screen-home", 5),
]


@pytest.fixture(autouse=True)
def _host_control_off(monkeypatch):
    """A config write with orientation must never reach the host's display."""
    monkeypatch.setattr("app.config.settings.host_control", False)


@pytest.mark.integration
@pytest.mark.parametrize(("key", "valid", "invalid"), PER_SCREEN_VALUES)
def test_kiosk_overrides_accept_valid_and_reject_invalid(
    test_client: TestClient, key, valid, invalid
):
    ok = test_client.put("/api/kiosks/k-typed/overrides", json={"overrides": {key: valid}})
    assert ok.status_code == 200, ok.text
    assert test_client.get("/api/kiosks/k-typed/overrides").json()["overrides"][key] == valid

    bad = test_client.put("/api/kiosks/k-typed/overrides", json={"overrides": {key: invalid}})
    assert bad.status_code == 400, f"{key}={invalid!r} accepted: {bad.text}"
    # The rejected write changed nothing.
    assert test_client.get("/api/kiosks/k-typed/overrides").json()["overrides"][key] == valid


@pytest.mark.integration
@pytest.mark.parametrize(("key", "valid", "invalid"), PER_SCREEN_VALUES)
def test_config_accepts_valid_and_rejects_invalid(test_client: TestClient, key, valid, invalid):
    ok = test_client.post("/api/config", json={key: valid})
    assert ok.status_code == 200, ok.text

    bad = test_client.post("/api/config", json={key: invalid})
    assert bad.status_code == 422, f"{key}={invalid!r} accepted: {bad.text}"


@pytest.mark.integration
def test_unknown_keys_stay_allowed_on_both_paths(test_client: TestClient):
    """Plugins and future household settings are not a closed schema."""
    override = {"pluginWeatherUnits": {"unit": "celsius"}, "someFutureSetting": [1, 2]}
    assert (
        test_client.put("/api/kiosks/k-plugin/overrides", json={"overrides": override}).status_code
        == 200
    )
    stored = test_client.get("/api/kiosks/k-plugin/overrides").json()["overrides"]
    assert stored["pluginWeatherUnits"] == {"unit": "celsius"}
    assert stored["someFutureSetting"] == [1, 2]

    assert test_client.post("/api/config", json={"someFutureSetting": [1, 2]}).status_code == 200


@pytest.mark.integration
def test_stored_bad_overrides_do_not_break_loading(test_client: TestClient):
    """A value stored before this validation (or hand-edited) is dropped on read."""
    from app.services import kiosk_registry

    stored = {
        "themeMode": "sepia",  # invalid: not a mode
        "hotCornerOpacity": "lots",  # invalid: not an int
        "orientation": "portrait",  # valid: must survive
        "pluginWeatherUnits": {"unit": "celsius"},  # unknown: must survive
    }
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(kiosk_registry.set_overrides("k-stale", stored))
    finally:
        loop.close()

    got = test_client.get("/api/kiosks/k-stale/overrides")
    assert got.status_code == 200
    overrides = got.json()["overrides"]
    assert overrides["orientation"] == "portrait"
    assert overrides["pluginWeatherUnits"] == {"unit": "celsius"}
    assert "themeMode" not in overrides
    assert "hotCornerOpacity" not in overrides

    effective = test_client.get("/api/kiosks/k-stale/config")
    assert effective.status_code == 200
    body = effective.json()
    assert body["orientation"] == "portrait"
    assert body["themeMode"] != "sepia"
    assert body["pluginWeatherUnits"] == {"unit": "celsius"}

    listed = test_client.get("/api/kiosks").json()["kiosks"]
    row = next(k for k in listed if k["id"] == "k-stale")
    assert row["overrides"] == overrides
