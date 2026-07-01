"""Tests for Local Image plugin.

Run from backend directory:
    pytest tests/unit/test_local_plugin.py -v
"""

import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.image.local import LocalImagePlugin
from app.plugins.loader import PluginLoader


@pytest.fixture
def temp_image_dir():
    """Create a temporary directory for images."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def local_plugin(temp_image_dir, monkeypatch):
    """Create a LocalImagePlugin instance pointed at a temp dir via IMAGE_DIR."""
    monkeypatch.setenv("IMAGE_DIR", str(temp_image_dir))
    return LocalImagePlugin(
        plugin_id="local-images",
        name="Local Images",
        enabled=True,
    )


class TestLocalImagePlugin:
    """Tests for LocalImagePlugin class."""

    def test_metadata(self):
        """Test declarative plugin metadata."""
        metadata = LocalImagePlugin.metadata
        assert metadata.type_id == "local"
        assert metadata.name == "Local Images"
        assert metadata.supports_multiple_instances is False
        assert metadata.fixed_instance_id == "local-images"
        assert {section["type"] for section in metadata.ui_sections} == {
            "upload",
            "manage_images",
        }

    def test_registers_as_image_plugin(self):
        """The loader derives the image family from the class."""
        import app.plugins.image.local as local_module

        loader = PluginLoader()
        assert "local" in loader.register_module(local_module)
        (definition,) = loader.get_plugin_types()
        assert definition.plugin_type == PluginType.IMAGE
        assert definition.plugin_class is LocalImagePlugin

    def test_init(self, local_plugin, temp_image_dir):
        """Test plugin initialization."""
        assert local_plugin.plugin_id == "local-images"
        assert local_plugin.name == "Local Images"
        assert local_plugin.image_dir == temp_image_dir.resolve()
        assert local_plugin.thumbnail_dir == temp_image_dir.resolve() / "thumbnails"
        assert local_plugin.enabled is True
        assert local_plugin.image_dir.exists()
        assert local_plugin.thumbnail_dir.exists()

    async def test_initialize(self, local_plugin):
        """Test plugin initialization."""
        await local_plugin.initialize()
        # Should not raise any errors
        assert local_plugin._images is not None

    async def test_cleanup(self, local_plugin):
        """Test plugin cleanup."""
        await local_plugin.cleanup()
        # Should not raise any errors

    async def test_configure(self, local_plugin):
        """Test plugin configuration."""
        # Configure with empty config (no config needed for local plugin)
        await local_plugin.configure({})
        # Should not raise any errors

    async def test_configure_with_image_dir_env_var(self, local_plugin, monkeypatch):
        """Test configuring with IMAGE_DIR environment variable change."""
        with tempfile.TemporaryDirectory() as new_dir:
            monkeypatch.setenv("IMAGE_DIR", new_dir)
            new_image_dir = Path(new_dir).resolve()

            await local_plugin.configure({})

            # Should update image_dir if IMAGE_DIR changed
            assert local_plugin.image_dir == new_image_dir

    async def test_configure_with_image_dir_config_key(self, local_plugin, temp_image_dir):
        """Test configuring an explicit image_dir via config."""
        custom_dir = temp_image_dir / "custom"
        await local_plugin.configure({"image_dir": str(custom_dir)})
        assert local_plugin.image_dir == custom_dir
        assert local_plugin.image_dir.exists()

    async def test_scan_images_empty(self, local_plugin):
        """Test scanning images from empty directory."""
        await local_plugin.scan_images()
        images = await local_plugin.get_images()
        assert len(images) == 0

    async def test_get_images(self, local_plugin):
        """Test getting images."""
        images = await local_plugin.get_images()
        assert isinstance(images, list)

    async def test_get_image_not_found(self, local_plugin):
        """Test getting non-existent image."""
        image = await local_plugin.get_image("nonexistent")
        assert image is None


class TestLocalConfigUpdate:
    """Tests for the host-side config-update flow for the local type."""

    async def test_apply_plugin_config_update(self, test_db, monkeypatch):
        """Test apply_plugin_config_update uses the fixed single-instance id."""
        import app.plugins.image.local as local_module
        import app.plugins.loader as loader_module
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        fresh_loader = PluginLoader()
        fresh_loader.register_module(local_module)
        monkeypatch.setattr(loader_module, "plugin_loader", fresh_loader)

        from app.models.db_models import PluginTypeDB

        # Mock plugin_loader used by the registration layer
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

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if not db_type:
                    db_type = await PluginTypeDB.objects.create(
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        enabled=True,
                    )
                else:
                    db_type.enabled = True
                    await db_type.update()

                # Test creating a new instance
                result = await apply_plugin_config_update(
                    type_id="local",
                    config={},  # Empty config - uses the default directory
                    enabled=True,
                    db_type=db_type,
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert result.get("instance_id") == "local-images"

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                from app.models.db_models import PluginDB

                db_plugin = await PluginDB.objects.get_or_none(id="local-images")
                assert db_plugin is not None
                assert db_plugin.type_id == "local"
                assert db_plugin.config == {}  # Empty config
