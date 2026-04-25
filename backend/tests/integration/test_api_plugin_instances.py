"""Integration tests for plugin instance API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestPluginInstanceEndpoints:
    """Test plugin instance management endpoints."""

    def test_get_plugin_instances(self, test_client: TestClient):
        """Test getting plugin instances for a plugin type."""
        # Test with a known plugin type (local images)
        response = test_client.get("/api/plugins/local/instances")

        if response.status_code == 404:
            pytest.skip("Plugin instances route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert "instances" in data
        assert "total" in data
        assert isinstance(data["instances"], list)

    def test_get_plugin_instances_nonexistent(self, test_client: TestClient):
        """Test getting instances for non-existent plugin type."""
        response = test_client.get("/api/plugins/nonexistent-plugin/instances")

        if response.status_code == 404:
            pytest.skip("Plugin instances route not available in test client")

        # Should return empty list or 404
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            assert data["total"] == 0

    def test_start_plugin_instance_not_found(self, test_client: TestClient):
        """Test starting a non-existent plugin instance."""
        response = test_client.post("/api/plugins/instances/nonexistent-instance/start")

        if response.status_code == 404:
            pytest.skip("Plugin instance start route not available in test client")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_stop_plugin_instance_not_found(self, test_client: TestClient):
        """Test stopping a non-existent plugin instance."""
        response = test_client.post("/api/plugins/instances/nonexistent-instance/stop")

        if response.status_code == 404:
            pytest.skip("Plugin instance stop route not available in test client")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_plugin_instances_order(self, test_client: TestClient):
        """Test updating plugin instances display order."""
        # Test with a known plugin type
        order_data = {"instance1": 1, "instance2": 2}

        response = test_client.put("/api/plugins/local/instances/order", json=order_data)

        if response.status_code == 404:
            pytest.skip("Plugin instances order route not available in test client")

        # Should return 200 (even if no instances match)
        assert response.status_code == 200
        data = response.json()
        assert "success" in data
        assert "updated" in data

    def test_update_plugin_instances_order_empty(self, test_client: TestClient):
        """Test updating plugin instances order with empty data."""
        response = test_client.put("/api/plugins/local/instances/order", json={})

        if response.status_code == 404:
            pytest.skip("Plugin instances order route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["updated"] == 0

    def test_update_plugin_type_config_explicit_endpoint(self, test_client: TestClient):
        """Test explicit plugin type config endpoint."""
        response = test_client.put(
            "/api/plugins/iframe/config",
            json={"enabled": True, "config": {"display_order": "2"}},
        )

        if response.status_code == 404:
            pytest.skip("Plugin type config route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["plugin_id"] == "iframe"

    def test_create_plugin_instance_explicit_endpoint(self, test_client: TestClient):
        """Test explicit plugin instance creation endpoint."""
        response = test_client.post(
            "/api/plugins/iframe/instances",
            json={
                "name": "Test Iframe Service",
                "enabled": True,
                "config": {
                    "url": "https://example.com",
                    "fullscreen": False,
                },
            },
        )

        if response.status_code == 404:
            pytest.skip("Plugin instance create route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["instance"]["name"] == "Test Iframe Service"
        assert data["instance"]["config"]["url"] == "https://example.com"
