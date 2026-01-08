"""Unit tests for plugin calendar service."""

from datetime import datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.calendar import CalendarEvent
from app.plugins.base import PluginType
from app.plugins.protocols import CalendarPlugin
from app.services.plugin_calendar_service import PluginCalendarService


class MockCalendarPlugin(CalendarPlugin):
    """Test implementation of CalendarPlugin for testing."""

    def __init__(self, plugin_id: str, name: str, events: list[CalendarEvent] | None = None):
        """Initialize test calendar plugin."""
        super().__init__(plugin_id, name, enabled=True)
        self._events = events or []
        self._running = True
        self._config = {}

    @property
    def plugin_type(self) -> PluginType:
        """Return plugin type."""
        return PluginType.CALENDAR

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Return plugin metadata."""
        return {
            "type_id": "test-calendar",
            "name": "Test Calendar Plugin",
            "description": "Test calendar plugin for unit tests",
            "version": "1.0.0",
        }

    async def initialize(self) -> None:
        """Initialize plugin."""
        self.start()

    async def cleanup(self) -> None:
        """Cleanup plugin."""
        self.stop()

    def is_running(self) -> bool:
        """Return running status."""
        return self._running

    def get_config(self) -> dict:
        """Return plugin config."""
        return self._config

    async def fetch_events(self, start_date, end_date) -> list[CalendarEvent]:
        """Fetch events."""
        return self._events

    async def validate_config(self, config: dict) -> bool:
        """Validate config."""
        return True


@pytest.fixture
def calendar_service():
    """Create a PluginCalendarService instance."""
    return PluginCalendarService()


@pytest.fixture
def mock_calendar_plugin(sample_events):
    """Create a mock calendar plugin."""
    plugin = MockCalendarPlugin("test-calendar-1", "Test Calendar", sample_events)
    plugin._config = {
        "ical_url": "https://example.com/calendar.ics",
        "color": "#FF0000",
        "show_time": True,
    }
    return plugin


@pytest.fixture
def sample_events():
    """Create sample calendar events."""
    base_time = datetime(2024, 1, 15, 10, 0, 0)
    return [
        CalendarEvent(
            id="event-1",
            title="Event 1",
            start=base_time,
            end=base_time + timedelta(hours=1),
            source="ical",
            all_day=False,
        ),
        CalendarEvent(
            id="event-2",
            title="Event 2",
            start=base_time + timedelta(days=1),
            end=base_time + timedelta(days=1, hours=2),
            source="ical",
            all_day=False,
        ),
    ]


class TestPluginCalendarService:
    """Test suite for PluginCalendarService."""

    @pytest.mark.asyncio
    async def test_get_events_no_plugins(self, calendar_service):
        """Test getting events when no plugins are available."""
        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = []
            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            events = await calendar_service.get_events(start_date, end_date)

            assert events == []
            mock_manager.get_plugins.assert_called_once_with(PluginType.CALENDAR, enabled_only=True)

    @pytest.mark.asyncio
    async def test_get_events_with_plugin(
        self, calendar_service, mock_calendar_plugin, sample_events
    ):
        """Test getting events from a single plugin."""
        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [mock_calendar_plugin]

            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            events = await calendar_service.get_events(start_date, end_date)

            assert len(events) == 2
            assert events[0].title == "Event 1"
            assert events[1].title == "Event 2"

    @pytest.mark.asyncio
    async def test_get_events_with_multiple_plugins(
        self, calendar_service, mock_calendar_plugin, sample_events
    ):
        """Test getting events from multiple plugins."""
        plugin1 = MockCalendarPlugin("calendar-1", "Test Calendar 1", sample_events)
        plugin2 = MockCalendarPlugin(
            "calendar-2",
            "Test Calendar 2",
            [
                CalendarEvent(
                    id="event-3",
                    title="Event 3",
                    start=datetime(2024, 1, 16, 14, 0, 0),
                    end=datetime(2024, 1, 16, 15, 0, 0),
                    source="ical",
                    all_day=False,
                )
            ],
        )

        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [plugin1, plugin2]

            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            events = await calendar_service.get_events(start_date, end_date)

            assert len(events) == 3
            assert any(e.title == "Event 1" for e in events)
            assert any(e.title == "Event 2" for e in events)
            assert any(e.title == "Event 3" for e in events)

    @pytest.mark.asyncio
    async def test_get_events_filters_by_source_ids(self, calendar_service, sample_events):
        """Test filtering events by source IDs."""
        plugin1 = MockCalendarPlugin("calendar-1", "Test Calendar 1", sample_events)
        plugin2 = MockCalendarPlugin("calendar-2", "Test Calendar 2", [])

        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [plugin1, plugin2]

            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            # Only get events from calendar-1
            events = await calendar_service.get_events(
                start_date, end_date, source_ids=["calendar-1"]
            )

            assert len(events) == 2

    @pytest.mark.asyncio
    async def test_get_events_handles_naive_datetimes(
        self, calendar_service, mock_calendar_plugin, sample_events
    ):
        """Test that naive datetimes are converted to timezone-aware."""
        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [mock_calendar_plugin]

            # Use naive datetimes
            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            events = await calendar_service.get_events(start_date, end_date)

            assert len(events) == 2

    @pytest.mark.asyncio
    async def test_get_events_caches_results(
        self, calendar_service, mock_calendar_plugin, sample_events
    ):
        """Test that events are cached and reused."""
        # Create a plugin with a spy on fetch_events
        call_count = {"count": 0}

        async def fetch_events_side_effect(start, end):
            call_count["count"] += 1
            return sample_events

        mock_calendar_plugin.fetch_events = fetch_events_side_effect

        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [mock_calendar_plugin]

            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            # First call
            events1 = await calendar_service.get_events(start_date, end_date)
            assert len(events1) == 2
            assert call_count["count"] == 1

            # Second call within cache TTL (5 minutes)
            # Mock datetime.now to return a time 2 minutes later
            with patch("app.services.plugin_calendar_service.datetime") as mock_dt:
                mock_dt.now.return_value = datetime(2024, 1, 15, 0, 2, 0)
                mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
                events2 = await calendar_service.get_events(start_date, end_date)
                assert len(events2) == 2
                # Should still be 1 call (cached)
                assert call_count["count"] == 1

    @pytest.mark.asyncio
    async def test_get_events_cache_expires(
        self, calendar_service, mock_calendar_plugin, sample_events
    ):
        """Test that cache expires after TTL."""
        call_count = {"count": 0}

        async def fetch_events_side_effect(start, end):
            call_count["count"] += 1
            return sample_events

        mock_calendar_plugin.fetch_events = fetch_events_side_effect

        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [mock_calendar_plugin]

            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            # First call
            with patch("app.services.plugin_calendar_service.datetime") as mock_dt:
                mock_dt.now.return_value = datetime(2024, 1, 15, 0, 0, 0)
                mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
                events1 = await calendar_service.get_events(start_date, end_date)
                assert len(events1) == 2
                assert call_count["count"] == 1

            # Second call after cache TTL (6 minutes later)
            with patch("app.services.plugin_calendar_service.datetime") as mock_dt:
                mock_dt.now.return_value = datetime(2024, 1, 15, 0, 6, 0)
                mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
                events2 = await calendar_service.get_events(start_date, end_date)
                assert len(events2) == 2
                # Should be 2 calls (cache expired)
                assert call_count["count"] == 2

    @pytest.mark.asyncio
    async def test_get_events_handles_plugin_error(
        self, calendar_service, mock_calendar_plugin, sample_events
    ):
        """Test that plugin errors are handled gracefully."""
        # First call succeeds and caches
        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [mock_calendar_plugin]

            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            # First call - cache the results
            await calendar_service.get_events(start_date, end_date)

            # Second call - plugin fails, should use cache
            async def fetch_events_error(start, end):
                raise Exception("Plugin error")

            mock_calendar_plugin.fetch_events = fetch_events_error

            with patch("app.services.plugin_calendar_service.datetime") as mock_dt:
                mock_dt.now.return_value = datetime(2024, 1, 15, 0, 2, 0)
                mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw)
                events = await calendar_service.get_events(start_date, end_date)
                # Should return cached events
                assert len(events) == 2

    @pytest.mark.asyncio
    async def test_get_events_skips_non_calendar_plugins(
        self, calendar_service, mock_calendar_plugin, sample_events
    ):
        """Test that non-calendar plugins are skipped."""
        # Create a non-calendar plugin (just a MagicMock, not a CalendarPlugin)
        non_calendar_plugin = MagicMock()
        non_calendar_plugin.plugin_id = "image-plugin-1"

        with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
            mock_manager.get_plugins.return_value = [mock_calendar_plugin, non_calendar_plugin]

            start_date = datetime(2024, 1, 15)
            end_date = datetime(2024, 1, 20)

            events = await calendar_service.get_events(start_date, end_date)

            assert len(events) == 2

    def test_clear_cache(self, calendar_service, sample_events):
        """Test clearing the cache."""
        # Add something to cache
        cache_key = "test:key"
        calendar_service._cache[cache_key] = {
            "events": sample_events,
            "timestamp": datetime.now(),
        }

        assert len(calendar_service._cache) == 1

        calendar_service.clear_cache()

        assert len(calendar_service._cache) == 0

    @pytest.mark.asyncio
    async def test_get_sources_with_enabled_plugin(self, calendar_service, mock_calendar_plugin):
        """Test getting sources when plugin is enabled."""
        mock_db_plugin = MagicMock()
        mock_db_plugin.id = "test-calendar-1"
        mock_db_plugin.type_id = "ical"
        mock_db_plugin.name = "Test Calendar"
        mock_db_plugin.enabled = True
        mock_db_plugin.config = {"ical_url": "https://example.com/calendar.ics"}

        with patch("app.database.AsyncSessionLocal") as mock_session:
            mock_session_instance = AsyncMock()
            mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session_instance.__aexit__ = AsyncMock(return_value=None)
            mock_session.return_value = mock_session_instance

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_db_plugin]
            mock_session_instance.execute = AsyncMock(return_value=mock_result)

            with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
                # Create a proper CalendarPlugin instance
                test_plugin = MockCalendarPlugin("test-calendar-1", "Test Calendar")
                test_plugin._config = {
                    "ical_url": "https://example.com/calendar.ics",
                    "color": "#FF0000",
                }
                mock_manager.get_plugin.return_value = test_plugin

                sources = await calendar_service.get_sources()

                assert len(sources) == 1
                assert sources[0]["id"] == "test-calendar-1"
                assert sources[0]["type"] == "ical"
                assert sources[0]["name"] == "Test Calendar"
                assert sources[0]["enabled"] is True
                assert sources[0]["running"] is True
                assert sources[0]["ical_url"] == "https://example.com/calendar.ics"
                assert sources[0]["color"] == "#FF0000"

    @pytest.mark.asyncio
    async def test_get_sources_with_disabled_plugin(self, calendar_service):
        """Test getting sources when plugin is disabled."""
        mock_db_plugin = MagicMock()
        mock_db_plugin.id = "test-calendar-1"
        mock_db_plugin.type_id = "ical"
        mock_db_plugin.name = "Test Calendar"
        mock_db_plugin.enabled = False
        mock_db_plugin.config = {"ical_url": "https://example.com/calendar.ics"}

        with patch("app.database.AsyncSessionLocal") as mock_session:
            mock_session_instance = AsyncMock()
            mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session_instance.__aexit__ = AsyncMock(return_value=None)
            mock_session.return_value = mock_session_instance

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_db_plugin]
            mock_session_instance.execute = AsyncMock(return_value=mock_result)

            with patch("app.services.plugin_calendar_service.plugin_manager") as mock_manager:
                mock_manager.get_plugin.return_value = None  # No instance for disabled plugin

                sources = await calendar_service.get_sources()

                assert len(sources) == 1
                assert sources[0]["id"] == "test-calendar-1"
                assert sources[0]["enabled"] is False
                assert sources[0]["running"] is False

    def test_get_plugin_type_name_google(self, calendar_service):
        """Test getting plugin type name for Google calendar."""
        plugin = MagicMock()
        plugin.__class__.__name__ = "GoogleCalendarPlugin"

        type_name = calendar_service._get_plugin_type_name(plugin)

        assert type_name == "google"

    def test_get_plugin_type_name_ical(self, calendar_service):
        """Test getting plugin type name for iCal calendar."""
        plugin = MagicMock()
        plugin.__class__.__name__ = "ICalPlugin"
        plugin.plugin_id = "ical-1"
        plugin.name = "My Calendar"

        type_name = calendar_service._get_plugin_type_name(plugin)

        assert type_name == "ical"

    def test_get_plugin_type_name_proton(self, calendar_service):
        """Test getting plugin type name for Proton calendar."""
        plugin = MagicMock()
        plugin.__class__.__name__ = "ICalPlugin"
        plugin.plugin_id = "proton-calendar-1"
        plugin.name = "Proton Calendar"

        type_name = calendar_service._get_plugin_type_name(plugin)

        assert type_name == "proton"
