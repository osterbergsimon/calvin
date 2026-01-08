"""Comprehensive unit tests for plugin image service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.protocols import ImagePlugin
from app.services.plugin_image_service import PluginImageService


def create_mock_session(plugin_types=None, db_plugins=None):
    """Helper to create a mock AsyncSessionLocal with proper async context manager."""
    if plugin_types is None:
        plugin_types = []
    if db_plugins is None:
        db_plugins = []

    mock_session_instance = MagicMock()
    mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
    mock_session_instance.__aexit__ = AsyncMock(return_value=None)

    # Mock execute results
    mock_type_result = MagicMock()
    mock_type_result.scalars.return_value.all.return_value = plugin_types

    mock_db_result = MagicMock()
    mock_db_result.scalars.return_value.all.return_value = db_plugins

    # Make execute return different results for different queries
    def execute_side_effect(query):
        query_str = str(query)
        if "plugin_types" in query_str.lower() or "PluginTypeDB" in query_str:
            return mock_type_result
        else:
            return mock_db_result

    mock_session_instance.execute = AsyncMock(side_effect=execute_side_effect)
    return patch("app.database.AsyncSessionLocal", return_value=mock_session_instance)


class MockImagePlugin(ImagePlugin):
    """Test implementation of ImagePlugin for testing."""

    def __init__(self, plugin_id: str, images: list[dict] | None = None):
        """Initialize test plugin."""
        super().__init__(plugin_id, plugin_id, enabled=True)
        self._images = images or []
        self._image_data = {}

    @classmethod
    def get_plugin_metadata(cls) -> dict:
        """Return plugin metadata."""
        return {
            "type_id": "test",
            "name": "Test Plugin",
            "description": "Test plugin for unit tests",
        }

    async def initialize(self) -> None:
        """Initialize plugin."""
        self.start()

    async def cleanup(self) -> None:
        """Cleanup plugin."""
        self.stop()

    async def get_images(self) -> list[dict]:
        """Get images."""
        return self._images.copy()

    async def get_image(self, image_id: str) -> dict | None:
        """Get image by ID."""
        for img in self._images:
            if img.get("id") == image_id:
                return img
        return None

    async def get_image_data(self, image_id: str) -> bytes | None:
        """Get image data."""
        return self._image_data.get(image_id)

    async def scan_images(self) -> list[dict]:
        """Scan images."""
        return self._images.copy()

    async def validate_config(self, config: dict) -> bool:
        """Validate config."""
        return True

    async def upload_image(self, file_data: bytes, filename: str) -> dict | None:
        """Upload image."""
        image_id = f"{self.plugin_id}_{filename}"
        img = {"id": image_id, "filename": filename, "source": self.plugin_id}
        self._images.append(img)
        return img

    async def delete_image(self, image_id: str) -> bool:
        """Delete image."""
        for i, img in enumerate(self._images):
            if img.get("id") == image_id:
                self._images.pop(i)
                return True
        return False


@pytest.mark.asyncio
class TestPluginImageService:
    """Test suite for PluginImageService."""

    async def test_get_current_image_no_images(self):
        """Test get_current_image when no images are available."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", [])
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_current_image()

                assert result is None

    async def test_get_current_image_returns_first(self):
        """Test get_current_image returns first image when no current set."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_current_image()

                assert result is not None
                assert result["id"] == "img1"

    async def test_get_current_image_returns_current(self):
        """Test get_current_image returns current image when set."""
        service = PluginImageService()
        service._current_image_id = "img2"

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_current_image()

                assert result is not None
                assert result["id"] == "img2"

    async def test_get_current_image_with_randomization(self):
        """Test get_current_image with randomization."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
            {"id": "img3", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_current_image(randomize=True)

                # Should return an image (order may be randomized)
                assert result is not None
                assert result["id"] in ["img1", "img2", "img3"]

    async def test_next_image_advances_to_next(self):
        """Test next_image advances to next image."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
            {"id": "img3", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                # First call: no current image, starts at index 0, moves to index 1
                result1 = await service.next_image()
                assert result1["id"] == "img2"
                assert service._current_image_id == "img2"

                # Second call: current is img2 (index 1), moves to index 2
                result2 = await service.next_image()
                assert result2["id"] == "img3"
                assert service._current_image_id == "img3"

    async def test_next_image_wraps_around(self):
        """Test next_image wraps around to first image."""
        service = PluginImageService()
        service._current_image_id = "img3"

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
            {"id": "img3", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.next_image()

                assert result["id"] == "img1"
                assert service._current_image_id == "img1"

    async def test_previous_image_goes_back(self):
        """Test previous_image goes to previous image."""
        service = PluginImageService()
        service._current_image_id = "img2"

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
            {"id": "img3", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.previous_image()

                assert result["id"] == "img1"
                assert service._current_image_id == "img1"

    async def test_previous_image_wraps_around(self):
        """Test previous_image wraps around to last image."""
        service = PluginImageService()
        service._current_image_id = "img1"

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
            {"id": "img3", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.previous_image()

                assert result["id"] == "img3"
                assert service._current_image_id == "img3"

    async def test_get_image_by_id_found_in_cache(self):
        """Test get_image_by_id finds image in cached list."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [
            {"id": "img1", "source": "local-images"},
            {"id": "img2", "source": "local-images"},
        ]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                # Populate cache
                await service.get_images()

                result = await service.get_image_by_id("img2")

                assert result is not None
                assert result["id"] == "img2"

    async def test_get_image_by_id_not_found_in_cache(self):
        """Test get_image_by_id searches plugins when not in cache."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [{"id": "img1", "source": "local-images"}]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                # Add image to plugin but not to cache
                mock_plugin._images.append({"id": "img2", "source": "local-images"})

                result = await service.get_image_by_id("img2")

                assert result is not None
                assert result["id"] == "img2"

    async def test_get_image_by_id_not_found(self):
        """Test get_image_by_id returns None when image not found."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        images = [{"id": "img1", "source": "local-images"}]

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", images)
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_image_by_id("nonexistent")

                assert result is None

    async def test_get_image_data_success(self):
        """Test get_image_data returns image data."""
        service = PluginImageService()

        image_data = b"fake image data"
        images = [{"id": "img1", "source": "local-images"}]

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin = MockImagePlugin("local-images", images)
            mock_plugin._image_data["img1"] = image_data
            mock_manager.get_plugins.return_value = [mock_plugin]

            result = await service.get_image_data("img1")

            assert result == image_data

    async def test_get_image_data_not_found(self):
        """Test get_image_data returns None when image not found."""
        service = PluginImageService()

        images = [{"id": "img1", "source": "local-images"}]

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin = MockImagePlugin("local-images", images)
            mock_manager.get_plugins.return_value = [mock_plugin]

            result = await service.get_image_data("nonexistent")

            assert result is None

    async def test_upload_image_success(self):
        """Test upload_image successfully uploads to first supporting plugin."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        file_data = b"fake image data"
        filename = "test.jpg"

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", [])
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.upload_image(file_data, filename)

                assert result is not None
                assert result["filename"] == filename
                assert result["source"] == "local-images"

    async def test_upload_image_no_supporting_plugin(self):
        """Test upload_image returns None when no plugin supports upload."""
        service = PluginImageService()

        # Create a plugin that doesn't support upload
        class NonUploadPlugin(MockImagePlugin):
            async def upload_image(self, file_data: bytes, filename: str) -> dict | None:
                return None

            @classmethod
            def get_plugin_metadata(cls) -> dict:
                return {
                    "type_id": "non-upload",
                    "name": "Non Upload Plugin",
                    "description": "Test plugin that doesn't support upload",
                }

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin = NonUploadPlugin("local-images", [])
            mock_manager.get_plugins.return_value = [mock_plugin]

            result = await service.upload_image(b"data", "test.jpg")

            assert result is None

    async def test_delete_image_success(self):
        """Test delete_image successfully deletes image."""
        service = PluginImageService()
        service._current_image_id = "img1"

        images = [{"id": "img1", "source": "local-images"}]

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin = MockImagePlugin("local-images", images)
            mock_manager.get_plugins.return_value = [mock_plugin]

            result = await service.delete_image("img1")

            assert result is True
            assert service._current_image_id is None

    async def test_delete_image_clears_current(self):
        """Test delete_image clears current image if it was deleted."""
        service = PluginImageService()
        service._current_image_id = "img1"
        service._current_plugin_id = "local-images"

        images = [{"id": "img1", "source": "local-images"}]

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin = MockImagePlugin("local-images", images)
            mock_manager.get_plugins.return_value = [mock_plugin]

            await service.delete_image("img1")

            assert service._current_image_id is None
            assert service._current_plugin_id is None

    async def test_delete_image_not_found(self):
        """Test delete_image returns False when image not found."""
        service = PluginImageService()

        images = [{"id": "img1", "source": "local-images"}]

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin = MockImagePlugin("local-images", images)
            mock_manager.get_plugins.return_value = [mock_plugin]

            result = await service.delete_image("nonexistent")

            assert result is False

    async def test_scan_images_success(self):
        """Test scan_images scans all plugins and updates cache."""
        service = PluginImageService()

        images1 = [{"id": "img1", "source": "plugin1"}]
        images2 = [{"id": "img2", "source": "plugin2"}]

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin1 = MockImagePlugin("plugin1", images1)
            mock_plugin2 = MockImagePlugin("plugin2", images2)
            mock_manager.get_plugins.return_value = [mock_plugin1, mock_plugin2]

            result = await service.scan_images()

            assert len(result) == 2
            assert service._all_images == result

    async def test_scan_images_handles_errors(self):
        """Test scan_images handles plugin errors gracefully."""
        service = PluginImageService()

        images1 = [{"id": "img1", "source": "plugin1"}]

        class ErrorPlugin(MockImagePlugin):
            async def scan_images(self) -> list[dict]:
                raise Exception("Scan error")

            @classmethod
            def get_plugin_metadata(cls) -> dict:
                return {
                    "type_id": "error",
                    "name": "Error Plugin",
                    "description": "Test plugin that errors",
                }

        with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
            mock_plugin1 = MockImagePlugin("plugin1", images1)
            mock_plugin2 = ErrorPlugin("plugin2", [])
            mock_manager.get_plugins.return_value = [mock_plugin1, mock_plugin2]

            result = await service.scan_images()

            # Should still return images from working plugin
            assert len(result) == 1
            assert result[0]["id"] == "img1"

    async def test_get_images_handles_plugin_errors(self):
        """Test get_images handles plugin errors gracefully."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        class ErrorPlugin(MockImagePlugin):
            async def get_images(self) -> list[dict]:
                raise Exception("Plugin error")

            @classmethod
            def get_plugin_metadata(cls) -> dict:
                return {
                    "type_id": "error",
                    "name": "Error Plugin",
                    "description": "Test plugin that errors",
                }

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = ErrorPlugin("local-images", [])
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_images()

                # Should return empty list when plugin errors
                assert result == []

    async def test_get_images_skips_non_image_plugins(self):
        """Test get_images skips plugins that are not ImagePlugin instances."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                # Create a non-ImagePlugin mock
                mock_non_image = MagicMock()
                mock_non_image.plugin_id = "non-image"
                mock_manager.get_plugins.return_value = [mock_non_image]

                result = await service.get_images()

                assert result == []

    async def test_get_images_handles_missing_type_id(self):
        """Test get_images handles plugins with missing type_id."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        # Don't include plugin in db_plugins, so type_id won't be found
        mock_db_plugins = []

        with create_mock_session([mock_plugin_type], mock_db_plugins):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", [])
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_images()

                # Plugin should be skipped when type_id is missing
                assert result == []

    async def test_get_images_empty_plugin_response(self):
        """Test get_images handles plugins that return empty lists."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = MockImagePlugin("local-images", [])
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_images()

                assert result == []

    async def test_get_images_none_plugin_response(self):
        """Test get_images handles plugins that return None."""
        service = PluginImageService()

        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )
        mock_db_plugin = MagicMock(id="local-images", type_id="local", display_order=0)

        class NonePlugin(MockImagePlugin):
            async def get_images(self) -> list[dict]:
                return None

            @classmethod
            def get_plugin_metadata(cls) -> dict:
                return {
                    "type_id": "none",
                    "name": "None Plugin",
                    "description": "Test plugin that returns None",
                }

        with create_mock_session([mock_plugin_type], [mock_db_plugin]):
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_plugin = NonePlugin("local-images", [])
                mock_manager.get_plugins.return_value = [mock_plugin]

                result = await service.get_images()

                assert result == []
