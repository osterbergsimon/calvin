"""Integration tests for keyboard API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_get_keyboard_mappings(test_client: TestClient):
    """Test getting keyboard mappings."""
    response = test_client.get("/api/keyboard/mappings")
    assert response.status_code == 200
    data = response.json()
    assert "mappings" in data
    assert isinstance(data["mappings"], dict)


@pytest.mark.integration
def test_get_keyboard_mappings_by_type(test_client: TestClient):
    """Test getting keyboard mappings for a specific type."""
    response = test_client.get("/api/keyboard/mappings?keyboard_type=7-button")
    assert response.status_code == 200
    data = response.json()
    assert "mappings" in data
    assert isinstance(data["mappings"], dict)


@pytest.mark.integration
def test_update_keyboard_mappings(test_client: TestClient):
    """Test updating keyboard mappings."""
    update_data = {
        "mappings": {
            "7-button": {
                "KEY_1": "generic_next",
                "KEY_2": "generic_prev",
            },
            "standard": {
                "KEY_RIGHT": "generic_next",
                "KEY_LEFT": "generic_prev",
            },
        }
    }
    response = test_client.post("/api/keyboard/mappings", json=update_data)
    assert response.status_code == 200
    data = response.json()
    assert "message" in data


@pytest.mark.integration
def test_update_single_keyboard_mapping(test_client: TestClient):
    """Test updating a single keyboard mapping."""
    update_data = {
        "keyboard_type": "7-button",
        "key_code": "KEY_1",
        "action": "mode_calendar"
    }
    response = test_client.put(
        "/api/keyboard/mappings/7-button/KEY_1", json=update_data
    )
    assert response.status_code == 200
    data = response.json()
    assert "message" in data


@pytest.mark.integration
def test_get_available_actions(test_client: TestClient):
    """Test getting available keyboard actions."""
    response = test_client.get("/api/keyboard/actions")
    assert response.status_code == 200
    data = response.json()
    assert "actions" in data
    assert isinstance(data["actions"], list)
    assert len(data["actions"]) > 0


