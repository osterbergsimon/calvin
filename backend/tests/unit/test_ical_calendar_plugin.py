"""Tests for iCal Calendar plugin.

Run from backend directory:
    pytest tests/unit/test_ical_calendar_plugin.py -v
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.calendar.ical import ICalCalendarPlugin, handle_plugin_config_update


@pytest.fixture
def ical_plugin():
    """Create an ICalCalendarPlugin instance."""
    plugin = ICalCalendarPlugin(
        plugin_id="ical-instance",
        name="iCal Feed",
        ical_url="https://example.com/calendar.ics",
        enabled=True,
    )
    return plugin


class TestICalCalendarPlugin:
    """Tests for ICalCalendarPlugin class."""

    def test_get_plugin_metadata(self):
        """Test plugin metadata."""
        metadata = ICalCalendarPlugin.get_plugin_metadata()
        assert metadata["type_id"] == "ical"
        assert metadata["plugin_type"] == PluginType.CALENDAR
        assert metadata["name"] == "iCal Feed"
        assert metadata["supports_multiple_instances"] is True
        assert "common_config_schema" in metadata
        assert "instance_config_schema" in metadata
        assert "ical_url" in metadata["instance_config_schema"]

    def test_init(self, ical_plugin):
        """Test plugin initialization."""
        assert ical_plugin.plugin_id == "ical-instance"
        assert ical_plugin.name == "iCal Feed"
        assert ical_plugin.ical_url == "https://example.com/calendar.ics"
        assert ical_plugin.enabled is True

    @pytest.mark.asyncio
    async def test_initialize_valid_url(self, ical_plugin):
        """Test plugin initialization with valid URL."""
        await ical_plugin.initialize()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_initialize_invalid_url(self):
        """Test plugin initialization with invalid URL."""
        plugin = ICalCalendarPlugin(
            plugin_id="test",
            name="Test",
            ical_url="invalid-url",
            enabled=True,
        )
        with pytest.raises(ValueError, match="Invalid iCal URL"):
            await plugin.initialize()

    @pytest.mark.asyncio
    async def test_cleanup(self, ical_plugin):
        """Test plugin cleanup."""
        await ical_plugin.cleanup()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_configure(self, ical_plugin):
        """Test plugin configuration update."""
        new_url = "https://example.com/new-calendar.ics"
        await ical_plugin.configure({"ical_url": new_url})
        assert ical_plugin.ical_url == new_url

    @pytest.mark.asyncio
    async def test_validate_config_valid_http_url(self, ical_plugin):
        """Test config validation with valid HTTP URL."""
        assert (
            await ical_plugin.validate_config(
                {
                    "ical_url": "http://example.com/calendar.ics",
                }
            )
            is True
        )

    @pytest.mark.asyncio
    async def test_validate_config_valid_https_url(self, ical_plugin):
        """Test config validation with valid HTTPS URL."""
        assert (
            await ical_plugin.validate_config(
                {
                    "ical_url": "https://example.com/calendar.ics",
                }
            )
            is True
        )

    @pytest.mark.asyncio
    async def test_validate_config_missing_ical_url(self, ical_plugin):
        """Test config validation with missing ical_url."""
        assert await ical_plugin.validate_config({}) is False

    @pytest.mark.asyncio
    async def test_validate_config_empty_ical_url(self, ical_plugin):
        """Test config validation with empty ical_url."""
        assert (
            await ical_plugin.validate_config(
                {
                    "ical_url": "",
                }
            )
            is False
        )

    @pytest.mark.asyncio
    async def test_validate_config_invalid_url(self, ical_plugin):
        """Test config validation with invalid URL."""
        assert (
            await ical_plugin.validate_config(
                {
                    "ical_url": "not-a-url",
                }
            )
            is False
        )

    @pytest.mark.asyncio
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
        mock_parse_ical.assert_called_once_with(ical_plugin.ical_url)


class TestICalCalendarPluginHooks:
    """Tests for iCal Calendar plugin hooks."""

    @pytest.mark.asyncio
    async def test_handle_plugin_config_update_ical(self, test_db):
        """Test iCal plugin handle_plugin_config_update hook for 'ical' type."""
        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "ical-1234"
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
                {"type_id": "ical", "plugin_type": "calendar", "name": "iCal Feed"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                async with test_db as session:
                    from app.models.db_models import PluginTypeDB

                    # Create plugin type in database
                    db_type = PluginTypeDB(
                        type_id="ical",
                        plugin_type="calendar",
                        name="iCal Feed",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    # Test creating a new instance
                    result = await handle_plugin_config_update(
                        type_id="ical",
                        config={
                            "ical_url": "https://example.com/calendar.ics",
                        },
                        enabled=True,
                        db_type=db_type,
                        session=session,
                    )

                    assert result is not None
                    assert result.get("instance_created") is True
                    assert "instance_id" in result
                    assert result["instance_id"].startswith("ical-")

                    # Verify plugin was registered
                    mock_instance_mgr.register.assert_called_once()

                    # Verify database entry was created
                    from sqlalchemy import select

                    from app.models.db_models import PluginDB

                    result_query = await session.execute(
                        select(PluginDB).where(PluginDB.type_id == "ical")
                    )
                    db_plugins = result_query.scalars().all()
                    assert len(db_plugins) > 0
                    db_plugin = db_plugins[0]
                    assert db_plugin.type_id == "ical"
                    assert db_plugin.config.get("ical_url") == "https://example.com/calendar.ics"

    @pytest.mark.asyncio
    async def test_handle_plugin_config_update_proton(self, test_db):
        """Test iCal plugin handle_plugin_config_update hook for 'proton' type."""
        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "proton-1234"
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
                {"type_id": "proton", "plugin_type": "calendar", "name": "Proton Calendar"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                async with test_db as session:
                    from app.models.db_models import PluginTypeDB

                    # Create plugin type in database
                    db_type = PluginTypeDB(
                        type_id="proton",
                        plugin_type="calendar",
                        name="Proton Calendar",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    # Test creating a new instance
                    result = await handle_plugin_config_update(
                        type_id="proton",
                        config={
                            "ical_url": "https://calendar.proton.me/api/calendar/ics",
                        },
                        enabled=True,
                        db_type=db_type,
                        session=session,
                    )

                    assert result is not None
                    assert result.get("instance_created") is True
                    assert "instance_id" in result
                    assert result["instance_id"].startswith("proton-")

                    # Verify plugin was registered
                    mock_instance_mgr.register.assert_called_once()

                    # Verify database entry was created
                    from sqlalchemy import select

                    from app.models.db_models import PluginDB

                    result_query = await session.execute(
                        select(PluginDB).where(PluginDB.type_id == "proton")
                    )
                    db_plugins = result_query.scalars().all()
                    assert len(db_plugins) > 0
                    db_plugin = db_plugins[0]
                    assert db_plugin.type_id == "proton"

    @pytest.mark.asyncio
    async def test_handle_plugin_config_update_invalid_url(self, test_db):
        """Test iCal plugin handle_plugin_config_update with invalid URL."""
        async with test_db as session:
            from app.models.db_models import PluginTypeDB

            # Create plugin type in database
            db_type = PluginTypeDB(
                type_id="ical",
                plugin_type="calendar",
                name="iCal Feed",
                enabled=True,
            )
            session.add(db_type)
            await session.commit()

            # Mock plugin_loader to avoid registration issues
            with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
                mock_loader.get_plugin_types.return_value = [
                    {"type_id": "ical", "plugin_type": "calendar", "name": "iCal Feed"}
                ]

                # Test with invalid URL - should fail validation
                result = await handle_plugin_config_update(
                    type_id="ical",
                    config={
                        "ical_url": "not-a-url",
                    },
                    enabled=True,
                    db_type=db_type,
                    session=session,
                )

                # Should return None or indicate validation failure
                assert result is None or result.get("instance_created") is False
