"""Tests for Google Calendar plugin.

Run from backend directory:
    pytest tests/unit/test_google_calendar_plugin.py -v
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.calendar.google import (
    GoogleCalendarPlugin,
    _convert_share_url_to_ical,
    _is_google_calendar_url,
    _normalize_google_calendar_url,
)
from app.plugins.loader import PluginLoader

_ICAL_URL = "https://calendar.google.com/calendar/ical/test%40example.com/public/basic.ics"


@pytest.fixture
async def google_plugin():
    """Create a configured GoogleCalendarPlugin instance."""
    plugin = GoogleCalendarPlugin(
        plugin_id="google-instance",
        name="Google Calendar",
        enabled=True,
    )
    await plugin.configure({"ical_url": _ICAL_URL})
    return plugin


class TestGoogleCalendarUrlHelpers:
    """Tests for the URL normalization helpers (unchanged in contract 1.0)."""

    def test_is_google_calendar_url(self):
        assert _is_google_calendar_url("https://calendar.google.com/calendar/u/0?cid=x") is True
        assert _is_google_calendar_url("https://example.com/calendar.ics") is False

    def test_convert_share_url_to_ical(self):
        ical_url = _convert_share_url_to_ical(
            "https://calendar.google.com/calendar/u/0?cid=test%40example.com"
        )
        assert ical_url is not None
        assert ical_url.startswith("https://calendar.google.com/calendar/ical/")
        assert ical_url.endswith("/basic.ics")

    def test_convert_share_url_without_cid_returns_none(self):
        assert _convert_share_url_to_ical("https://calendar.google.com/calendar/u/0") is None

    def test_normalize_passes_through_ical_urls(self):
        assert _normalize_google_calendar_url(_ICAL_URL) == _ICAL_URL

    def test_normalize_converts_share_urls(self):
        normalized = _normalize_google_calendar_url(
            "https://calendar.google.com/calendar/u/0?cid=test%40example.com"
        )
        assert "/ical/" in normalized or normalized.endswith(".ics")


class TestGoogleCalendarPlugin:
    """Tests for GoogleCalendarPlugin class."""

    def test_metadata(self):
        """Test declarative plugin metadata."""
        metadata = GoogleCalendarPlugin.metadata
        assert metadata.type_id == "google"
        assert metadata.name == "Google Calendar"
        assert metadata.supports_multiple_instances is True
        assert metadata.instance_identity == ["ical_url"]
        assert "ical_url" in metadata.instance_config_schema

    def test_registers_as_calendar_plugin(self):
        """The loader derives the calendar family from the class."""
        import app.plugins.calendar.google as google_module

        loader = PluginLoader()
        assert "google" in loader.register_module(google_module)
        (definition,) = loader.get_plugin_types()
        assert definition.plugin_type == PluginType.CALENDAR
        assert definition.plugin_class is GoogleCalendarPlugin

    async def test_configure_populates_config(self, google_plugin):
        """Test configuration is normalized into self.config."""
        assert google_plugin.plugin_id == "google-instance"
        assert google_plugin.name == "Google Calendar"
        assert "calendar.google.com" in google_plugin.config["ical_url"]
        assert google_plugin.enabled is True
        assert google_plugin._normalized_url is None

    async def test_initialize(self, google_plugin):
        """Test plugin initialization."""
        await google_plugin.initialize()
        # Should normalize URL
        assert google_plugin._normalized_url is not None
        assert "calendar.google.com" in google_plugin._normalized_url

    async def test_initialize_share_url_conversion(self):
        """Test that share URLs are converted to iCal format."""
        plugin = GoogleCalendarPlugin(plugin_id="test", name="Test")
        await plugin.configure(
            {"ical_url": "https://calendar.google.com/calendar/u/0?cid=test%40example.com"}
        )
        await plugin.initialize()
        assert "/ical/" in plugin._normalized_url or ".ics" in plugin._normalized_url

    async def test_cleanup(self, google_plugin):
        """Test plugin cleanup."""
        await google_plugin.cleanup()
        # Should not raise any errors

    async def test_configure_resets_normalized_url(self, google_plugin):
        """Test plugin configuration update."""
        await google_plugin.initialize()
        assert google_plugin._normalized_url is not None

        new_url = "https://calendar.google.com/calendar/ical/new%40example.com/public/basic.ics"
        await google_plugin.configure({"ical_url": new_url})
        assert google_plugin.config["ical_url"] == new_url
        assert google_plugin._normalized_url is None  # Should be reset

    async def test_validate_config_valid_ical_url(self):
        """Test config validation with valid iCal URL."""
        assert await GoogleCalendarPlugin.validate_config({"ical_url": _ICAL_URL}) is True

    async def test_validate_config_valid_share_url(self):
        """Test config validation with valid share URL."""
        assert (
            await GoogleCalendarPlugin.validate_config(
                {"ical_url": "https://calendar.google.com/calendar/u/0?cid=test%40example.com"}
            )
            is True
        )

    async def test_validate_config_missing_ical_url(self):
        """Test config validation with missing ical_url."""
        assert await GoogleCalendarPlugin.validate_config({}) is False

    async def test_validate_config_empty_ical_url(self):
        """Test config validation with empty ical_url."""
        assert await GoogleCalendarPlugin.validate_config({"ical_url": ""}) is False

    async def test_validate_config_invalid_url(self):
        """Test config validation with invalid URL (not Google Calendar)."""
        assert (
            await GoogleCalendarPlugin.validate_config(
                {"ical_url": "https://example.com/calendar.ics"}
            )
            is False
        )

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


class TestGoogleConfigUpdate:
    """Tests for the host-side config-update flow for the google type."""

    @staticmethod
    def _fresh_loader(monkeypatch) -> PluginLoader:
        import app.plugins.calendar.google as google_module
        import app.plugins.loader as loader_module

        fresh_loader = PluginLoader()
        fresh_loader.register_module(google_module)
        monkeypatch.setattr(loader_module, "plugin_loader", fresh_loader)
        return fresh_loader

    async def test_apply_plugin_config_update(self, test_db, monkeypatch):
        """Test apply_plugin_config_update creates a google instance."""
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        self._fresh_loader(monkeypatch)

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

            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                from app.models.db_models import PluginTypeDB

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

                result = await apply_plugin_config_update(
                    type_id="google",
                    config={"ical_url": _ICAL_URL},
                    enabled=True,
                    db_type=db_type,
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

    async def test_apply_plugin_config_update_invalid_url(self, test_db, monkeypatch):
        """Test apply_plugin_config_update rejects a non-Google URL."""
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        self._fresh_loader(monkeypatch)

        import ormar

        from app.models.db_models import PluginTypeDB

        try:
            db_type = await PluginTypeDB.objects.get(type_id="google")
        except ormar.NoMatch:
            db_type = await PluginTypeDB.objects.create(
                type_id="google",
                plugin_type="calendar",
                name="Google Calendar",
                enabled=True,
            )

        result = await apply_plugin_config_update(
            type_id="google",
            config={"ical_url": "https://example.com/calendar.ics"},  # Not Google Calendar
            enabled=True,
            db_type=db_type,
        )

        # Validation failure short-circuits instance creation
        assert result is not None
        assert result.get("instance_created") is False
