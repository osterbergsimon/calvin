"""Integration tests for keyboard API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestKeyboardEndpoints:
    def test_get_mappings_is_flat(self, test_client: TestClient):
        response = test_client.get("/api/keyboard/mappings")
        assert response.status_code == 200
        mappings = response.json()["mappings"]
        assert isinstance(mappings, dict)
        # flat: values are action strings, not nested per-type dicts
        assert all(isinstance(v, str) for v in mappings.values())

    def test_post_replaces_mappings(self, test_client: TestClient):
        body = {"mappings": {"KEY_1": "generic_next", "KEY_2": "generic_prev"}}
        response = test_client.post("/api/keyboard/mappings", json=body)
        assert response.status_code == 200
        assert test_client.get("/api/keyboard/mappings").json()["mappings"] == body["mappings"]

    def test_put_single_mapping(self, test_client: TestClient):
        test_client.post("/api/keyboard/mappings", json={"mappings": {"KEY_1": "generic_next"}})
        response = test_client.put("/api/keyboard/mappings/KEY_1", json={"action": "screen_next"})
        assert response.status_code == 200
        assert test_client.get("/api/keyboard/mappings").json()["mappings"]["KEY_1"] == "screen_next"

    def test_delete_single_mapping(self, test_client: TestClient):
        test_client.post("/api/keyboard/mappings", json={"mappings": {"KEY_1": "generic_next", "KEY_2": "generic_prev"}})
        response = test_client.delete("/api/keyboard/mappings/KEY_1")
        assert response.status_code == 200
        remaining = test_client.get("/api/keyboard/mappings").json()["mappings"]
        assert "KEY_1" not in remaining and remaining["KEY_2"] == "generic_prev"

    def test_get_available_actions(self, test_client: TestClient):
        response = test_client.get("/api/keyboard/actions")
        assert response.status_code == 200
        assert isinstance(response.json()["actions"], list)
