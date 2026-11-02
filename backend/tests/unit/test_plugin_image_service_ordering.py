"""Unit tests for image plugin ordering functionality."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.protocols import ImagePlugin
from app.services.plugin_image_service import PluginImageService


def create_mock_ormar_models(plugin_types, db_plugins):
    """Helper to create mock Ormar model objects for testing.

    Patches the entire model classes in the db_models module to avoid property issues.
    """
    # Mock PluginTypeDB.objects
    mock_plugin_type_manager = MagicMock()
    mock_plugin_type_manager.filter.return_value.all = AsyncMock(return_value=plugin_types)
    mock_plugin_type_manager.all = AsyncMock(return_value=plugin_types)

    # Mock PluginDB.objects
    mock_plugin_db_manager = MagicMock()
    mock_plugin_db_manager.filter.return_value.all = AsyncMock(return_value=db_plugins)
    mock_plugin_db_manager.filter.return_value.order_by.return_value.all = AsyncMock(
        return_value=db_plugins
    )
    mock_plugin_db_manager.all = AsyncMock(return_value=db_plugins)

    # Create mock classes that have the objects property as a simple attribute
    # This avoids the read-only property issue
    class MockPluginTypeDB:
        def __init__(self):
            pass

        objects = mock_plugin_type_manager

    class MockPluginDB:
        def __init__(self):
            pass

        objects = mock_plugin_db_manager

    # Patch the entire classes in the db_models module
    from unittest.mock import patch

    from app.models import db_models

    type_patch = patch.object(db_models, "PluginTypeDB", MockPluginTypeDB)
    db_patch = patch.object(db_models, "PluginDB", MockPluginDB)

    return (type_patch, db_patch)


@pytest.mark.asyncio
class TestImagePluginOrdering:
    """Test image plugin ordering functionality."""

    async def test_get_images_sorts_plugins_by_display_order(self):
        """Test that plugins are sorted by display_order from common_config."""
        service = PluginImageService()

        # Mock plugin types with different display orders
        mock_plugin_types = [
            MagicMock(type_id="local", enabled=True, common_config_schema={"display_order": "2"}),
            MagicMock(type_id="imap", enabled=True, common_config_schema={"display_order": "1"}),
        ]

        # Mock plugin instances
        mock_plugins = [
            MagicMock(plugin_id="imap-instance-1", enabled=True, spec=ImagePlugin),
            MagicMock(plugin_id="local-images", enabled=True, spec=ImagePlugin),
        ]

        # Mock database queries
        mock_db_plugins = [
            MagicMock(id="imap-instance-1", type_id="imap", display_order=0),
            MagicMock(id="local-images", type_id="local", display_order=0),
        ]

        type_patch, db_patch = create_mock_ormar_models(mock_plugin_types, mock_db_plugins)
        with type_patch, db_patch:
            # Mock plugin manager
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_manager.get_plugins.return_value = mock_plugins

                # Mock plugin.get_images() methods
                mock_plugins[0].get_images = AsyncMock(
                    return_value=[{"id": "img1", "source": "imap-instance-1"}]
                )
                mock_plugins[1].get_images = AsyncMock(
                    return_value=[{"id": "img2", "source": "local-images"}]
                )

                # Execute
                images = await service.get_images(randomize=False)

                # Verify order: imap (order 1) should come before local (order 2)
                assert len(images) == 2
                assert images[0]["source"] == "imap-instance-1"
                assert images[1]["source"] == "local-images"

    async def test_get_images_sorts_instances_by_display_order(self):
        """Test that instances within a plugin type are sorted by display_order."""
        service = PluginImageService()

        # Mock plugin type
        mock_plugin_type = MagicMock(
            type_id="imap", enabled=True, common_config_schema={"display_order": "0"}
        )

        # Mock multiple IMAP instances with different display orders
        mock_plugins = [
            MagicMock(plugin_id="imap-instance-2", enabled=True, spec=ImagePlugin),
            MagicMock(plugin_id="imap-instance-1", enabled=True, spec=ImagePlugin),
        ]

        # Mock database queries
        mock_db_plugins = [
            MagicMock(id="imap-instance-1", type_id="imap", display_order=0),
            MagicMock(id="imap-instance-2", type_id="imap", display_order=1),
        ]

        type_patch, db_patch = create_mock_ormar_models([mock_plugin_type], mock_db_plugins)
        with type_patch, db_patch:
            # Mock plugin manager
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_manager.get_plugins.return_value = mock_plugins

                # Mock plugin.get_images() methods
                mock_plugins[0].get_images = AsyncMock(
                    return_value=[{"id": "img2", "source": "imap-instance-2"}]
                )
                mock_plugins[1].get_images = AsyncMock(
                    return_value=[{"id": "img1", "source": "imap-instance-1"}]
                )

                # Execute
                images = await service.get_images(randomize=False)

                # Verify order: instance-1 (order 0) should come before instance-2 (order 1)
                assert len(images) == 2
                assert images[0]["source"] == "imap-instance-1"
                assert images[1]["source"] == "imap-instance-2"

    async def test_get_images_filters_disabled_plugin_types(self):
        """Test that disabled plugin types are excluded."""
        service = PluginImageService()

        # Mock plugin types - one enabled, one disabled
        mock_plugin_types = [
            MagicMock(type_id="local", enabled=True, common_config_schema={"display_order": "0"}),
            MagicMock(
                type_id="imap",
                enabled=False,  # Disabled
                common_config_schema={"display_order": "1"},
            ),
        ]

        # Mock plugin instances
        mock_plugins = [
            MagicMock(plugin_id="local-images", enabled=True, spec=ImagePlugin),
            MagicMock(plugin_id="imap-instance-1", enabled=True, spec=ImagePlugin),
        ]

        # Mock database queries
        mock_db_plugins = [
            MagicMock(id="local-images", type_id="local", display_order=0),
            MagicMock(id="imap-instance-1", type_id="imap", display_order=0),
        ]

        type_patch, db_patch = create_mock_ormar_models(mock_plugin_types, mock_db_plugins)
        with type_patch, db_patch:
            # Mock plugin manager
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_manager.get_plugins.return_value = mock_plugins

                # Mock plugin.get_images() methods
                mock_plugins[0].get_images = AsyncMock(
                    return_value=[{"id": "img1", "source": "local-images"}]
                )
                mock_plugins[1].get_images = AsyncMock(
                    return_value=[{"id": "img2", "source": "imap-instance-1"}]
                )

                # Execute
                images = await service.get_images(randomize=False)

                # Verify only enabled plugin type's images are included
                assert len(images) == 1
                assert images[0]["source"] == "local-images"

    async def test_get_images_global_randomization(self):
        """Test that global randomization shuffles all images together."""
        service = PluginImageService()

        # Mock plugin type
        mock_plugin_type = MagicMock(
            type_id="local", enabled=True, common_config_schema={"display_order": "0"}
        )

        # Mock plugin
        mock_plugin = MagicMock(plugin_id="local-images", enabled=True, spec=ImagePlugin)

        # Mock database queries
        mock_db_plugins = [
            MagicMock(id="local-images", type_id="local", display_order=0),
        ]

        type_patch, db_patch = create_mock_ormar_models([mock_plugin_type], mock_db_plugins)
        with type_patch, db_patch:
            # Mock plugin manager
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_manager.get_plugins.return_value = [mock_plugin]

                # Mock plugin.get_images() with multiple images
                mock_plugin.get_images = AsyncMock(
                    return_value=[
                        {"id": "img1", "source": "local-images"},
                        {"id": "img2", "source": "local-images"},
                        {"id": "img3", "source": "local-images"},
                    ]
                )

                # Execute with global randomization
                images = await service.get_images(randomize=True, randomize_per_plugin=False)

                # Verify images are returned (order may be different due to randomization)
                assert len(images) == 3
                # All images should be present
                image_ids = {img["id"] for img in images}
                assert image_ids == {"img1", "img2", "img3"}

    async def test_get_images_per_plugin_randomization(self):
        """Test that per-plugin randomization shuffles within each plugin."""
        service = PluginImageService()

        # Mock plugin types
        mock_plugin_types = [
            MagicMock(type_id="local", enabled=True, common_config_schema={"display_order": "0"}),
            MagicMock(type_id="imap", enabled=True, common_config_schema={"display_order": "1"}),
        ]

        # Mock plugins
        mock_plugins = [
            MagicMock(plugin_id="local-images", enabled=True, spec=ImagePlugin),
            MagicMock(plugin_id="imap-instance-1", enabled=True, spec=ImagePlugin),
        ]

        # Mock database queries
        mock_db_plugins = [
            MagicMock(id="local-images", type_id="local", display_order=0),
            MagicMock(id="imap-instance-1", type_id="imap", display_order=0),
        ]

        type_patch, db_patch = create_mock_ormar_models(mock_plugin_types, mock_db_plugins)
        with type_patch, db_patch:
            # Mock plugin manager
            with patch("app.services.plugin_image_service.plugin_manager") as mock_manager:
                mock_manager.get_plugins.return_value = mock_plugins

                # Mock plugin.get_images() methods
                mock_plugins[0].get_images = AsyncMock(
                    return_value=[
                        {"id": "local1", "source": "local-images"},
                        {"id": "local2", "source": "local-images"},
                    ]
                )
                mock_plugins[1].get_images = AsyncMock(
                    return_value=[
                        {"id": "imap1", "source": "imap-instance-1"},
                        {"id": "imap2", "source": "imap-instance-1"},
                    ]
                )

                # Execute with per-plugin randomization
                images = await service.get_images(randomize=False, randomize_per_plugin=True)

                # Verify all images are present
                assert len(images) == 4
                # Verify plugin order is preserved (local before imap)
                # Even if images within each plugin are randomized
                local_images = [img for img in images if img["source"] == "local-images"]
                imap_images = [img for img in images if img["source"] == "imap-instance-1"]
                assert len(local_images) == 2
                assert len(imap_images) == 2
                # Verify local images come before imap images
                assert (
                    images[0]["source"] == "local-images" or images[1]["source"] == "local-images"
                )
                assert (
                    images[2]["source"] == "imap-instance-1"
                    or images[3]["source"] == "imap-instance-1"
                )
