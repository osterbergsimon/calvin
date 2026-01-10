"""Integration tests for health API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestHealthEndpoints:
    """Test health check endpoints."""

    def test_health_check(self, test_client: TestClient):
        """Test basic health check endpoint."""
        response = test_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data == {"status": "healthy"}

    def test_detailed_health_check(self, test_client: TestClient):
        """Test detailed health check endpoint."""
        response = test_client.get("/api/health/detailed")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "services" in data
        assert data["services"]["api"] == "running"
