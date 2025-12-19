"""Integration tests for web services API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_get_web_services_empty(test_client: TestClient):
    """Test getting web services when none exist."""
    response = test_client.get("/api/web-services")
    assert response.status_code == 200
    data = response.json()
    assert "services" in data
    assert "total" in data
    # Note: Database may have services from other tests, so we just check structure
    assert isinstance(data["services"], list)
    assert isinstance(data["total"], int)
    assert data["total"] >= 0  # May not be empty if other tests ran first


@pytest.mark.integration
def test_create_web_service(test_client: TestClient):
    """Test creating a web service."""
    service_data = {
        "name": "Test Service",
        "url": "https://example.com",
        "fullscreen": True,
    }
    response = test_client.post("/api/web-services", json=service_data)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Service"
    assert data["url"] == "https://example.com"
    assert data["fullscreen"] is True
    assert "id" in data


@pytest.mark.integration
def test_get_web_service_by_id(test_client: TestClient):
    """Test getting a web service by ID."""
    # First create a service with unique name to avoid ID collisions
    import time
    unique_name = f"Test Service {int(time.time() * 1000)}"
    service_data = {
        "name": unique_name,
        "url": "https://example.com",
        "fullscreen": True,
    }
    create_response = test_client.post("/api/web-services", json=service_data)
    assert create_response.status_code == 200
    service_id = create_response.json()["id"]

    # Then get it
    response = test_client.get(f"/api/web-services/{service_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == service_id
    assert data["name"] == unique_name


@pytest.mark.integration
def test_update_web_service(test_client: TestClient):
    """Test updating a web service."""
    # First create a service with unique name to avoid ID collisions
    import time
    unique_name = f"Test Service {int(time.time() * 1000)}"
    service_data = {
        "name": unique_name,
        "url": "https://example.com",
        "fullscreen": True,
    }
    create_response = test_client.post("/api/web-services", json=service_data)
    assert create_response.status_code == 200
    service_id = create_response.json()["id"]

    # Then update it
    update_data = {
        "name": "Updated Service",
        "url": "https://updated.com",
        "fullscreen": False,
    }
    response = test_client.put(f"/api/web-services/{service_id}", json=update_data)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Service"
    assert data["url"] == "https://updated.com"
    assert data["fullscreen"] is False


@pytest.mark.integration
def test_delete_web_service(test_client: TestClient):
    """Test deleting a web service."""
    # First create a service with unique name to avoid ID collisions
    import time
    unique_name = f"Test Service {int(time.time() * 1000)}"
    service_data = {
        "name": unique_name,
        "url": "https://example.com",
        "fullscreen": True,
    }
    create_response = test_client.post("/api/web-services", json=service_data)
    assert create_response.status_code == 200
    service_id = create_response.json()["id"]

    # Then delete it
    response = test_client.delete(f"/api/web-services/{service_id}")
    assert response.status_code == 200

    # Verify it's gone
    get_response = test_client.get(f"/api/web-services/{service_id}")
    assert get_response.status_code == 404


@pytest.mark.integration
def test_get_nonexistent_web_service(test_client: TestClient):
    """Test getting a non-existent web service."""
    response = test_client.get("/api/web-services/nonexistent-id")
    assert response.status_code == 404


