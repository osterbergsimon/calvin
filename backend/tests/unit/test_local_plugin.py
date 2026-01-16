"""Tests for Local Image plugin.

Run from backend directory:
    pytest tests/unit/test_local_plugin.py -v
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.image.local import LocalImagePlugin, handle_plugin_config_update


@pytest.fixture
def temp_image_dir():
    """Create a temporary directory for images."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def local_plugin(temp_image_dir):
    """Create a LocalImagePlugin instance."""
    # Set IMAGE_DIR env var for test
    original_env = os.environ.get("IMAGE_DIR")
    os.environ["IMAGE_DIR"] = str(temp_image_dir)

    try:
        plugin = LocalImagePlugin(
            plugin_id="local-images",
            name="Local Images",
            image_dir=temp_image_dir,
            thumbnail_dir=None,
            enabled=True,
        )
        yield plugin
    finally:
        # Cleanup
        if original_env is not None:
            os.environ["IMAGE_DIR"] = original_env
        elif "IMAGE_DIR" in os.environ:
            del os.environ["IMAGE_DIR"]


class TestLocalImagePlugin:
    """Tests for LocalImagePlugin class."""

    def test_get_plugin_metadata(self):
        """Test plugin metadata."""
        metadata = LocalImagePlugin.get_plugin_metadata()
        assert metadata["type_id"] == "local"
        assert metadata["plugin_type"] == PluginType.IMAGE
        assert metadata["name"] == "Local Images"
        assert metadata["supports_multiple_instances"] is False
        assert "common_config_schema" in metadata
        assert "instance_config_schema" in metadata

    def test_init(self, local_plugin, temp_image_dir):
        """Test plugin initialization."""
        assert local_plugin.plugin_id == "local-images"
        assert local_plugin.name == "Local Images"
        assert local_plugin.image_dir == temp_image_dir
        assert local_plugin.thumbnail_dir == temp_image_dir / "thumbnails"
        assert local_plugin.enabled is True
        assert local_plugin.image_dir.exists()
        assert local_plugin.thumbnail_dir.exists()

    def test_init_with_custom_thumbnail_dir(self, temp_image_dir):
        """Test plugin initialization with custom thumbnail directory."""
        thumb_dir = temp_image_dir / "custom_thumbnails"
        plugin = LocalImagePlugin(
            plugin_id="local-images",
            name="Local Images",
            image_dir=temp_image_dir,
            thumbnail_dir=thumb_dir,
            enabled=True,
        )
        assert plugin.thumbnail_dir == thumb_dir
        assert plugin.thumbnail_dir.exists()

    @pytest.mark.asyncio
    async def test_initialize(self, local_plugin):
        """Test plugin initialization."""
        await local_plugin.initialize()
        # Should not raise any errors
        assert local_plugin._images is not None

    @pytest.mark.asyncio
    async def test_cleanup(self, local_plugin):
        """Test plugin cleanup."""
        await local_plugin.cleanup()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_configure(self, local_plugin, temp_image_dir):
        """Test plugin configuration."""
        # Configure with empty config (no config needed for local plugin)
        await local_plugin.configure({})
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_configure_with_image_dir_env_var(self, local_plugin):
        """Test configuring with IMAGE_DIR environment variable change."""
        with tempfile.TemporaryDirectory() as new_dir:
            os.environ["IMAGE_DIR"] = new_dir
            new_image_dir = Path(new_dir).resolve()

            await local_plugin.configure({})

            # Should update image_dir if IMAGE_DIR changed
            assert local_plugin.image_dir == new_image_dir

    @pytest.mark.asyncio
    async def test_scan_images_empty(self, local_plugin):
        """Test scanning images from empty directory."""
        await local_plugin.scan_images()
        images = await local_plugin.get_images()
        assert len(images) == 0

    @pytest.mark.asyncio
    async def test_get_images(self, local_plugin):
        """Test getting images."""
        images = await local_plugin.get_images()
        assert isinstance(images, list)

    @pytest.mark.asyncio
    async def test_get_image_not_found(self, local_plugin):
        """Test getting non-existent image."""
        image = await local_plugin.get_image("nonexistent")
        assert image is None


@pytest.mark.asyncio
class TestLocalPluginHooks:
    """Tests for Local Image plugin hooks."""

    async def test_handle_plugin_config_update(self, test_db):
        """Test handle_plugin_config_update hook."""
        from app.models.db_models import PluginTypeDB

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

                async with test_db as session:
                    # Create plugin type in database
                    db_type = PluginTypeDB(
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        enabled=True,
                    )
                    session.add(db_type)
                    await session.commit()

                    # Test creating a new instance
                    result = await handle_plugin_config_update(
                        type_id="local",
                        config={},  # Empty config - uses hardcoded directory
                        enabled=True,
                        db_type=db_type,
                        session=session,
                    )

                    assert result is not None
                    assert result.get("instance_created") is True
                    assert result.get("instance_id") == "local-images"

                    # Verify plugin was registered
                    mock_instance_mgr.register.assert_called_once()

                    # Verify database entry was created
                    from sqlalchemy import select

                    from app.models.db_models import PluginDB

                    result_query = await session.execute(
                        select(PluginDB).where(PluginDB.id == "local-images")
                    )
                    db_plugin = result_query.scalar_one_or_none()
                    assert db_plugin is not None
                    assert db_plugin.type_id == "local"
                    assert db_plugin.config == {}  # Empty config
