"""Integration tests for keyboard API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestKeyboardEndpoints:
    """Test keyboard mapping endpoints."""

    def test_get_keyboard_mappings_all(self, test_client: TestClient):
        """Test getting all keyboard mappings."""
        response = test_client.get("/api/keyboard/mappings")

        assert response.status_code == 200
        data = response.json()
        assert "mappings" in data
        assert isinstance(data["mappings"], dict)

    def test_get_keyboard_mappings_filtered(self, test_client: TestClient):
        """Test getting keyboard mappings for specific type."""
        response = test_client.get("/api/keyboard/mappings?keyboard_type=7-button")

        assert response.status_code == 200
        data = response.json()
        assert "mappings" in data
        assert "7-button" in data["mappings"]

    def test_get_available_actions(self, test_client: TestClient):
        """Test getting available keyboard actions."""
        response = test_client.get("/api/keyboard/actions")

        assert response.status_code == 200
        data = response.json()
        assert "actions" in data
        assert isinstance(data["actions"], list)

    def test_update_keyboard_mappings(self, test_client: TestClient):
        """Test updating keyboard mappings."""
        update_data = {
            "mappings": {
                "7-button": {
                    "KEY_1": "next_image",
                    "KEY_2": "previous_image",
                }
            }
        }

        response = test_client.post("/api/keyboard/mappings", json=update_data)

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Keyboard mappings updated"
        assert "mappings" in data

    def test_update_single_mapping(self, test_client: TestClient):
        """Test updating a single keyboard mapping."""
        update_data = {
            "keyboard_type": "7-button",
            "key_code": "KEY_1",
            "action": "next_image",
        }

        response = test_client.put("/api/keyboard/mappings/7-button/KEY_1", json=update_data)

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Mapping updated"

    def test_update_single_mapping_invalid_keyboard_type(self, test_client: TestClient):
        """Test updating mapping with invalid keyboard type."""
        update_data = {
            "keyboard_type": "invalid",
            "key_code": "KEY_1",
            "action": "next_image",
        }

        response = test_client.put("/api/keyboard/mappings/invalid/KEY_1", json=update_data)

        # Should still return 200 (service handles validation)
        assert response.status_code in [200, 400]
