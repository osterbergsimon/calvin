"""Image service using plugin architecture."""

import random
from datetime import datetime, timedelta
from typing import Any

from loguru import logger

from app.plugins.base import BasePlugin, PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import ImagePlugin
from app.services.event_system import event_system

# Loguru automatically includes module/function info in logs


class PluginImageService:
    """Image service using plugin architecture."""

    def __init__(self):
        """Initialize image service."""
        self._current_image_id: str | None = None
        self._current_plugin_id: str | None = None
        self._all_images: list[dict[str, Any]] = []
        self._randomized_order: list[dict[str, Any]] = []
        self._images_cache_time: datetime | None = None
        self._images_cache_ttl = timedelta(seconds=30)  # Cache for 30 seconds

    async def get_images(
        self, randomize: bool = False, randomize_per_plugin: bool = False
    ) -> list[dict[str, Any]]:
        """
        Get list of all images from all enabled image plugins, ordered by display_order.

        Args:
            randomize: Whether to randomize the order of images (global randomization)
            randomize_per_plugin: Whether to randomize images within each plugin
                (per-plugin randomization, respects plugin order)

        Returns:
            List of image metadata dictionaries
        """
        from sqlalchemy import select

        from app.database import AsyncSessionLocal
        from app.models.db_models import PluginDB, PluginTypeDB

        # Get enabled plugin types with their display_order from common_config_schema
        async with AsyncSessionLocal() as session:
            # Get all image plugin types and their enabled status + display_order
            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.plugin_type == "image")
            )
            plugin_types = result.scalars().all()
            # Create maps: type_id -> enabled status, type_id -> display_order
            enabled_type_map = {pt.type_id: pt.enabled for pt in plugin_types}
            plugin_type_order_map = {}
            for pt in plugin_types:
                common_config = pt.common_config_schema or {}
                # display_order is stored in common_config_schema (like service plugins)
                display_order = common_config.get("display_order", 0)
                try:
                    display_order = int(display_order) if display_order else 0
                except (ValueError, TypeError):
                    display_order = 0
                plugin_type_order_map[pt.type_id] = display_order

            # Get all image plugin instances with their display_order
            result = await session.execute(
                select(PluginDB)
                .where(PluginDB.plugin_type == "image")
                .order_by(PluginDB.display_order, PluginDB.name)
            )
            db_plugins = result.scalars().all()
            # Create maps: plugin_id -> type_id, plugin_id -> display_order
            plugin_type_map = {db_plugin.id: db_plugin.type_id for db_plugin in db_plugins}
            plugin_order_map = {
                db_plugin.id: (db_plugin.display_order or 0) for db_plugin in db_plugins
            }

        # Get all enabled image plugins
        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)
        logger.info("Found {} enabled image plugins", len(plugins))
        for p in plugins:
            running = p.is_running()
            logger.debug(
                "  - {} (enabled: {}, running: {})",
                p.plugin_id,
                p.enabled,
                running,
            )
            if hasattr(p, "image_dir"):
                logger.debug("    image_dir: {}", p.image_dir)

        # Group plugins by type_id and sort by plugin type display_order
        plugins_by_type: dict[str, list[BasePlugin]] = {}
        logger.debug("plugin_type_map: {}", plugin_type_map)
        for plugin in plugins:
            logger.debug("Processing plugin {}", plugin.plugin_id)
            if not isinstance(plugin, ImagePlugin):
                logger.debug("Plugin {} is not an ImagePlugin, skipping", plugin.plugin_id)
                continue

            type_id = plugin_type_map.get(plugin.plugin_id)
            logger.debug("Plugin {} has type_id: {}", plugin.plugin_id, type_id)
            if type_id:
                # Check if plugin type is enabled
                type_enabled = enabled_type_map.get(type_id, True)
                logger.debug("Plugin type {} enabled: {}", type_id, type_enabled)
                if not type_enabled:
                    logger.debug(
                        "Skipping plugin {} - plugin type {} is disabled",
                        plugin.plugin_id,
                        type_id,
                    )
                    continue

                if type_id not in plugins_by_type:
                    plugins_by_type[type_id] = []
                plugins_by_type[type_id].append(plugin)
                logger.debug("Added plugin {} to plugins_by_type[{}]", plugin.plugin_id, type_id)
            else:
                logger.warning("Plugin {} has no type_id in plugin_type_map!", plugin.plugin_id)

        # Sort plugin types by display_order
        sorted_type_ids = sorted(
            plugins_by_type.keys(),
            key=lambda tid: (plugin_type_order_map.get(tid, 0), tid),
        )

        # Fetch images from plugins in order, grouping by plugin
        images_by_plugin: list[tuple[str, list[dict[str, Any]]]] = []
        for type_id in sorted_type_ids:
            type_plugins = plugins_by_type[type_id]
            # Sort instances within this plugin type by display_order
            type_plugins.sort(key=lambda p: (plugin_order_map.get(p.plugin_id, 0), p.plugin_id))

            for plugin in type_plugins:
                try:
                    logger.debug("Getting images from plugin {}", plugin.plugin_id)
                    if hasattr(plugin, "image_dir"):
                        logger.debug("Plugin {} image_dir: {}", plugin.plugin_id, plugin.image_dir)
                    logger.debug("Calling plugin.get_images()...")
                    plugin_images = await plugin.get_images()
                    img_count = len(plugin_images) if plugin_images else 0
                    logger.debug("Plugin {} returned {} images", plugin.plugin_id, img_count)
                    if plugin_images:
                        img_count = len(plugin_images)
                        logger.debug("Adding {} images from plugin {}", img_count, plugin.plugin_id)
                        images_by_plugin.append((plugin.plugin_id, plugin_images))
                    else:
                        logger.debug("Plugin {} returned no images - skipping", plugin.plugin_id)
                except Exception:
                    logger.exception("Error fetching images from plugin {}", plugin.plugin_id)

        # Combine images, respecting plugin order
        images = []
        for plugin_id, plugin_images in images_by_plugin:
            # Apply per-plugin randomization if requested
            if randomize_per_plugin and plugin_images:
                randomized_plugin_images = plugin_images.copy()
                random.shuffle(randomized_plugin_images)
                images.extend(randomized_plugin_images)
            else:
                images.extend(plugin_images)

        # Store original order
        self._all_images = images.copy()
        self._images_cache_time = datetime.now()
        logger.info("Total images collected: {}", len(images))

        # Apply global randomization if requested (overrides per-plugin randomization)
        if randomize and images:
            randomized = images.copy()
            random.shuffle(randomized)
            self._randomized_order = randomized
            logger.debug("Returning {} randomized images", len(randomized))
            return randomized

        # Store original order as randomized order when not randomizing
        self._randomized_order = images.copy()
        logger.debug("Returning {} images (not randomized)", len(images))
        return images

    async def get_current_image(self, randomize: bool = False) -> dict[str, Any] | None:
        """
        Get current image metadata.

        Args:
            randomize: Whether to use randomized order

        Returns:
            Current image metadata or None if no images
        """
        # Get images (with randomization if requested), only refresh if cache is stale
        if not self._all_images or self._is_cache_stale():
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
        # Only refresh images if cache is stale (not on every navigation)
        if not self._all_images or self._is_cache_stale():
            await self.get_images(randomize=randomize)
        elif randomize and not self._randomized_order:
            # Need randomized order but don't have it
            await self.get_images(randomize=True)

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
        # Only refresh images if cache is stale (not on every navigation)
        if not self._all_images or self._is_cache_stale():
            await self.get_images(randomize=randomize)
        elif randomize and not self._randomized_order:
            # Need randomized order but don't have it
            await self.get_images(randomize=True)

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
        # Only refresh if cache is stale or empty
        if not self._all_images or self._is_cache_stale():
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
                logger.error(f"Error getting image {image_id} from plugin {plugin.plugin_id}: {e}")

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
                logger.error(
                    f"Error getting image data {image_id} from plugin {plugin.plugin_id}: {e}"
                )

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
                    # Invalidate cache and refresh images list
                    self.invalidate_cache()
                    await self.get_images()
                    # Note: image_uploaded event is emitted by LocalImagePlugin.scan_images()
                    # when it detects the new image, so we don't need to emit it here
                    return result
            except Exception as e:
                logger.error(f"Error uploading image to plugin {plugin.plugin_id}: {e}")

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
                        # Invalidate cache and refresh images list
                        self.invalidate_cache()
                        await self.get_images()
                        # Clear current image if it was deleted
                        if self._current_image_id == image_id:
                            self._current_image_id = None
                            self._current_plugin_id = None
                        # Emit image_deleted event (fire-and-forget)
                        await event_system.emit_event(
                            "image_deleted",
                            {
                                "image_id": image_id,
                                "filename": img.get("filename"),
                                "plugin_id": plugin.plugin_id,
                            },
                            wait_for_handlers=False,
                        )
                        return True
            except Exception as e:
                logger.error(f"Error deleting image {image_id} from plugin {plugin.plugin_id}: {e}")

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
                logger.error(f"Error scanning images from plugin {plugin.plugin_id}: {e}")

        # Update cached list
        self._all_images = images
        self._images_cache_time = datetime.now()

        return images

    def _is_cache_stale(self) -> bool:
        """
        Check if the images cache is stale.

        Returns:
            True if cache is stale or doesn't exist, False otherwise
        """
        if self._images_cache_time is None:
            return True

        age = datetime.now() - self._images_cache_time
        return age > self._images_cache_ttl

    def invalidate_cache(self) -> None:
        """Invalidate the images cache to force refresh on next call."""
        self._images_cache_time = None
        self._all_images = []
        self._randomized_order = []
