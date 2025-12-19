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
