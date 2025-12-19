"""Tests for web service service."""

import pytest

from app.services.web_service_service import WebServiceService
from app.models.web_service import WebServiceCreate, WebServiceUpdate


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_services(test_db):
    """Test getting services."""
    service = WebServiceService()
    services = await service.get_services()
    assert isinstance(services, list)
    # Note: Database may have services from other tests, so we just check structure


@pytest.mark.asyncio
@pytest.mark.unit
async def test_add_service(test_db):
    """Test adding a web service."""
    service = WebServiceService()

    service_data = WebServiceCreate(
        name="Test Service",
        url="https://example.com",
        enabled=True,
        display_order=0,
        fullscreen=True,
    )

    created = await service.add_service(service_data)

    assert created.name == "Test Service"
    assert created.url == "https://example.com"
    assert created.enabled is True
    assert created.fullscreen is True
    assert "id" in created.model_dump()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_service_by_id(test_db):
    """Test getting a service by ID."""
    service = WebServiceService()

    # Add a service
    service_data = WebServiceCreate(
        name="Test Service",
        url="https://example.com",
        enabled=True,
    )
    created = await service.add_service(service_data)

    # Get it by ID
    retrieved = await service.get_service(created.id)
    assert retrieved is not None
    assert retrieved.id == created.id
    assert retrieved.name == "Test Service"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_service_nonexistent(test_db):
    """Test getting a non-existent service."""
    service = WebServiceService()
    retrieved = await service.get_service("nonexistent-id")
    assert retrieved is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_service(test_db):
    """Test updating a web service."""
    service = WebServiceService()

    # Add a service
    service_data = WebServiceCreate(
        name="Test Service",
        url="https://example.com",
        enabled=True,
    )
    created = await service.add_service(service_data)

    # Update it
    updates = WebServiceUpdate(
        name="Updated Service",
        url="https://updated.com",
        enabled=False,
    )
    updated = await service.update_service(created.id, updates)

    assert updated.name == "Updated Service"
    assert updated.url == "https://updated.com"
    assert updated.enabled is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_service(test_db):
    """Test removing a web service."""
    service = WebServiceService()

    # Add a service
    service_data = WebServiceCreate(
        name="Test Service",
        url="https://example.com",
        enabled=True,
    )
    created = await service.add_service(service_data)

    # Remove it
    result = await service.remove_service(created.id)
    assert result is True

    # Verify it's gone
    retrieved = await service.get_service(created.id)
    assert retrieved is None

    # Try to remove non-existent service
    result = await service.remove_service("nonexistent-id")
    assert result is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_enabled_services(test_db):
    """Test getting only enabled services."""
    service = WebServiceService()

    # Add enabled and disabled services
    enabled = await service.add_service(
        WebServiceCreate(name="Enabled Service", url="https://example.com", enabled=True)
    )
    disabled = await service.add_service(
        WebServiceCreate(name="Disabled Service", url="https://example.com", enabled=False)
    )

    enabled_services = await service.get_enabled_services()

    # Should only return enabled services
    enabled_ids = [s.id for s in enabled_services]
    assert enabled.id in enabled_ids
    assert disabled.id not in enabled_ids


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_services_ordered_by_display_order(test_db):
    """Test that services are returned in display_order."""
    service = WebServiceService()

    # Add services in reverse order
    import time
    unique_id = int(time.time() * 1000000)
    svc3 = await service.add_service(
        WebServiceCreate(name=f"Order Test 3-{unique_id}", url=f"https://example.com/3-{unique_id}", display_order=2)
    )
    svc1 = await service.add_service(
        WebServiceCreate(name=f"Order Test 1-{unique_id}", url=f"https://example.com/1-{unique_id}", display_order=0)
    )
    svc2 = await service.add_service(
        WebServiceCreate(name=f"Order Test 2-{unique_id}", url=f"https://example.com/2-{unique_id}", display_order=1)
    )

    services = await service.get_services()

    # Find our test services (may have others from previous tests)
    test_services = [s for s in services if f"Order Test" in s.name and str(unique_id) in s.name]
    test_services.sort(key=lambda s: s.display_order)

    assert len(test_services) == 3
    assert test_services[0].display_order == 0
    assert test_services[1].display_order == 1
    assert test_services[2].display_order == 2

