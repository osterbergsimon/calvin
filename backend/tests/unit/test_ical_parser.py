"""Unit tests for iCal parser utility."""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from icalendar import Calendar, Event

from app.models.calendar import CalendarEvent
from app.utils.ical_parser import _parse_vevent, parse_ical_from_file, parse_ical_from_url


@pytest.fixture
def sample_ical_content():
    """Create sample iCal content."""
    cal = Calendar()
    cal.add("prodid", "-//Test Calendar//EN")
    cal.add("version", "2.0")

    # Event 1: Regular timed event
    event1 = Event()
    event1.add("uid", "event1@test.com")
    event1.add("summary", "Test Event 1")
    event1.add("description", "Test description")
    event1.add("location", "Test location")
    event1.add("dtstart", datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC))
    event1.add("dtend", datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC))
    cal.add_component(event1)

    # Event 2: All-day event
    event2 = Event()
    event2.add("uid", "event2@test.com")
    event2.add("summary", "All Day Event")
    event2.add("dtstart", date(2024, 1, 16))
    event2.add("dtend", date(2024, 1, 17))  # Exclusive end date
    cal.add_component(event2)

    # Event 3: Multi-day all-day event
    event3 = Event()
    event3.add("uid", "event3@test.com")
    event3.add("summary", "Multi-Day Event")
    event3.add("dtstart", date(2024, 1, 20))
    event3.add("dtend", date(2024, 1, 23))  # 3 days (20, 21, 22)
    cal.add_component(event3)

    return cal.to_ical()


@pytest.fixture
def sample_vevent():
    """Create a sample VEVENT component."""
    event = Event()
    event.add("uid", "test-event@example.com")
    event.add("summary", "Test Event")
    event.add("description", "Test description")
    event.add("location", "Test location")
    event.add("dtstart", datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC))
    event.add("dtend", datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC))
    return event


@pytest.mark.asyncio
class TestParseIcalFromUrl:
    """Test parse_ical_from_url function."""

    async def test_parse_ical_from_url_success(self, sample_ical_content):
        """Test successful parsing from URL."""
        mock_response = MagicMock()
        mock_response.content = sample_ical_content
        mock_response.headers = {"content-type": "text/calendar"}
        mock_response.raise_for_status = MagicMock()

        with patch("app.utils.ical_parser.httpx.AsyncClient") as mock_client:
            mock_client_instance = MagicMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value = mock_client_instance

            events = await parse_ical_from_url("http://example.com/calendar.ics")

            assert len(events) == 3
            assert all(isinstance(e, CalendarEvent) for e in events)

    async def test_parse_ical_from_url_http_error(self):
        """Test handling of HTTP errors."""
        import httpx

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"
        http_error = httpx.HTTPStatusError("Not Found", request=MagicMock(), response=mock_response)

        with patch("app.utils.ical_parser.httpx.AsyncClient") as mock_client:
            mock_client_instance = MagicMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_instance.get = AsyncMock(side_effect=http_error)
            mock_client.return_value = mock_client_instance

            with pytest.raises(httpx.HTTPStatusError):
                await parse_ical_from_url("http://example.com/calendar.ics")

    async def test_parse_ical_from_url_unexpected_content_type(self, sample_ical_content):
        """Test handling of unexpected content type."""
        mock_response = MagicMock()
        mock_response.content = sample_ical_content
        mock_response.headers = {"content-type": "application/json"}
        mock_response.raise_for_status = MagicMock()

        with patch("app.utils.ical_parser.httpx.AsyncClient") as mock_client:
            mock_client_instance = MagicMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value = mock_client_instance

            # Should still parse successfully (just warns)
            events = await parse_ical_from_url("http://example.com/calendar.ics")
            assert len(events) == 3

    async def test_parse_ical_from_url_text_plain_content_type(self, sample_ical_content):
        """Test handling of text/plain content type."""
        mock_response = MagicMock()
        mock_response.content = sample_ical_content
        mock_response.headers = {"content-type": "text/plain"}
        mock_response.raise_for_status = MagicMock()

        with patch("app.utils.ical_parser.httpx.AsyncClient") as mock_client:
            mock_client_instance = MagicMock()
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_instance.get = AsyncMock(return_value=mock_response)
            mock_client.return_value = mock_client_instance

            events = await parse_ical_from_url("http://example.com/calendar.ics")
            assert len(events) == 3


@pytest.mark.asyncio
class TestParseIcalFromFile:
    """Test parse_ical_from_file function."""

    async def test_parse_ical_from_file_success(self, sample_ical_content, tmp_path):
        """Test successful parsing from file."""
        ical_file = tmp_path / "test.ics"
        ical_file.write_bytes(sample_ical_content)

        events = await parse_ical_from_file(str(ical_file))

        assert len(events) == 3
        assert all(isinstance(e, CalendarEvent) for e in events)

    async def test_parse_ical_from_file_not_found(self, tmp_path):
        """Test handling of file not found."""
        ical_file = tmp_path / "nonexistent.ics"

        with pytest.raises(FileNotFoundError):
            await parse_ical_from_file(str(ical_file))

    async def test_parse_ical_from_file_invalid_content(self, tmp_path):
        """Test handling of invalid iCal content."""
        ical_file = tmp_path / "invalid.ics"
        ical_file.write_text("Not valid iCal content")

        with pytest.raises(Exception):
            await parse_ical_from_file(str(ical_file))


