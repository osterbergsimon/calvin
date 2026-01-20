"""Tests for plugin handle_plugin_config_update hooks.

These tests verify that plugin hooks correctly use the generic instance manager.
Run from backend directory:
    pytest tests/unit/test_plugin_hooks.py
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.db_models import PluginDB, PluginTypeDB


async def get_or_create_plugin_type(
    type_id: str, plugin_type: str, name: str, enabled: bool = True
):
    """Helper to get or create a plugin type, avoiding UNIQUE constraint errors."""
    db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)
    if not db_type:
        # Check if it already exists to avoid UNIQUE constraint errors
        existing = await PluginTypeDB.objects.get_or_none(type_id=type_id)
        if existing:
            db_type = existing
        else:
            db_type = await PluginTypeDB.objects.create(
                type_id=type_id,
                plugin_type=plugin_type,
                name=name,
                enabled=enabled,
            )
    else:
        # Update if it exists
        db_type.enabled = enabled
        await db_type.update()
    return db_type


@pytest.mark.unit
@pytest.mark.asyncio
class TestPluginHooks:
    """Tests for plugin handle_plugin_config_update hooks."""

    async def test_picsum_handle_plugin_config_update(self, test_db):
        """Test Picsum plugin handle_plugin_config_update hook."""
        # Import the hook from the picsum plugin
        from pathlib import Path

        # Find calvin-plugins directory (sibling to calvin directory)
        # backend/tests/unit/test_plugin_hooks.py -> backend -> calvin -> .. -> calvin-plugins
        backend_dir = Path(__file__).parent.parent.parent  # backend/tests/unit -> backend
        calvin_dir = backend_dir.parent  # backend -> calvin
        plugin_dir = calvin_dir.parent / "calvin-plugins"  # calvin -> .. -> calvin-plugins
        picsum_plugin_path = plugin_dir / "picsum" / "plugin.py"

        if not picsum_plugin_path.exists():
            pytest.skip(
                f"Picsum plugin not found at {picsum_plugin_path}. Expected location: {plugin_dir}"
            )

        import importlib.util

        spec = importlib.util.spec_from_file_location("picsum_plugin", picsum_plugin_path)
        if not spec or not spec.loader:
            pytest.skip("Could not load picsum plugin module")

        picsum_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(picsum_module)
        picsum_handle_config_update = picsum_module.handle_plugin_config_update

        # Mock plugin_loader and instance_manager
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "picsum-instance"
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
                {"type_id": "picsum", "plugin_type": "image", "name": "Picsum Photos"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="picsum",
                    plugin_type="image",
                    name="Picsum Photos",
                    enabled=True,
                )

                # Test creating a new instance
                result = await picsum_handle_config_update(
                    type_id="picsum",
                    config={"count": 30},
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert result.get("instance_id") == "picsum-instance"

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                db_plugin = await PluginDB.objects.get_or_none(id="picsum-instance")
                assert db_plugin is not None
                assert db_plugin.type_id == "picsum"
                assert db_plugin.config.get("count") == 30

    async def test_unsplash_handle_plugin_config_update(self, test_db):
        """Test Unsplash plugin handle_plugin_config_update hook."""
        from pathlib import Path

        # Find calvin-plugins directory (sibling to calvin directory)
        backend_dir = Path(__file__).parent.parent.parent
        calvin_dir = backend_dir.parent
        plugin_dir = calvin_dir.parent / "calvin-plugins"
        unsplash_plugin_path = plugin_dir / "unsplash" / "plugin.py"

        if not unsplash_plugin_path.exists():
            pytest.skip(
                f"Unsplash plugin not found at {unsplash_plugin_path}. "
                f"Expected location: {plugin_dir}"
            )

        import importlib.util

        spec = importlib.util.spec_from_file_location("unsplash_plugin", unsplash_plugin_path)
        if not spec or not spec.loader:
            pytest.skip("Could not load unsplash plugin module")

        unsplash_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(unsplash_module)
        unsplash_handle_config_update = unsplash_module.handle_plugin_config_update

        # Mock plugin_loader and instance_manager
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "unsplash-instance"
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
                {"type_id": "unsplash", "plugin_type": "image", "name": "Unsplash"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="unsplash",
                    plugin_type="image",
                    name="Unsplash",
                    enabled=True,
                )

                # Test creating a new instance
                result = await unsplash_handle_config_update(
                    type_id="unsplash",
                    config={"api_key": "test-key", "category": "popular", "count": 30},
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert result.get("instance_id") == "unsplash-instance"

                # Verify database entry was created
                db_plugin = await PluginDB.objects.get_or_none(id="unsplash-instance")
                assert db_plugin is not None
                assert db_plugin.type_id == "unsplash"
                assert db_plugin.config.get("api_key") == "test-key"
                assert db_plugin.config.get("count") == 30

    async def test_test_plugin_handle_plugin_config_update(self, test_db):
        """Test Test Plugin handle_plugin_config_update hook."""
        from pathlib import Path

        # Find calvin-plugins directory (sibling to calvin directory)
        backend_dir = Path(__file__).parent.parent.parent
        calvin_dir = backend_dir.parent
        plugin_dir = calvin_dir.parent / "calvin-plugins"
        test_plugin_path = plugin_dir / "test-plugin" / "plugin.py"

        if not test_plugin_path.exists():
            pytest.skip(
                f"Test plugin not found at {test_plugin_path}. Expected location: {plugin_dir}"
            )

        import importlib.util

        spec = importlib.util.spec_from_file_location("test_plugin", test_plugin_path)
        if not spec or not spec.loader:
            pytest.skip("Could not load test plugin module")

        test_plugin_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(test_plugin_module)
        test_plugin_handle_config_update = test_plugin_module.handle_plugin_config_update

        # Mock plugin_loader and instance_manager
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "test-plugin-instance"
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
                {"type_id": "test_plugin", "plugin_type": "service", "name": "Test Plugin"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="test_plugin",
                    plugin_type="service",
                    name="Test Plugin",
                    enabled=True,
                )

                # Delete any existing instances for this type_id to ensure we create a new one
                from app.models.db_models import PluginDB

                existing_plugins = await PluginDB.objects.filter(type_id="test_plugin").all()
                for plugin in existing_plugins:
                    await plugin.delete()

                # Test creating a new instance
                result = await test_plugin_handle_config_update(
                    type_id="test_plugin",
                    config={"message": "Hello from test!"},
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert result.get("instance_id") == "test-plugin-instance"

    async def test_local_handle_plugin_config_update(self, test_db):
        """Test Local Images plugin handle_plugin_config_update hook."""
        from app.plugins.image.local import handle_plugin_config_update

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "local-images"
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
                {"type_id": "local", "plugin_type": "image", "name": "Local Images"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="local",
                    plugin_type="image",
                    name="Local Images",
                    enabled=True,
                )

                # Delete existing instance if it exists (from test_client fixture)
                from app.models.db_models import PluginDB

                try:
                    existing = await PluginDB.objects.get(id="local-images")
                    await existing.delete()
                except Exception:
                    pass  # Doesn't exist, that's fine

                # Test creating a new instance (empty config - uses hardcoded directory)
                result = await handle_plugin_config_update(
                    type_id="local",
                    config={},
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert result.get("instance_id") == "local-images"

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                db_plugin = await PluginDB.objects.get_or_none(id="local-images")
                assert db_plugin is not None
                assert db_plugin.type_id == "local"
                assert db_plugin.config == {}  # Empty config

    async def test_yr_weather_handle_plugin_config_update(self, test_db):
        """Test Yr.no Weather plugin handle_plugin_config_update hook."""
        # Import the hook from the yr_weather plugin
        from pathlib import Path

        # Find calvin-plugins directory (sibling to calvin directory)
        backend_dir = Path(__file__).parent.parent.parent  # backend/tests/unit -> backend
        calvin_dir = backend_dir.parent  # backend -> calvin
        plugin_dir = calvin_dir.parent / "calvin-plugins"  # calvin -> .. -> calvin-plugins
        yr_weather_plugin_path = plugin_dir / "yr_weather" / "plugin.py"

        if not yr_weather_plugin_path.exists():
            pytest.skip(
                f"Yr.no Weather plugin not found at {yr_weather_plugin_path}. "
                f"Expected location: {plugin_dir}"
            )

        import importlib.util

        spec = importlib.util.spec_from_file_location("yr_weather_plugin", yr_weather_plugin_path)
        if not spec or not spec.loader:
            pytest.skip("Could not load yr_weather plugin module")

        yr_weather_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(yr_weather_module)
        handle_plugin_config_update = yr_weather_module.handle_plugin_config_update

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "yr_weather-1234"
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
                {"type_id": "yr_weather", "plugin_type": "service", "name": "Yr.no Weather"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="yr_weather",
                    plugin_type="service",
                    name="Yr.no Weather",
                    enabled=True,
                )

                # Test creating a new instance
                result = await handle_plugin_config_update(
                    type_id="yr_weather",
                    config={
                        "latitude": 59.9139,
                        "longitude": 10.7522,
                        "location": "Oslo, Norway",
                    },
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("yr_weather-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                db_plugins = await PluginDB.objects.filter(type_id="yr_weather").all()
                assert len(db_plugins) > 0
                db_plugin = db_plugins[0]
                assert db_plugin.type_id == "yr_weather"
                assert db_plugin.config.get("latitude") == 59.9139
                assert db_plugin.config.get("longitude") == 10.7522

    async def test_yr_weather_handle_plugin_config_update_missing_coordinates(self, test_db):
        """Test Yr.no Weather plugin handle_plugin_config_update with missing coordinates."""
        # Import the hook from the yr_weather plugin
        from pathlib import Path

        # Find calvin-plugins directory (sibling to calvin directory)
        backend_dir = Path(__file__).parent.parent.parent  # backend/tests/unit -> backend
        calvin_dir = backend_dir.parent  # backend -> calvin
        plugin_dir = calvin_dir.parent / "calvin-plugins"  # calvin -> .. -> calvin-plugins
        yr_weather_plugin_path = plugin_dir / "yr_weather" / "plugin.py"

        if not yr_weather_plugin_path.exists():
            pytest.skip(
                f"Yr.no Weather plugin not found at {yr_weather_plugin_path}. "
                f"Expected location: {plugin_dir}"
            )

        import importlib.util

        spec = importlib.util.spec_from_file_location("yr_weather_plugin", yr_weather_plugin_path)
        if not spec or not spec.loader:
            pytest.skip("Could not load yr_weather plugin module")

        yr_weather_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(yr_weather_module)
        handle_plugin_config_update = yr_weather_module.handle_plugin_config_update

        # Create plugin type in database (or get existing)
        db_type = await get_or_create_plugin_type(
            type_id="yr_weather",
            plugin_type="service",
            name="Yr.no Weather",
            enabled=True,
        )

        # Mock plugin_loader to avoid registration issues
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "yr_weather", "plugin_type": "service", "name": "Yr.no Weather"}
            ]

            # Test with missing coordinates - should fail validation
            result = await handle_plugin_config_update(
                type_id="yr_weather",
                config={},  # Missing latitude/longitude
                enabled=True,
                db_type=db_type,
                session=None,  # Session parameter ignored with Ormar
            )

            # Should return None or indicate validation failure
            assert result is None or result.get("instance_created") is False

    async def test_google_handle_plugin_config_update(self, test_db):
        """Test Google Calendar plugin handle_plugin_config_update hook."""
        from app.plugins.calendar.google import handle_plugin_config_update

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

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="google",
                    plugin_type="calendar",
                    name="Google Calendar",
                    enabled=True,
                )

                # Delete any existing instances for this type_id to ensure we create a new one
                from app.models.db_models import PluginDB

                existing_plugins = await PluginDB.objects.filter(type_id="google").all()
                for plugin in existing_plugins:
                    await plugin.delete()

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

    async def test_ical_handle_plugin_config_update(self, test_db):
        """Test iCal Calendar plugin handle_plugin_config_update hook."""
        from app.plugins.calendar.ical import handle_plugin_config_update

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

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="ical",
                    plugin_type="calendar",
                    name="iCal Feed",
                    enabled=True,
                )

                # Delete any existing instances for this type_id to ensure we create a new one
                from app.models.db_models import PluginDB

                existing_plugins = await PluginDB.objects.filter(type_id="ical").all()
                for plugin in existing_plugins:
                    await plugin.delete()

                # Test creating a new instance
                result = await handle_plugin_config_update(
                    type_id="ical",
                    config={
                        "ical_url": "https://example.com/calendar.ics",
                    },
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("ical-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

    async def test_iframe_handle_plugin_config_update(self, test_db):
        """Test Iframe Service plugin handle_plugin_config_update hook."""
        from app.plugins.service.iframe import handle_plugin_config_update

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "iframe-1234"
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
                {"type_id": "iframe", "plugin_type": "service", "name": "Iframe Service"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="iframe",
                    plugin_type="service",
                    name="Iframe Service",
                    enabled=True,
                )

                # Delete any existing instances for this type_id to ensure we create a new one
                from app.models.db_models import PluginDB

                existing_plugins = await PluginDB.objects.filter(type_id="iframe").all()
                for plugin in existing_plugins:
                    await plugin.delete()

                # Test creating a new instance
                result = await handle_plugin_config_update(
                    type_id="iframe",
                    config={
                        "url": "https://example.com",
                        "fullscreen": False,
                    },
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("iframe-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

    async def test_weather_handle_plugin_config_update(self, test_db):
        """Test Weather Service plugin handle_plugin_config_update hook."""
        # Import the hook from the weather plugin
        from pathlib import Path

        # Find calvin-plugins directory (sibling to calvin directory)
        backend_dir = Path(__file__).parent.parent.parent  # backend/tests/unit -> backend
        calvin_dir = backend_dir.parent  # backend -> calvin
        plugin_dir = calvin_dir.parent / "calvin-plugins"  # calvin -> .. -> calvin-plugins
        weather_plugin_path = plugin_dir / "weather" / "plugin.py"

        if not weather_plugin_path.exists():
            pytest.skip(
                f"Weather plugin not found at {weather_plugin_path}. "
                f"Expected location: {plugin_dir}"
            )

        import importlib.util

        spec = importlib.util.spec_from_file_location("weather_plugin", weather_plugin_path)
        if not spec or not spec.loader:
            pytest.skip("Could not load weather plugin module")

        weather_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(weather_module)
        handle_plugin_config_update = weather_module.handle_plugin_config_update

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "weather-1234"
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
                {"type_id": "weather", "plugin_type": "service", "name": "Weather"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await get_or_create_plugin_type(
                    type_id="weather",
                    plugin_type="service",
                    name="Weather",
                    enabled=True,
                )

                # Test creating a new instance
                result = await handle_plugin_config_update(
                    type_id="weather",
                    config={
                        "api_key": "test-api-key",
                        "location": "London, UK",
                        "units": "metric",
                        "forecast_days": 3,
                    },
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("weather-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()
