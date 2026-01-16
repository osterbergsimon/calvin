"""Tests for generic plugin instance management utilities."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.utils.instance_manager import (
    InstanceManagerConfig,
    handle_plugin_config_update_generic,
)


@pytest.fixture
def mock_plugin():
    """Create a mock plugin instance."""
    plugin = MagicMock()
    plugin.plugin_id = "test-instance"
    plugin.enabled = False
    plugin.configure = AsyncMock()
    plugin.enable = MagicMock()
    plugin.disable = MagicMock()
    plugin.is_running = MagicMock(return_value=False)
    plugin.initialize = AsyncMock()
    plugin.start = MagicMock()
    plugin.stop = MagicMock()
    plugin.cleanup = AsyncMock()
    return plugin


@pytest.fixture
def mock_db_type():
    """Create a mock database plugin type."""
    db_type = MagicMock()
    db_type.type_id = "test_plugin"
    db_type.enabled = False
    return db_type


@pytest.fixture
def manager_config():
    """Create a test InstanceManagerConfig."""

    def normalize_config(config):
        # Normalize count to int if it's a string
        count = config.get("count", 10)
        if isinstance(count, str):
            try:
                count = int(count)
            except (ValueError, TypeError):
                count = 10
        return {"count": count}

    def validate_config(config):
        count = config.get("count", 0)
        # Handle both int and string representations
        if isinstance(count, str):
            try:
                count = int(count)
            except (ValueError, TypeError):
                return False
        return isinstance(count, int) and count > 0

    def generate_instance_id(config, type_id):
        # Generate ID from config hash (instance_name is not in config at this point)
        # In real usage, you'd use other config fields to generate a unique ID
        # For testing, we'll use a simple hash of the config
        import hashlib

        config_str = str(sorted(config.items()))
        config_hash = hashlib.md5(config_str.encode()).hexdigest()[:8]
        return f"{type_id}-{config_hash}"

    return InstanceManagerConfig(
        type_id="test_plugin",
        single_instance=False,
        normalize_config=normalize_config,
        validate_config=validate_config,
        generate_instance_id=generate_instance_id,
        default_instance_name="Test Plugin Instance",
    )


@pytest.fixture
def single_instance_config():
    """Create a test InstanceManagerConfig for single-instance plugin."""

    def normalize_config(config):
        return {"count": config.get("count", 10)}

    return InstanceManagerConfig(
        type_id="test_plugin",
        single_instance=True,
        instance_id="test-instance",
        normalize_config=normalize_config,
        default_instance_name="Test Plugin",
    )


@pytest.mark.unit
class TestInstanceManagerConfig:
    """Tests for InstanceManagerConfig."""

    def test_init(self):
        """Test InstanceManagerConfig initialization."""
        config = InstanceManagerConfig(
            type_id="test_plugin",
            single_instance=True,
            instance_id="test-instance",
        )
        assert config.type_id == "test_plugin"
        assert config.single_instance is True
        assert config.instance_id == "test-instance"
        assert config.default_instance_name == "Test Plugin Instance"

    def test_default_instance_name(self):
        """Test default instance name."""
        config = InstanceManagerConfig(type_id="test_plugin")
        assert config.default_instance_name == "Test Plugin Instance"

        config = InstanceManagerConfig(type_id="test_plugin", default_instance_name="Custom Name")
        assert config.default_instance_name == "Custom Name"


@pytest.mark.unit
@pytest.mark.asyncio
class TestHandlePluginConfigUpdateGeneric:
    """Tests for handle_plugin_config_update_generic."""

    async def test_wrong_type_id(self, manager_config, test_db):
        """Test that function returns None for wrong type_id."""
        async with test_db as session:
            result = await handle_plugin_config_update_generic(
                type_id="wrong_type",
                config={},
                enabled=None,
                db_type=None,
                session=session,
                manager_config=manager_config,
            )
            assert result is None

    async def test_config_validation_failure(self, manager_config, test_db, mock_db_type):
        """Test that invalid config prevents instance creation."""
        async with test_db as session:
            result = await handle_plugin_config_update_generic(
                type_id="test_plugin",
                config={"count": -1},  # Invalid count
                enabled=None,
                db_type=mock_db_type,
                session=session,
                manager_config=manager_config,
            )
            assert result is not None
            assert result["instance_created"] is False
            assert result["instance_updated"] is False

    async def test_create_new_instance_multi_instance(
        self, manager_config, test_db, mock_db_type, mock_plugin
    ):
        """Test creating a new instance for multi-instance plugin."""

        # Mock plugin_loader to return our mock plugin
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = mock_plugin
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "test_plugin", "plugin_type": "image", "name": "Test Plugin"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                async with test_db as session:
                    # Create plugin type in database
                    from app.models.db_models import PluginTypeDB

                    db_type = PluginTypeDB(
                        type_id="test_plugin",
                        plugin_type="image",
                        name="Test Plugin",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    result = await handle_plugin_config_update_generic(
                        type_id="test_plugin",
                        config={"count": 30, "_instance_name": "My Instance"},
                        enabled=True,
                        db_type=mock_db_type,
                        session=session,
                        manager_config=manager_config,
                    )

                    # Should have created instance
                    assert result is not None
                    assert result.get("instance_created") is True
                    assert "instance_id" in result

    async def test_create_new_instance_single_instance(
        self, single_instance_config, test_db, mock_db_type, mock_plugin
    ):
        """Test creating a new instance for single-instance plugin."""

        # Mock plugin_loader to return our mock plugin
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = mock_plugin
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "test_plugin", "plugin_type": "image", "name": "Test Plugin"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                async with test_db as session:
                    # Create plugin type in database
                    from app.models.db_models import PluginTypeDB

                    db_type = PluginTypeDB(
                        type_id="test_plugin",
                        plugin_type="image",
                        name="Test Plugin",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    result = await handle_plugin_config_update_generic(
                        type_id="test_plugin",
                        config={"count": 30},
                        enabled=True,
                        db_type=mock_db_type,
                        session=session,
                        manager_config=single_instance_config,
                    )

                    # Should have created instance with fixed ID
                    assert result is not None
                    assert result.get("instance_created") is True
                    assert result["instance_id"] == "test-instance"

    async def test_update_existing_instance(
        self, manager_config, test_db, mock_db_type, mock_plugin
    ):
        """Test updating an existing instance."""
        from app.models.db_models import PluginDB
        from app.plugins.manager import plugin_manager

        # Ensure plugin is not already registered
        try:
            await plugin_manager.unregister("test-instance")
        except Exception:
            pass

        # Add plugin to manager
        await plugin_manager.register(mock_plugin)

        # Create database instance
        async with test_db as session:
            db_instance = PluginDB(
                id="test-instance",
                type_id="test_plugin",
                plugin_type="image",
                name="Test Instance",
                enabled=False,
                config={"count": 10},
            )
            session.add(db_instance)
            await session.commit()

            result = await handle_plugin_config_update_generic(
                type_id="test_plugin",
                config={"count": 50, "_instance_id": "test-instance"},
                enabled=True,
                db_type=mock_db_type,
                session=session,
                manager_config=manager_config,
            )

            assert result is not None
            assert result["instance_updated"] is True
            assert result["instance_id"] == "test-instance"

            # Verify plugin was configured
            assert mock_plugin.configure.called
            # Verify plugin was enabled
            assert mock_plugin.enable.called

            # Cleanup
            await plugin_manager.unregister("test-instance")

    async def test_update_existing_instance_disable(
        self, manager_config, test_db, mock_db_type, mock_plugin
    ):
        """Test disabling an existing instance."""
        from app.models.db_models import PluginDB
        from app.plugins.manager import plugin_manager

        # Ensure plugin is not already registered
        try:
            await plugin_manager.unregister("test-instance")
        except Exception:
            pass

        # Add plugin to manager
        mock_plugin.enabled = True
        mock_plugin.is_running.return_value = True
        await plugin_manager.register(mock_plugin)

        # Create database instance
        async with test_db as session:
            db_instance = PluginDB(
                id="test-instance",
                type_id="test_plugin",
                plugin_type="image",
                name="Test Instance",
                enabled=True,
                config={"count": 10},
            )
            session.add(db_instance)
            await session.commit()

            result = await handle_plugin_config_update_generic(
                type_id="test_plugin",
                config={"_instance_id": "test-instance", "_instance_enabled": False},
                enabled=None,
                db_type=mock_db_type,
                session=session,
                manager_config=manager_config,
            )

            assert result is not None
            assert result["instance_updated"] is True

            # Verify plugin was disabled and stopped
            assert mock_plugin.disable.called
            assert mock_plugin.stop.called
            assert mock_plugin.cleanup.called

            # Cleanup
            await plugin_manager.unregister("test-instance")

    async def test_normalize_config(self, manager_config, test_db, mock_db_type, mock_plugin):
        """Test that normalize_config is called."""

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = mock_plugin
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "test_plugin", "plugin_type": "image", "name": "Test Plugin"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                async with test_db as session:
                    # Create plugin type in database
                    from app.models.db_models import PluginTypeDB

                    db_type = PluginTypeDB(
                        type_id="test_plugin",
                        plugin_type="image",
                        name="Test Plugin",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    result = await handle_plugin_config_update_generic(
                        type_id="test_plugin",
                        config={
                            "count": "30",
                            "_instance_name": "Test Instance",
                        },  # String that needs normalization
                        enabled=True,
                        db_type=mock_db_type,
                        session=session,
                        manager_config=manager_config,
                    )

                    # Verify normalize_config was called - result should indicate instance was created
                    assert result is not None
                    assert result.get("instance_created") is True

    async def test_metadata_fields_removed(
        self, manager_config, test_db, mock_db_type, mock_plugin
    ):
        """Test that _instance_* metadata fields are removed from config."""

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = mock_plugin
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "test_plugin", "plugin_type": "image", "name": "Test Plugin"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                async with test_db as session:
                    # Create plugin type in database
                    from app.models.db_models import PluginTypeDB

                    db_type = PluginTypeDB(
                        type_id="test_plugin",
                        plugin_type="image",
                        name="Test Plugin",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    # Track what config was passed to register_plugin
                    captured_config = {}

                    async def capture_register_plugin(*args, **kwargs):
                        captured_config.update(kwargs.get("config", {}))
                        return mock_plugin

                # Mock register_plugin to capture config - patch at the import location
                with patch(
                    "app.plugins.utils.instance_manager.plugin_registry.register_plugin",
                    side_effect=capture_register_plugin,
                ) as mock_register:
                    result = await handle_plugin_config_update_generic(
                        type_id="test_plugin",
                        config={
                            "count": 30,
                            "_instance_id": "custom-id",
                            "_instance_name": "Custom Name",
                            "_instance_enabled": True,
                        },
                        enabled=True,
                        db_type=mock_db_type,
                        session=session,
                        manager_config=manager_config,
                    )

                    # Verify metadata fields are not in normalized config
                    assert result is not None
                    assert result.get("instance_created") is True
                    assert mock_register.called
                    call_kwargs = mock_register.call_args[1]
                    normalized_config = call_kwargs["config"]
                    assert "_instance_id" not in normalized_config
                    assert "_instance_name" not in normalized_config
                    assert "_instance_enabled" not in normalized_config

    async def test_prepare_instance_config_callback(self, test_db, mock_db_type, mock_plugin):
        """Test prepare_instance_config callback."""

        def prepare_config(config, metadata):
            return {
                **config,
                "instance_name": metadata["instance_name"],
                "enabled": metadata["instance_enabled"],
            }

        manager_config = InstanceManagerConfig(
            type_id="test_plugin",
            single_instance=False,
            generate_instance_id=lambda c, t: f"{t}-test",
            prepare_instance_config=prepare_config,
            default_instance_name="Test Plugin",
        )

        # Track what config was passed
        captured_config = {}

        async def capture_register_plugin(*args, **kwargs):
            captured_config.update(kwargs.get("config", {}))
            return mock_plugin

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = mock_plugin
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "test_plugin", "plugin_type": "image", "name": "Test Plugin"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Mock register_plugin to capture config - patch at the import location
                with patch(
                    "app.plugins.utils.instance_manager.plugin_registry.register_plugin",
                    side_effect=capture_register_plugin,
                ) as mock_register:
                    async with test_db as session:
                        # Create plugin type in database
                        from app.models.db_models import PluginTypeDB

                        db_type = PluginTypeDB(
                            type_id="test_plugin",
                            plugin_type="image",
                            name="Test Plugin",
                            enabled=True,
                        )
                        session.add(db_type)
                        await session.commit()

                        result = await handle_plugin_config_update_generic(
                            type_id="test_plugin",
                            config={
                                "count": 30,
                                "_instance_name": "My Instance",
                                "_instance_enabled": True,
                            },
                            enabled=True,
                            db_type=mock_db_type,
                            session=session,
                            manager_config=manager_config,
                        )

                        # Verify prepare_instance_config was called
                        assert result is not None
                        assert result.get("instance_created") is True, (
                            f"Expected instance_created=True, got {result}"
                        )
                        # Verify the prepared config was passed to register_plugin
                        assert mock_register.called, "register_plugin should have been called"
                        call_kwargs = mock_register.call_args[1]
                        prepared_config = call_kwargs["config"]
                        assert prepared_config["instance_name"] == "My Instance"
                        assert prepared_config["enabled"] is True

    async def test_on_instance_created_callback(
        self, manager_config, test_db, mock_db_type, mock_plugin
    ):
        """Test on_instance_created callback."""

        callback_called = []

        def on_created(plugin, result):
            callback_called.append((plugin, result))

        manager_config.on_instance_created = on_created

        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.create_plugin_instance.return_value = mock_plugin
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "test_plugin", "plugin_type": "image", "name": "Test Plugin"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                async with test_db as session:
                    # Create plugin type in database
                    from app.models.db_models import PluginTypeDB

                    db_type = PluginTypeDB(
                        type_id="test_plugin",
                        plugin_type="image",
                        name="Test Plugin",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    result = await handle_plugin_config_update_generic(
                        type_id="test_plugin",
                        config={"count": 30, "_instance_name": "Test Instance"},
                        enabled=True,
                        db_type=mock_db_type,
                        session=session,
                        manager_config=manager_config,
                    )

                    # Verify callback was called
                    assert result is not None
                    assert len(callback_called) == 1
                    assert callback_called[0][0] == mock_plugin
                    assert callback_called[0][1]["instance_created"] is True

    async def test_on_instance_updated_callback(
        self, manager_config, test_db, mock_db_type, mock_plugin
    ):
        """Test on_instance_updated callback."""
        from app.models.db_models import PluginDB
        from app.plugins.manager import plugin_manager

        callback_called = []

        def on_updated(plugin, result):
            callback_called.append((plugin, result))

        manager_config.on_instance_updated = on_updated

        # Ensure plugin is not already registered
        try:
            await plugin_manager.unregister("test-instance")
        except Exception:
            pass

        # Add plugin to manager
        await plugin_manager.register(mock_plugin)

        # Create database instance
        async with test_db as session:
            db_instance = PluginDB(
                id="test-instance",
                type_id="test_plugin",
                plugin_type="image",
                name="Test Instance",
                enabled=True,
                config={"count": 10},
            )
            session.add(db_instance)
            await session.commit()

            await handle_plugin_config_update_generic(
                type_id="test_plugin",
                config={"count": 50, "_instance_id": "test-instance"},
                enabled=True,
                db_type=mock_db_type,
                session=session,
                manager_config=manager_config,
            )

            # Verify callback was called
            assert len(callback_called) == 1
            assert callback_called[0][0] == mock_plugin
            assert callback_called[0][1]["instance_updated"] is True

            # Cleanup
            await plugin_manager.unregister("test-instance")
