"""Integration tests for calendar API endpoints."""

import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_get_calendar_events(test_client: TestClient):
    """Test getting calendar events."""
    # Get events for the next 30 days
    start_date = datetime.now(timezone.utc)
    end_date = start_date + timedelta(days=30)
    
    response = test_client.get(
        "/api/calendar/events",
        params={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "events" in data
    assert isinstance(data["events"], list)


@pytest.mark.integration
def test_get_calendar_sources(test_client: TestClient):
    """Test getting calendar sources."""
    response = test_client.get("/api/calendar/sources")
    assert response.status_code == 200
    data = response.json()
    assert "sources" in data
    assert isinstance(data["sources"], list)


@pytest.mark.integration
def test_add_calendar_source(test_client: TestClient):
    """Test adding a calendar source."""
    # Clean up any existing source with this ID first
    test_client.delete("/api/calendar/sources/test-calendar-1")  # Ignore 404
    
    source_data = {
        "id": "test-calendar-1",
        "type": "google",
        "name": "Test Calendar",
        "enabled": True,
        "ical_url": "https://calendar.google.com/calendar/ical/test/basic.ics",
    }
    response = test_client.post("/api/calendar/sources", json=source_data)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test-calendar-1"
    assert data["name"] == "Test Calendar"
    assert data["type"] == "google"


@pytest.mark.integration
def test_remove_calendar_source(test_client: TestClient):
    """Test removing a calendar source."""
    # First add a source
    source_data = {
        "id": "test-calendar-2",
        "type": "google",
        "name": "Test Calendar 2",
        "enabled": True,
        "ical_url": "https://calendar.google.com/calendar/ical/test2/basic.ics",
    }
    test_client.post("/api/calendar/sources", json=source_data)
    
    # Then remove it
    response = test_client.delete("/api/calendar/sources/test-calendar-2")
    assert response.status_code == 200
    
    # Verify it's gone
    sources_response = test_client.get("/api/calendar/sources")
    sources = sources_response.json()["sources"]
    source_ids = [s["id"] for s in sources]
    assert "test-calendar-2" not in source_ids

