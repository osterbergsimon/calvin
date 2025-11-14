"""Image service using plugin architecture."""

import random
from typing import Any

from app.plugins.base import PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import ImagePlugin


class PluginImageService:
    """Image service using plugin architecture."""

    def __init__(self):
        """Initialize image service."""
        self._current_image_id: str | None = None
        self._current_plugin_id: str | None = None
        self._all_images: list[dict[str, Any]] = []
        self._randomized_order: list[dict[str, Any]] = []

    async def get_images(self, randomize: bool = False) -> list[dict[str, Any]]:
        """
        Get list of all images from all enabled image plugins.

        Args:
            randomize: Whether to randomize the order of images

        Returns:
            List of image metadata dictionaries
        """
        images = []

        # Get all enabled image plugins
        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)

        # Also check if plugin types are enabled
        from sqlalchemy import select

        from app.database import AsyncSessionLocal
        from app.models.db_models import PluginDB, PluginTypeDB

        # Get enabled plugin types
        async with AsyncSessionLocal() as session:
            # Get all image plugin types and their enabled status
            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.plugin_type == "image")
            )
            plugin_types = result.scalars().all()
            # Create a map of type_id -> enabled status (default to True if not in DB)
            enabled_type_map = {pt.type_id: pt.enabled for pt in plugin_types}

            # Get type_id for each plugin instance
            result = await session.execute(select(PluginDB).where(PluginDB.plugin_type == "image"))
            db_plugins = result.scalars().all()
            # Create a map of plugin_id -> type_id
            plugin_type_map = {db_plugin.id: db_plugin.type_id for db_plugin in db_plugins}

        # Fetch images from all plugins, but only if plugin type is enabled
        for plugin in plugins:
            if not isinstance(plugin, ImagePlugin):
                continue

            # Check if this plugin's type is enabled
            type_id = plugin_type_map.get(plugin.plugin_id)
            if type_id:
                # Check if plugin type is enabled (default to True if not in map)
                type_enabled = enabled_type_map.get(type_id, True)
                if not type_enabled:
                    print(
                        f"[ImageService] Skipping plugin {plugin.plugin_id} - "
                        f"plugin type {type_id} is disabled"
                    )
                    continue

            try:
                plugin_images = await plugin.get_images()
                images.extend(plugin_images)
            except Exception as e:
                print(f"Error fetching images from image plugin {plugin.plugin_id}: {e}")

        # Store original order
        self._all_images = images.copy()

        # Randomize if requested
        if randomize and images:
            randomized = images.copy()
            random.shuffle(randomized)
            self._randomized_order = randomized
            return randomized

        # Store original order as randomized order when not randomizing
        self._randomized_order = images.copy()
        return images

    async def get_current_image(self, randomize: bool = False) -> dict[str, Any] | None:
        """
        Get current image metadata.

        Args:
            randomize: Whether to use randomized order

        Returns:
            Current image metadata or None if no images
        """
        # Get images (with randomization if requested)
        if not self._all_images:
            await self.get_images(randomize=randomize)
        elif randomize and not self._randomized_order:
            # Re-randomize if requested
            await self.get_images(randomize=True)

        # Use randomized order if randomize is True, otherwise use original order
        images = self._randomized_order if randomize else self._all_images

        if not images:
            return None

        # Find current image by ID
        if self._current_image_id:
            for img in images:
                if img["id"] == self._current_image_id:
                    return img

        # Return first image if no current image set
        return images[0]

    async def next_image(self, randomize: bool = False) -> dict[str, Any] | None:
        """
        Move to next image and return it.

        Args:
            randomize: Whether to use randomized order

        Returns:
            Next image metadata or None if no images
        """
        # Always refresh images to ensure we have the latest from enabled plugins
        await self.get_images(randomize=randomize)

        # Use randomized order if randomize is True, otherwise use original order
        images = self._randomized_order if randomize else self._all_images

        if not images:
            return None

        # Find current index
        current_index = 0
        if self._current_image_id:
            for i, img in enumerate(images):
                if img["id"] == self._current_image_id:
                    current_index = i
                    break

        # Move to next image
        next_index = (current_index + 1) % len(images)
        next_image = images[next_index]

        self._current_image_id = next_image["id"]
        self._current_plugin_id = next_image.get("source")

        return next_image

    async def previous_image(self, randomize: bool = False) -> dict[str, Any] | None:
        """
        Move to previous image and return it.

        Args:
            randomize: Whether to use randomized order

        Returns:
            Previous image metadata or None if no images
        """
        # Always refresh images to ensure we have the latest from enabled plugins
        await self.get_images(randomize=randomize)

        # Use randomized order if randomize is True, otherwise use original order
        images = self._randomized_order if randomize else self._all_images

        if not images:
            return None

        # Find current index
        current_index = 0
        if self._current_image_id:
            for i, img in enumerate(images):
                if img["id"] == self._current_image_id:
                    current_index = i
                    break

        # Move to previous image
        prev_index = (current_index - 1) % len(images)
        prev_image = images[prev_index]

        self._current_image_id = prev_image["id"]
        self._current_plugin_id = prev_image.get("source")

        return prev_image

    async def get_image_by_id(self, image_id: str) -> dict[str, Any] | None:
        """
        Get image by ID.

        Args:
            image_id: Image ID

        Returns:
            Image metadata or None if not found
        """
        # Find which plugin owns this image
        if not self._all_images:
            await self.get_images()

        # First, try to find in cached list
        for img in self._all_images:
            if img["id"] == image_id:
                return img

        # If not found, search all plugins
        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)
        for plugin in plugins:
            if not isinstance(plugin, ImagePlugin):
                continue

            try:
                img = await plugin.get_image(image_id)
                if img:
                    return img
            except Exception as e:
                print(f"Error getting image {image_id} from plugin {plugin.plugin_id}: {e}")

        return None

    async def get_image_data(self, image_id: str) -> bytes | None:
        """
        Get image file data by ID.

        Args:
            image_id: Image ID

        Returns:
            Image file data as bytes or None if not found
        """
        # Find which plugin owns this image
        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)

        for plugin in plugins:
            if not isinstance(plugin, ImagePlugin):
                continue

            try:
                # Check if this plugin has the image
                img = await plugin.get_image(image_id)
                if img:
                    # Get image data from the plugin
                    data = await plugin.get_image_data(image_id)
                    if data:
                        return data
            except Exception as e:
                print(f"Error getting image data {image_id} from plugin {plugin.plugin_id}: {e}")

        return None

    async def upload_image(self, file_data: bytes, filename: str) -> dict[str, Any] | None:
        """
        Upload an image to the first plugin that supports upload.

        Args:
            file_data: Image file data as bytes
            filename: Original filename

        Returns:
            Image metadata dictionary or None if upload failed
        """
        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)

        for plugin in plugins:
            if not isinstance(plugin, ImagePlugin):
                continue

            try:
                result = await plugin.upload_image(file_data, filename)
                if result:
                    # Refresh images list
                    await self.get_images()
                    return result
            except Exception as e:
                print(f"Error uploading image to plugin {plugin.plugin_id}: {e}")

        return None

    async def delete_image(self, image_id: str) -> bool:
        """
        Delete an image from the plugin that owns it.

        Args:
            image_id: Image ID

        Returns:
            True if deleted, False if not found or deletion failed
        """
        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)

        for plugin in plugins:
            if not isinstance(plugin, ImagePlugin):
                continue

            try:
                # Check if this plugin has the image
                img = await plugin.get_image(image_id)
                if img:
                    # Delete from the plugin
                    result = await plugin.delete_image(image_id)
                    if result:
                        # Refresh images list
                        await self.get_images()
                        # Clear current image if it was deleted
                        if self._current_image_id == image_id:
                            self._current_image_id = None
                            self._current_plugin_id = None
                        return True
            except Exception as e:
                print(f"Error deleting image {image_id} from plugin {plugin.plugin_id}: {e}")

        return False

    async def scan_images(self) -> list[dict[str, Any]]:
        """
        Scan for new/updated images in all plugins.

        Returns:
            List of image metadata dictionaries
        """
        images = []

        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)

        for plugin in plugins:
            if not isinstance(plugin, ImagePlugin):
                continue

            try:
                plugin_images = await plugin.scan_images()
                images.extend(plugin_images)
            except Exception as e:
                print(f"Error scanning images from plugin {plugin.plugin_id}: {e}")

        # Update cached list
        self._all_images = images

        return images