class TestParseVevent:
    """Test _parse_vevent function."""

    def test_parse_vevent_timed_event(self, sample_vevent):
        """Test parsing a timed event."""
        event = _parse_vevent(sample_vevent)

        assert event is not None
        assert isinstance(event, CalendarEvent)
        assert event.id == "test-event@example.com"
        assert event.title == "Test Event"
        assert event.description == "Test description"
        assert event.location == "Test location"
        assert event.all_day is False
        assert event.start == datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC)
        assert event.end == datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC)

    def test_parse_vevent_all_day_event(self):
        """Test parsing an all-day event."""
        event = Event()
        event.add("uid", "allday@test.com")
        event.add("summary", "All Day Event")
        event.add("dtstart", date(2024, 1, 16))
        event.add("dtend", date(2024, 1, 17))  # Exclusive

        result = _parse_vevent(event)

        assert result is not None
        assert result.all_day is True
        # Start should be midnight UTC on the start date
        assert result.start == datetime(2024, 1, 16, 0, 0, 0, tzinfo=UTC)
        # End should be end of the actual last day (Jan 16, since DTEND is exclusive)
        assert result.end == datetime(2024, 1, 16, 23, 59, 59, 999999, tzinfo=UTC)

    def test_parse_vevent_multi_day_all_day_event(self):
        """Test parsing a multi-day all-day event."""
        event = Event()
        event.add("uid", "multiday@test.com")
        event.add("summary", "Multi-Day Event")
        event.add("dtstart", date(2024, 1, 20))
        event.add("dtend", date(2024, 1, 23))  # 3 days: 20, 21, 22

        result = _parse_vevent(event)

        assert result is not None
        assert result.all_day is True
        assert result.start == datetime(2024, 1, 20, 0, 0, 0, tzinfo=UTC)
        # End should be end of Jan 22 (last day of the event)
        assert result.end == datetime(2024, 1, 22, 23, 59, 59, 999999, tzinfo=UTC)

    def test_parse_vevent_naive_datetime(self):
        """Test parsing event with naive datetime (should assume UTC)."""
        event = Event()
        event.add("uid", "naive@test.com")
        event.add("summary", "Naive DateTime Event")
        # Naive datetime (no timezone)
        naive_start = datetime(2024, 1, 15, 10, 0, 0)
        naive_end = datetime(2024, 1, 15, 11, 0, 0)
        event.add("dtstart", naive_start)
        event.add("dtend", naive_end)

        result = _parse_vevent(event)

        assert result is not None
        # Should be converted to UTC
        assert result.start == datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC)
        assert result.end == datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC)

    def test_parse_vevent_missing_dtstart(self):
        """Test parsing event with missing DTSTART."""
        event = Event()
        event.add("uid", "missing-start@test.com")
        event.add("summary", "Missing Start")
        event.add("dtend", datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC))

        result = _parse_vevent(event)

        assert result is None

    def test_parse_vevent_missing_dtend(self):
        """Test parsing event with missing DTEND."""
        event = Event()
        event.add("uid", "missing-end@test.com")
        event.add("summary", "Missing End")
        event.add("dtstart", datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC))

        result = _parse_vevent(event)

        assert result is None

    def test_parse_vevent_missing_summary(self):
        """Test parsing event with missing summary (should use default)."""
        event = Event()
        event.add("uid", "no-summary@test.com")
        event.add("dtstart", datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC))
        event.add("dtend", datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC))

        result = _parse_vevent(event)

        assert result is not None
        assert result.title == "No Title"

    def test_parse_vevent_with_color(self):
        """Test parsing event with color property."""
        event = Event()
        event.add("uid", "colored@test.com")
        event.add("summary", "Colored Event")
        event.add("dtstart", datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC))
        event.add("dtend", datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC))
        event.add("color", "#FF5733")

        result = _parse_vevent(event)

        assert result is not None
        assert result.color == "#FF5733"

    def test_parse_vevent_empty_description(self):
        """Test parsing event with empty description."""
        event = Event()
        event.add("uid", "empty-desc@test.com")
        event.add("summary", "Event")
        event.add("description", "")
        event.add("dtstart", datetime(2024, 1, 15, 10, 0, 0, tzinfo=UTC))
        event.add("dtend", datetime(2024, 1, 15, 11, 0, 0, tzinfo=UTC))

        result = _parse_vevent(event)

        assert result is not None
        assert result.description is None

    def test_parse_vevent_parsing_error(self):
        """Test handling of parsing errors."""
        # Create an invalid event component
        invalid_component = MagicMock()
        invalid_component.name = "VEVENT"
        invalid_component.get = MagicMock(side_effect=Exception("Parse error"))

        result = _parse_vevent(invalid_component)

        assert result is None
