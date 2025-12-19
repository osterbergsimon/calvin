"""Integration tests for config API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_get_config(test_client: TestClient):
    """Test getting configuration via API."""
    response = test_client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    # Should have default values
    assert "orientation" in data or "calendarSplit" in data


@pytest.mark.integration
def test_update_config(test_client: TestClient):
    """Test updating configuration via API."""
    # Get current config
    get_response = test_client.get("/api/config")
    assert get_response.status_code == 200

    # Update config
    update_data = {
        "orientation": "portrait",
        "calendarSplit": 75.0,
    }
    update_response = test_client.post("/api/config", json=update_data)
    assert update_response.status_code == 200

    # Verify update
    updated_config = update_response.json()
    assert updated_config.get("orientation") == "portrait"
    assert updated_config.get("calendarSplit") == 75.0


@pytest.mark.integration
def test_update_config_partial(test_client: TestClient):
    """Test partial config update."""
    # Update only one field
    update_data = {"orientation": "landscape"}
    response = test_client.post("/api/config", json=update_data)
    assert response.status_code == 200

    # Verify only that field changed
    config = response.json()
    assert config.get("orientation") == "landscape"


@pytest.mark.integration
def test_update_config_all_properties(test_client: TestClient):
    """Test updating all config properties."""
    update_data = {
        "orientation": "portrait",
        "calendarSplit": 73.0,
        "photoFrameEnabled": True,
        "photoFrameTimeout": 600,
        "showUI": False,
        "photoRotationInterval": 45,
        "calendarViewMode": "rolling",
        "timeFormat": "12h",
        "showModeIndicator": False,
        "modeIndicatorTimeout": 10,
        "weekStartDay": 1,
        "showWeekNumbers": True,
        "sideViewPosition": "left",
        "themeMode": "dark",
        "darkModeStart": 20,
        "darkModeEnd": 7,
        "displayScheduleEnabled": True,
        "displaySchedule": [
            {"day": 0, "enabled": True, "onTime": "06:00", "offTime": "22:00"},
            {"day": 1, "enabled": True, "onTime": "06:00", "offTime": "22:00"},
        ],
        "displayTimeoutEnabled": True,
        "displayTimeout": 300,
        "rebootComboKey1": "KEY_1",
        "rebootComboKey2": "KEY_7",
        "rebootComboDuration": 5000,
        "imageDisplayMode": "fit",
        "timezone": "America/New_York",
    }
    response = test_client.post("/api/config", json=update_data)
    assert response.status_code == 200
    config = response.json()

    # Verify all properties were updated
    assert config.get("orientation") == "portrait"
    assert config.get("calendarSplit") == 73.0
    assert config.get("photoFrameEnabled") is True
    assert config.get("photoFrameTimeout") == 600
    assert config.get("showUI") is False
    assert config.get("photoRotationInterval") == 45
    assert config.get("calendarViewMode") == "rolling"
    assert config.get("timeFormat") == "12h"
    assert config.get("showModeIndicator") is False
    assert config.get("modeIndicatorTimeout") == 10
    assert config.get("weekStartDay") == 1
    assert config.get("showWeekNumbers") is True
    assert config.get("sideViewPosition") == "left"
    assert config.get("themeMode") == "dark"
    assert config.get("darkModeStart") == 20
    assert config.get("darkModeEnd") == 7
    assert config.get("displayScheduleEnabled") is True
    assert isinstance(config.get("displaySchedule"), list)
    assert config.get("displayTimeoutEnabled") is True
    assert config.get("displayTimeout") == 300
    assert config.get("rebootComboKey1") == "KEY_1"
    assert config.get("rebootComboKey2") == "KEY_7"
    assert config.get("rebootComboDuration") == 5000
    assert config.get("imageDisplayMode") == "fit"
    assert config.get("timezone") == "America/New_York"


@pytest.mark.integration
def test_update_config_display_schedule_json_string(test_client: TestClient):
    """Test updating display schedule as JSON string."""
    schedule_json = '[{"day": 0, "enabled": true, "onTime": "06:00", "offTime": "22:00"}]'
    update_data = {"displaySchedule": schedule_json}
    response = test_client.post("/api/config", json=update_data)
    assert response.status_code == 200
    config = response.json()
    assert isinstance(config.get("displaySchedule"), list)
    assert len(config.get("displaySchedule")) == 1


@pytest.mark.integration
def test_update_config_timezone_null(test_client: TestClient):
    """Test setting timezone to null."""
    update_data = {"timezone": None}
    response = test_client.post("/api/config", json=update_data)
    assert response.status_code == 200
    config = response.json()
    # None should be properly handled now
    assert config.get("timezone") is None
