"""Tests for health check endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.unit
def test_health_check(test_client: TestClient):
    """Test basic health check endpoint."""
    response = test_client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.unit
def test_detailed_health_check(test_client: TestClient):
    """Test detailed health check endpoint."""
    response = test_client.get("/api/health/detailed")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] == "healthy"
    assert "services" in data
    assert "api" in data["services"]
    assert data["services"]["api"] == "running"
