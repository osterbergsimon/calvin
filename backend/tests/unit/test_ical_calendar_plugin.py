"""Tests for the iCal / Proton calendar plugins.

Run from backend directory:
    pytest tests/unit/test_ical_calendar_plugin.py -v
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.calendar.ical import ICalCalendarPlugin, ProtonCalendarPlugin
from app.plugins.loader import PluginLoader


@pytest.fixture
async def ical_plugin():
    """Create a configured ICalCalendarPlugin instance."""
    plugin = ICalCalendarPlugin(
        plugin_id="ical-instance",
        name="iCal Feed",
        enabled=True,
    )
    await plugin.configure({"ical_url": "https://example.com/calendar.ics"})
    return plugin


class TestICalCalendarPlugin:
    """Tests for ICalCalendarPlugin class."""

    def test_metadata(self):
        """Test declarative plugin metadata."""
        metadata = ICalCalendarPlugin.metadata
        assert metadata.type_id == "ical"
        assert metadata.name == "iCal Feed"
        assert metadata.supports_multiple_instances is True
        assert metadata.instance_identity == ["ical_url"]
        assert "ical_url" in metadata.instance_config_schema

    def test_module_registers_ical_and_proton(self):
        """The module declares two calendar types: ical and proton."""
        import app.plugins.calendar.ical as ical_module

        loader = PluginLoader()
        registered = loader.register_module(ical_module)
        assert set(registered) == {"ical", "proton"}
        definitions = {d.type_id: d for d in loader.get_plugin_types()}
        assert definitions["ical"].plugin_type == PluginType.CALENDAR
        assert definitions["ical"].plugin_class is ICalCalendarPlugin
        assert definitions["proton"].plugin_type == PluginType.CALENDAR
        assert definitions["proton"].plugin_class is ProtonCalendarPlugin

    def test_proton_metadata(self):
        """Proton is the iCal implementation under its own type id."""
        metadata = ProtonCalendarPlugin.metadata
        assert metadata.type_id == "proton"
        assert metadata.name == "Proton Calendar"
        assert metadata.instance_identity == ["ical_url"]
        assert "ical_url" in metadata.instance_config_schema
        assert issubclass(ProtonCalendarPlugin, ICalCalendarPlugin)

    async def test_configure_populates_config(self, ical_plugin):
        """Test configuration is normalized into self.config."""
        assert ical_plugin.plugin_id == "ical-instance"
        assert ical_plugin.name == "iCal Feed"
        assert ical_plugin.config["ical_url"] == "https://example.com/calendar.ics"
        assert ical_plugin.enabled is True

    async def test_initialize_valid_url(self, ical_plugin):
        """Test plugin initialization with valid URL."""
        await ical_plugin.initialize()
        # Should not raise any errors

    async def test_initialize_invalid_url(self):
        """Test plugin initialization with invalid URL."""
        plugin = ICalCalendarPlugin(plugin_id="test", name="Test")
        await plugin.configure({"ical_url": "invalid-url"})
        with pytest.raises(ValueError, match="Invalid iCal URL"):
            await plugin.initialize()

    async def test_cleanup(self, ical_plugin):
        """Test plugin cleanup."""
        await ical_plugin.cleanup()
        # Should not raise any errors

    async def test_configure_update(self, ical_plugin):
        """Test plugin configuration update."""
        new_url = "https://example.com/new-calendar.ics"
        await ical_plugin.configure({"ical_url": new_url})
        assert ical_plugin.config["ical_url"] == new_url

    async def test_validate_config_valid_http_url(self):
        """Test config validation with valid HTTP URL."""
        assert (
            await ICalCalendarPlugin.validate_config(
                {"ical_url": "http://example.com/calendar.ics"}
            )
            is True
        )

    async def test_validate_config_valid_https_url(self):
        """Test config validation with valid HTTPS URL."""
        assert (
            await ICalCalendarPlugin.validate_config(
                {"ical_url": "https://example.com/calendar.ics"}
            )
            is True
        )

    async def test_validate_config_missing_ical_url(self):
        """Test config validation with missing ical_url."""
        assert await ICalCalendarPlugin.validate_config({}) is False

    async def test_validate_config_empty_ical_url(self):
        """Test config validation with empty ical_url."""
        assert await ICalCalendarPlugin.validate_config({"ical_url": ""}) is False

    async def test_validate_config_invalid_url(self):
        """Test config validation with invalid URL."""
        assert await ICalCalendarPlugin.validate_config({"ical_url": "not-a-url"}) is False

    @patch("app.plugins.calendar.ical.parse_ical_from_url")
    async def test_fetch_events(self, mock_parse_ical, ical_plugin):
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
                source="ical-instance",
                description="Test description",
            ),
        ]
        mock_parse_ical.return_value = mock_events

        start_date = now - timedelta(days=1)
        end_date = now + timedelta(days=1)
        events = await ical_plugin.fetch_events(start_date, end_date)

        assert len(events) == 1
        assert events[0].title == "Test Event"
        assert events[0].source == "ical-instance"
        mock_parse_ical.assert_called_once_with(ical_plugin.config["ical_url"])


class TestICalConfigUpdate:
    """Tests for the host-side config-update flow for the ical/proton types."""

    @staticmethod
    def _mock_plugin(plugin_id: str) -> MagicMock:
        mock_plugin = MagicMock()
        mock_plugin.plugin_id = plugin_id
        mock_plugin.enabled = False
        mock_plugin.configure = AsyncMock()
        mock_plugin.enable = MagicMock()
        mock_plugin.disable = MagicMock()
        mock_plugin.is_running = MagicMock(return_value=False)
        mock_plugin.initialize = AsyncMock()
        mock_plugin.start = MagicMock()
        mock_plugin.stop = MagicMock()
        mock_plugin.cleanup = AsyncMock()
        return mock_plugin

    @staticmethod
    def _fresh_loader(monkeypatch) -> PluginLoader:
        import app.plugins.calendar.ical as ical_module
        import app.plugins.loader as loader_module

        fresh_loader = PluginLoader()
        fresh_loader.register_module(ical_module)
        monkeypatch.setattr(loader_module, "plugin_loader", fresh_loader)
        return fresh_loader

    async def test_apply_plugin_config_update_ical(self, test_db, monkeypatch):
        """Test apply_plugin_config_update creates an ical instance."""
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        self._fresh_loader(monkeypatch)

        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = self._mock_plugin("ical-1234")

            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                from app.models.db_models import PluginTypeDB

                db_type = await PluginTypeDB.objects.get_or_none(type_id="ical")
                if not db_type:
                    db_type = await PluginTypeDB.objects.create(
                        type_id="ical",
                        plugin_type="calendar",
                        name="iCal Feed",
                        enabled=True,
                    )
                else:
                    db_type.enabled = True
                    await db_type.update()

                result = await apply_plugin_config_update(
                    type_id="ical",
                    config={"ical_url": "https://example.com/calendar.ics"},
                    enabled=True,
                    db_type=db_type,
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("ical-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                from app.models.db_models import PluginDB

                db_plugins = await PluginDB.objects.filter(type_id="ical").all()
                assert len(db_plugins) > 0
                db_plugin = db_plugins[0]
                assert db_plugin.type_id == "ical"
                assert db_plugin.config.get("ical_url") == "https://example.com/calendar.ics"

    async def test_apply_plugin_config_update_proton(self, test_db, monkeypatch):
        """Test apply_plugin_config_update creates a proton instance."""
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        self._fresh_loader(monkeypatch)

        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = self._mock_plugin("proton-1234")

            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                import ormar

                from app.models.db_models import PluginTypeDB

                try:
                    db_type = await PluginTypeDB.objects.get(type_id="proton")
                except ormar.NoMatch:
                    db_type = await PluginTypeDB.objects.create(
                        type_id="proton",
                        plugin_type="calendar",
                        name="Proton Calendar",
                        enabled=True,
                    )

                result = await apply_plugin_config_update(
                    type_id="proton",
                    config={"ical_url": "https://calendar.proton.me/api/calendar/ics"},
                    enabled=True,
                    db_type=db_type,
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("proton-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                from app.models.db_models import PluginDB

                db_plugins = await PluginDB.objects.filter(type_id="proton").all()
                assert len(db_plugins) > 0
                assert db_plugins[0].type_id == "proton"

    async def test_apply_plugin_config_update_invalid_url(self, test_db, monkeypatch):
        """Test apply_plugin_config_update rejects an invalid URL."""
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        self._fresh_loader(monkeypatch)

        import ormar

        from app.models.db_models import PluginTypeDB

        try:
            db_type = await PluginTypeDB.objects.get(type_id="ical")
        except ormar.NoMatch:
            db_type = await PluginTypeDB.objects.create(
                type_id="ical",
                plugin_type="calendar",
                name="iCal Feed",
                enabled=True,
            )

        result = await apply_plugin_config_update(
            type_id="ical",
            config={"ical_url": "not-a-url"},
            enabled=True,
            db_type=db_type,
        )

        # Validation failure short-circuits instance creation
        assert result is not None
        assert result.get("instance_created") is False
