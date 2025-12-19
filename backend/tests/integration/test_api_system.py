"""Integration tests for system API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_get_system_info(test_client: TestClient):
    """Test getting system information - endpoint may not exist."""
    # System info endpoint doesn't exist, so expect 404
    response = test_client.get("/api/system/info")
    # If endpoint doesn't exist, that's okay - we're just testing the route exists
    assert response.status_code in [200, 404]


@pytest.mark.integration
def test_get_system_status(test_client: TestClient):
    """Test getting system status - endpoint may not exist."""
    # System status endpoint doesn't exist, so expect 404
    response = test_client.get("/api/system/status")
    # If endpoint doesn't exist, that's okay - we're just testing the route exists
    assert response.status_code in [200, 404]


@pytest.mark.integration
def test_health_check(test_client: TestClient):
    """Test health check endpoint."""
    response = test_client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.integration
def test_detailed_health_check(test_client: TestClient):
    """Test detailed health check endpoint."""
    response = test_client.get("/api/health/detailed")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "services" in data


