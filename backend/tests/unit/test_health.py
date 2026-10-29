"""Tests for health check endpoints."""

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient


@pytest.mark.unit
def test_health_check(test_client: TestClient):
    """The basic health check reports the database it depends on (audit D14)."""
    response = test_client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "ok"}


@pytest.mark.unit
def test_health_check_reports_a_broken_database(test_client: TestClient, monkeypatch):
    """A failed DB query makes /api/health unhealthy with a 503."""
    import app.database as database_module

    broken = AsyncMock(side_effect=RuntimeError("database is locked"))
    monkeypatch.setattr(database_module.database, "fetch_val", broken)

    response = test_client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "unhealthy", "database": "error"}


@pytest.mark.unit
def test_details_of_a_database_failure_are_not_leaked(test_client: TestClient, monkeypatch):
    """The 503 body stays generic; the exception goes to the log only (audit S9)."""
    import app.database as database_module

    broken = AsyncMock(side_effect=RuntimeError("secret path /var/lib/calvin/db"))
    monkeypatch.setattr(database_module.database, "fetch_val", broken)

    body = test_client.get("/api/health").text

    assert "secret path" not in body


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
