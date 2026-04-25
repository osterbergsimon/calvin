"""Tests for Google Calendar plugin.

Run from backend directory:
    pytest tests/unit/test_google_calendar_plugin.py -v
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.calendar.google import GoogleCalendarPlugin, handle_plugin_config_update


@pytest.fixture
def google_plugin():
    """Create a GoogleCalendarPlugin instance."""
    plugin = GoogleCalendarPlugin(
        plugin_id="google-instance",
        name="Google Calendar",
        ical_url="https://calendar.google.com/calendar/ical/test%40example.com/public/basic.ics",
        enabled=True,
    )
    return plugin


class TestGoogleCalendarPlugin:
    """Tests for GoogleCalendarPlugin class."""

    def test_get_plugin_metadata(self):
        """Test plugin metadata."""
        metadata = GoogleCalendarPlugin.get_plugin_metadata()
        assert metadata["type_id"] == "google"
        assert metadata["plugin_type"] == PluginType.CALENDAR
        assert metadata["name"] == "Google Calendar"
        assert metadata["supports_multiple_instances"] is True
        assert "common_config_schema" in metadata
        assert "instance_config_schema" in metadata
        assert "ical_url" in metadata["instance_config_schema"]

    def test_init(self, google_plugin):
        """Test plugin initialization."""
        assert google_plugin.plugin_id == "google-instance"
        assert google_plugin.name == "Google Calendar"
        assert "calendar.google.com" in google_plugin.ical_url
        assert google_plugin.enabled is True
        assert google_plugin._normalized_url is None

    @pytest.mark.asyncio
    async def test_initialize(self, google_plugin):
        """Test plugin initialization."""
        await google_plugin.initialize()
        # Should normalize URL
        assert google_plugin._normalized_url is not None
        assert "calendar.google.com" in google_plugin._normalized_url

    @pytest.mark.asyncio
    async def test_initialize_share_url_conversion(self):
        """Test that share URLs are converted to iCal format."""
        plugin = GoogleCalendarPlugin(
            plugin_id="test",
            name="Test",
            ical_url="https://calendar.google.com/calendar/u/0?cid=test%40example.com",
            enabled=True,
        )
        await plugin.initialize()
        assert "/ical/" in plugin._normalized_url or ".ics" in plugin._normalized_url

    @pytest.mark.asyncio
    async def test_cleanup(self, google_plugin):
        """Test plugin cleanup."""
        await google_plugin.cleanup()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_configure(self, google_plugin):
        """Test plugin configuration update."""
        new_url = "https://calendar.google.com/calendar/ical/new%40example.com/public/basic.ics"
        await google_plugin.configure({"ical_url": new_url})
        assert google_plugin.ical_url == new_url
        assert google_plugin._normalized_url is None  # Should be reset

    @pytest.mark.asyncio
    async def test_validate_config_valid_ical_url(self, google_plugin):
        """Test config validation with valid iCal URL."""
        assert (
            await google_plugin.validate_config(
                {
                    "ical_url": "https://calendar.google.com/calendar/ical/test%40example.com/public/basic.ics",
                }
            )
            is True
        )

    @pytest.mark.asyncio
    async def test_validate_config_valid_share_url(self, google_plugin):
        """Test config validation with valid share URL."""
        assert (
            await google_plugin.validate_config(
                {
                    "ical_url": "https://calendar.google.com/calendar/u/0?cid=test%40example.com",
                }
            )
            is True
        )

    @pytest.mark.asyncio
    async def test_validate_config_missing_ical_url(self, google_plugin):
        """Test config validation with missing ical_url."""
        assert await google_plugin.validate_config({}) is False

    @pytest.mark.asyncio
    async def test_validate_config_empty_ical_url(self, google_plugin):
        """Test config validation with empty ical_url."""
        assert (
            await google_plugin.validate_config(
                {
                    "ical_url": "",
                }
            )
            is False
        )

    @pytest.mark.asyncio
    async def test_validate_config_invalid_url(self, google_plugin):
        """Test config validation with invalid URL (not Google Calendar)."""
        assert (
            await google_plugin.validate_config(
                {
                    "ical_url": "https://example.com/calendar.ics",
                }
            )
            is False
        )

    @pytest.mark.asyncio
    @patch("app.plugins.calendar.google.parse_ical_from_url")
    async def test_fetch_events(self, mock_parse_ical, google_plugin):
        """Test fetching calendar events."""
        from app.models.calendar import CalendarEvent

        # Mock parsed events
        now = datetime.now().replace(hour=12, minute=0, second=0, microsecond=0)
        mock_events = [
            CalendarEvent(
                id="event1",
                title="Test Event",
                start=now,
                end=now + timedelta(hours=1),
                source="google-instance",
                description="Test description",
            ),
        ]
        mock_parse_ical.return_value = mock_events

        await google_plugin.initialize()

        start_date = now - timedelta(days=1)
        end_date = now + timedelta(days=1)
        events = await google_plugin.fetch_events(start_date, end_date)

        assert len(events) == 1
        assert events[0].title == "Test Event"
        assert events[0].source == "google-instance"
        mock_parse_ical.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.plugins.calendar.google.parse_ical_from_url")
    async def test_fetch_events_no_normalized_url(self, mock_parse_ical, google_plugin):
        """Test fetching events when URL cannot be normalized (returns empty list)."""

        # Mock initialize to set _normalized_url to None/empty
        async def mock_initialize():
            google_plugin._normalized_url = None

        google_plugin.initialize = AsyncMock(side_effect=mock_initialize)
        google_plugin._normalized_url = None

        start_date = datetime.now()
        end_date = datetime.now() + timedelta(days=1)
        # When _normalized_url is None after initialize(), should return empty list early
        events = await google_plugin.fetch_events(start_date, end_date)

        # The plugin checks `if not self._normalized_url:` which is True for None
        assert events == []
        # Should not call parse_ical_from_url when _normalized_url is None
        mock_parse_ical.assert_not_called()


class TestGoogleCalendarPluginHooks:
    """Tests for Google Calendar plugin hooks."""

    @pytest.mark.asyncio
    async def test_handle_plugin_config_update(self, test_db):
        """Test Google Calendar plugin handle_plugin_config_update hook."""
        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "google-1234"
            mock_plugin.enabled = False
            mock_plugin.configure = AsyncMock()
            mock_plugin.enable = MagicMock()
            mock_plugin.disable = MagicMock()
            mock_plugin.is_running = MagicMock(return_value=False)
            mock_plugin.initialize = AsyncMock()
            mock_plugin.start = MagicMock()
            mock_plugin.stop = MagicMock()
            mock_plugin.cleanup = AsyncMock()

            mock_loader.create_plugin_instance.return_value = mock_plugin
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "google", "plugin_type": "calendar", "name": "Google Calendar"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                from app.models.db_models import PluginTypeDB

                # Create plugin type in database (or get existing)
                db_type = await PluginTypeDB.objects.get_or_none(type_id="google")
                if not db_type:
                    db_type = await PluginTypeDB.objects.create(
                        type_id="google",
                        plugin_type="calendar",
                        name="Google Calendar",
                        enabled=True,
                    )
                else:
                    db_type.enabled = True
                    await db_type.update()

                # Test creating a new instance
                result = await handle_plugin_config_update(
                    type_id="google",
                    config={
                        "ical_url": "https://calendar.google.com/calendar/ical/test%40example.com/public/basic.ics",
                    },
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("google-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                from app.models.db_models import PluginDB

                db_plugins = await PluginDB.objects.filter(type_id="google").all()
                assert len(db_plugins) > 0
                db_plugin = db_plugins[0]
                assert db_plugin.type_id == "google"
                assert "ical_url" in db_plugin.config
                assert "calendar.google.com" in db_plugin.config["ical_url"]

    @pytest.mark.asyncio
    async def test_handle_plugin_config_update_invalid_url(self, test_db):
        """Test Google Calendar plugin handle_plugin_config_update with invalid URL."""
        import ormar

        from app.models.db_models import PluginTypeDB

        # Create plugin type in database (use get_or_create to avoid UNIQUE constraint)
        try:
            db_type = await PluginTypeDB.objects.get(type_id="google")
        except ormar.NoMatch:
            db_type = await PluginTypeDB.objects.create(
                type_id="google",
                plugin_type="calendar",
                name="Google Calendar",
                enabled=True,
            )

        # Mock plugin_loader to avoid registration issues
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "google", "plugin_type": "calendar", "name": "Google Calendar"}
            ]

            # Test with invalid URL - should fail validation
            result = await handle_plugin_config_update(
                type_id="google",
                config={
                    "ical_url": "https://example.com/calendar.ics",  # Not a Google Calendar URL
                },
                enabled=True,
                db_type=db_type,
                session=None,  # Session parameter ignored with Ormar
            )

            # Should return None or indicate validation failure
            assert result is None or result.get("instance_created") is False
