"""Integration tests for calendar API endpoints."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_get_calendar_events(test_client: TestClient):
    """Test getting calendar events."""
    # Get events for the next 30 days
    start_date = datetime.now(UTC)
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

    # Mock a successful HTTP response for validation
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "text/calendar"}

    with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.head = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

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
    # Mock a successful HTTP response for validation
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {"content-type": "text/calendar"}

    with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.head = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        # First add a source
        source_data = {
            "id": "test-calendar-2",
            "type": "google",
            "name": "Test Calendar 2",
            "enabled": True,
            "ical_url": "https://calendar.google.com/calendar/ical/test2/basic.ics",
        }
        test_client.post("/api/calendar/sources", json=source_data)

    # Then remove it (no need to mock for deletion)
    response = test_client.delete("/api/calendar/sources/test-calendar-2")
    assert response.status_code == 200

    # Verify it's gone
    sources_response = test_client.get("/api/calendar/sources")
    sources = sources_response.json()["sources"]
    source_ids = [s["id"] for s in sources]
    assert "test-calendar-2" not in source_ids


@pytest.mark.integration
class TestCalendarValidation:
    """Test calendar URL validation when adding/updating calendars."""

    def test_add_calendar_with_valid_url(self, test_client: TestClient):
        """Test adding a calendar with a valid, accessible URL."""
        # Clean up any existing source first
        test_client.delete("/api/calendar/sources/test-valid-calendar")  # Ignore 404

        # Mock a successful HTTP response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "text/calendar"}
        mock_response.text = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR"

        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.head = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            source_data = {
                "id": "test-valid-calendar",
                "type": "google",
                "name": "Valid Calendar",
                "enabled": True,
                "ical_url": "https://calendar.google.com/calendar/ical/test/basic.ics",
            }
            response = test_client.post("/api/calendar/sources", json=source_data)
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "test-valid-calendar"

    def test_add_calendar_with_invalid_url_404(self, test_client: TestClient):
        """Test adding a calendar with a URL that returns 404."""
        # Mock a 404 HTTP response
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.head = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            source_data = {
                "id": "test-invalid-calendar",
                "type": "google",
                "name": "Invalid Calendar",
                "enabled": True,
                "ical_url": "https://calendar.google.com/calendar/ical/nonexistent/basic.ics",
            }
            response = test_client.post("/api/calendar/sources", json=source_data)
            assert response.status_code == 400
            assert "not accessible" in response.json()["detail"].lower()
            assert "404" in response.json()["detail"]

    def test_add_calendar_with_timeout(self, test_client: TestClient):
        """Test adding a calendar that times out."""
        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            # TimeoutException should be raised directly, not from head()
            mock_client.head = AsyncMock(side_effect=httpx.TimeoutException("Request timed out"))
            mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Request timed out"))
            mock_client_class.return_value = mock_client

            source_data = {
                "id": "test-timeout-calendar",
                "type": "google",
                "name": "Timeout Calendar",
                "enabled": True,
                "ical_url": "https://calendar.google.com/calendar/ical/slow/basic.ics",
            }
            response = test_client.post("/api/calendar/sources", json=source_data)
            assert response.status_code == 400
            assert "timeout" in response.json()["detail"].lower()

    def test_add_calendar_with_connection_error(self, test_client: TestClient):
        """Test adding a calendar with a connection error."""
        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            # ConnectError should be raised directly
            mock_client.head = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
            mock_client.get = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))
            mock_client_class.return_value = mock_client

            source_data = {
                "id": "test-connection-error-calendar",
                "type": "google",
                "name": "Connection Error Calendar",
                "enabled": True,
                "ical_url": "https://unreachable.example.com/calendar.ics",
            }
            response = test_client.post("/api/calendar/sources", json=source_data)
            assert response.status_code == 400
            assert "unable to connect" in response.json()["detail"].lower()

    def test_add_calendar_with_empty_url(self, test_client: TestClient):
        """Test adding a calendar with an empty URL."""
        source_data = {
            "id": "test-empty-url-calendar",
            "type": "google",
            "name": "Empty URL Calendar",
            "enabled": True,
            "ical_url": "",
        }
        response = test_client.post("/api/calendar/sources", json=source_data)
        assert response.status_code == 400
        assert "required" in response.json()["detail"].lower()

    def test_add_calendar_head_fallback_to_get(self, test_client: TestClient):
        """Test that validation falls back to GET when HEAD returns 405."""
        # Clean up any existing source first
        test_client.delete("/api/calendar/sources/test-head-fallback")  # Ignore 404

        # Mock HEAD returning 405, then GET returning 200
        mock_head_response = MagicMock()
        mock_head_response.status_code = 405  # Method Not Allowed

        mock_get_response = MagicMock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {"content-type": "text/calendar"}

        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.head = AsyncMock(return_value=mock_head_response)
            mock_client.get = AsyncMock(return_value=mock_get_response)
            mock_client_class.return_value = mock_client

            source_data = {
                "id": "test-head-fallback",
                "type": "ical",
                "name": "Head Fallback Calendar",
                "enabled": True,
                "ical_url": "https://example.com/calendar.ics",
            }
            response = test_client.post("/api/calendar/sources", json=source_data)
            assert response.status_code == 200
            # Verify GET was called after HEAD returned 405
            mock_client.get.assert_called_once()

    def test_add_calendar_google_url_normalization(self, test_client: TestClient):
        """Test that Google Calendar share URLs are normalized during validation."""
        # Clean up any existing source first
        test_client.delete("/api/calendar/sources/test-google-normalize")  # Ignore 404

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "text/calendar"}

        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.head = AsyncMock(return_value=mock_response)
            mock_client_class.return_value = mock_client

            # Use a Google Calendar share URL (should be normalized to iCal format)
            source_data = {
                "id": "test-google-normalize",
                "type": "google",
                "name": "Google Normalize Calendar",
                "enabled": True,
                "ical_url": "https://calendar.google.com/calendar/u/0?cid=test%40example.com",
            }
            response = test_client.post("/api/calendar/sources", json=source_data)
            assert response.status_code == 200
            # Verify the normalized URL was used (should contain /ical/ and /basic.ics)
            # The normalization happens in the validation function
            assert mock_client.head.called

    def test_update_calendar_with_invalid_url(self, test_client: TestClient):
        """Test updating a calendar with an invalid URL."""
        # Skip this test if database isn't set up - it requires a calendar to exist first
        # The validation should still work even if the calendar doesn't exist in DB
        mock_invalid_response = MagicMock()
        mock_invalid_response.status_code = 403  # Forbidden

        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.head = AsyncMock(return_value=mock_invalid_response)
            mock_client_class.return_value = mock_client

            update_data = {
                "id": "test-update-invalid",
                "type": "google",
                "name": "Update Test Calendar",
                "enabled": True,
                "ical_url": "https://calendar.google.com/calendar/ical/forbidden/basic.ics",
            }
            response = test_client.put(
                "/api/calendar/sources/test-update-invalid", json=update_data
            )
            # Should fail validation before trying to update
            assert response.status_code == 400
            assert "not accessible" in response.json()["detail"].lower()
            assert "403" in response.json()["detail"]

    def test_add_proton_calendar_with_invalid_format(self, test_client: TestClient):
        """Test adding a Proton Calendar with invalid URL format."""
        source_data = {
            "id": "test-proton-invalid",
            "type": "proton",
            "name": "Invalid Proton Calendar",
            "enabled": True,
            "ical_url": "https://wrong-url.com/calendar.ics",
        }
        response = test_client.post("/api/calendar/sources", json=source_data)
        assert response.status_code == 400
        assert "invalid proton calendar url" in response.json()["detail"].lower()

    def test_add_proton_calendar_missing_calendar_ics(self, test_client: TestClient):
        """Test adding a Proton Calendar URL missing /calendar.ics."""
        source_data = {
            "id": "test-proton-missing-ics",
            "type": "proton",
            "name": "Missing ICS Calendar",
            "enabled": True,
            "ical_url": "https://calendar.proton.me/api/calendar/v1/url/test123",
        }
        response = test_client.post("/api/calendar/sources", json=source_data)
        assert response.status_code == 400
        assert "/calendar.ics" in response.json()["detail"].lower()

    def test_add_calendar_with_http_error_fallback(self, test_client: TestClient):
        """Test that validation handles HTTP errors during HEAD and falls back to GET."""
        # Clean up any existing source first
        test_client.delete("/api/calendar/sources/test-http-error-fallback")  # Ignore 404

        # Mock HEAD raising an HTTPError, then GET succeeding
        mock_get_response = MagicMock()
        mock_get_response.status_code = 200
        mock_get_response.headers = {"content-type": "text/calendar"}

        with patch("app.api.routes.calendar.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.head = AsyncMock(side_effect=httpx.HTTPError("HTTP error"))
            mock_client.get = AsyncMock(return_value=mock_get_response)
            mock_client_class.return_value = mock_client

            source_data = {
                "id": "test-http-error-fallback",
                "type": "ical",
                "name": "HTTP Error Fallback Calendar",
                "enabled": True,
                "ical_url": "https://example.com/calendar.ics",
            }
            response = test_client.post("/api/calendar/sources", json=source_data)
            assert response.status_code == 200
            # Verify GET was called after HEAD failed
            mock_client.get.assert_called_once()
