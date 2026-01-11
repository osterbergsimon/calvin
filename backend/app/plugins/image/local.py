"""Local filesystem image plugin."""

import hashlib
from pathlib import Path
from typing import Any

from loguru import logger
from PIL import Image, ImageOps

from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import ImagePlugin

# Loguru automatically includes module/function info in logs


class LocalImagePlugin(ImagePlugin):
    """Local filesystem image plugin."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "local",
            "plugin_type": PluginType.IMAGE,
            "name": "Local Images",
            "description": (
                "Upload and store images on the server. " "Images are stored in ./data/images"
            ),
            "version": "1.0.0",
            "common_config_schema": {},
            "instance_config_schema": {},  # No configuration needed - uses hardcoded directory
            "supports_multiple_instances": False,  # Single-instance plugin
            "ui_sections": [
                {
                    "id": "upload",
                    "type": "upload",
                    "title": "Upload Images",
                    "accept": "image/*",
                    "multiple": True,
                    "help_text": "Select one or more image files to upload (JPG, PNG, WebP, GIF)",
                },
                {
                    "id": "manage",
                    "type": "manage_images",
                    "title": "Manage Images",
                    "collapsible": True,
                },
            ],
            "plugin_class": cls,
        }

    def __init__(
        self,
        plugin_id: str,
        name: str,
        image_dir: Path | str,
        thumbnail_dir: Path | str | None = None,
        enabled: bool = True,
    ):
        """
        Initialize local image plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            image_dir: Directory containing images
            thumbnail_dir: Directory for storing thumbnails (defaults to image_dir/thumbnails)
            enabled: Whether the plugin is enabled
        """
        super().__init__(plugin_id, name, enabled)
        self.image_dir = Path(image_dir)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnail_dir = Path(thumbnail_dir) if thumbnail_dir else self.image_dir / "thumbnails"
        self.thumbnail_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnail_size = (200, 200)
        self.supported_formats = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        self._images: list[dict[str, Any]] = []

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Scan images on initialization
        await self.scan_images()

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        # Nothing to cleanup for local filesystem
        pass

    async def configure(self, config: dict[str, Any]) -> None:
        """
        Configure the plugin with new settings.

        Args:
            config: Configuration dictionary
        """
        await super().configure(config)

        if "image_dir" in config and config["image_dir"]:
            # Extract actual value from config (handle schema objects)
            image_dir_value = config["image_dir"]
            # If it's a dict (schema object), extract the value or default
            if isinstance(image_dir_value, dict):
                image_dir_str = image_dir_value.get("value") or image_dir_value.get("default") or ""
            else:
                image_dir_str = str(image_dir_value)

            # Only update if we have a valid string value
            if image_dir_str and image_dir_str.strip():
                self.image_dir = Path(image_dir_str)
                self.image_dir.mkdir(parents=True, exist_ok=True)
                # Always set thumbnail_dir to image_dir/thumbnails
                self.thumbnail_dir = self.image_dir / "thumbnails"
                self.thumbnail_dir.mkdir(parents=True, exist_ok=True)

    async def get_images(self) -> list[dict[str, Any]]:
        """
        Get list of all available images.

        Returns:
            List of image metadata dictionaries
        """
        logger.debug("get_images() called for plugin {}", self.plugin_id)
        logger.debug("image_dir: {}", self.image_dir)
        cache_size = len(self._images) if self._images else 0
        logger.debug("_images cache before scan: {} images", cache_size)
        await self.scan_images()
        cache_size_after = len(self._images) if self._images else 0
        logger.debug("_images cache after scan: {} images", cache_size_after)
        result = self._images.copy()
        logger.debug("Returning {} images", len(result))
        return result

    async def get_image(self, image_id: str) -> dict[str, Any] | None:
        """
        Get image metadata by ID.

        Args:
            image_id: Image identifier

        Returns:
            Image metadata dictionary or None if not found
        """
        await self.scan_images()
        for img in self._images:
            if img["id"] == image_id:
                return img.copy()
        return None

    async def get_image_data(self, image_id: str) -> bytes | None:
        """
        Get image file data by ID.

        Args:
            image_id: Image identifier

        Returns:
            Image file data as bytes or None if not found
        """
        img = await self.get_image(image_id)
        if not img:
            return None

        try:
            with open(img["path"], "rb") as f:
                return f.read()
        except Exception:
            logger.exception("Error reading image file {}", img["path"])
            return None

    async def scan_images(self) -> list[dict[str, Any]]:
        """
        Scan for new/updated images.

        Returns:
            List of image metadata dictionaries
        """
        import logging

        logger = logging.getLogger(__name__)

        logger.debug(f"[Local Images] scan_images() called for plugin {self.plugin_id}")
        logger.debug(f"[Local Images] image_dir: {self.image_dir}")
        logger.debug(f"[Local Images] image_dir exists: {self.image_dir.exists()}")

        # Track existing image IDs to detect new images
        existing_image_ids = {img["id"] for img in self._images} if self._images else set()

        images = []
        if not self.image_dir.exists():
            logger.warning(f"[Local Images] image_dir does not exist: {self.image_dir}")
            self._images = []
            return []

        all_files = list(self.image_dir.iterdir())
        logger.debug(f"[Local Images] Found {len(all_files)} files/dirs in image_dir")

        for file_path in sorted(self.image_dir.iterdir()):
            if file_path.is_file() and file_path.suffix.lower() in self.supported_formats:
                try:
                    logger.debug(f"[Local Images] Processing image file: {file_path.name}")
                    # Get image metadata
                    with Image.open(file_path) as img:
                        width, height = img.size
                        file_size = file_path.stat().st_size

                        # Generate image ID from file path hash
                        image_id = hashlib.md5(str(file_path).encode()).hexdigest()

                        # Generate thumbnail if it doesn't exist
                        thumbnail_path = self._get_thumbnail_path(image_id)
                        if not thumbnail_path.exists():
                            self._generate_thumbnail(file_path, thumbnail_path)

                        image_metadata = {
                            "id": image_id,
                            "filename": file_path.name,
                            "path": str(file_path),
                            "width": width,
                            "height": height,
                            "size": file_size,
                            "format": file_path.suffix.lower(),
                            "source": self.plugin_id,  # Mark which plugin provided this
                        }
                        images.append(image_metadata)

                        # Emit image_uploaded event for new images (detected by scan)
                        # This works for images added by any source (IMAP, manual upload, etc.)
                        if image_id not in existing_image_ids:
                            try:
                                await self.emit_event(
                                    "image_uploaded",
                                    {
                                        "image_id": image_id,
                                        "filename": file_path.name,
                                        "path": str(file_path),
                                        "plugin_id": self.plugin_id,
                                    },
                                    wait_for_handlers=False,  # Fire-and-forget
                                )
                                logger.debug(
                                    f"[Local Images] Emitted image_uploaded event for new image: "
                                    f"{file_path.name}"
                                )
                            except Exception as e:
                                # Don't fail scan if event emission fails
                                logger.warning(
                                    f"[Local Images] Failed to emit image_uploaded event for "
                                    f"{file_path.name}: {e}"
                                )

                        logger.debug(
                            f"[Local Images] Added image: {file_path.name} (id: {image_id})"
                        )
                except Exception as e:
                    logger.warning(f"[Local Images] Error reading image {file_path}: {e}")
                    continue
            else:
                is_file = file_path.is_file()
                suffix = file_path.suffix.lower()
                logger.debug(
                    f"[Local Images] Skipping {file_path.name} "
                    f"(is_file: {is_file}, suffix: {suffix})"
                )

        logger.debug(f"[Local Images] scan_images() found {len(images)} images total")
        self._images = images
        return images

    async def upload_image(self, file_data: bytes, filename: str) -> dict[str, Any] | None:
        """
        Upload an image to the local filesystem.

        Args:
            file_data: Image file data as bytes
            filename: Original filename

        Returns:
            Image metadata dictionary or None if upload failed
        """
        try:
            # Ensure image directory exists
            self.image_dir.mkdir(parents=True, exist_ok=True)
            # Save file to image directory
            file_path = self.image_dir / filename
            with open(file_path, "wb") as f:
                f.write(file_data)

            # Rescan to include new image
            await self.scan_images()

            # Return the new image
            image_id = hashlib.md5(str(file_path).encode()).hexdigest()
            return await self.get_image(image_id)
        except Exception:
            logger.exception("Error uploading image {}", filename)
            return None

    async def delete_image(self, image_id: str) -> bool:
        """
        Delete an image from the local filesystem.

        Args:
            image_id: Image identifier

        Returns:
            True if deleted, False if not found or deletion failed
        """
        img = await self.get_image(image_id)
        if not img:
            return False

        try:
            # Delete image file
            file_path = Path(img["path"])
            if file_path.exists():
                file_path.unlink()

            # Delete thumbnail if it exists
            thumbnail_path = self._get_thumbnail_path(image_id)
            if thumbnail_path.exists():
                thumbnail_path.unlink()

            # Rescan to update list
            await self.scan_images()
            return True
        except Exception:
            logger.exception("Error deleting image {}", image_id)
            return False

    def _get_thumbnail_path(self, image_id: str) -> Path:
        """Get thumbnail path for an image ID."""
        return self.thumbnail_dir / f"{image_id}.jpg"

    def _generate_thumbnail(self, image_path: Path, thumbnail_path: Path) -> None:
        """Generate a thumbnail for an image."""
        try:
            # Ensure thumbnail directory exists
            self.thumbnail_dir.mkdir(parents=True, exist_ok=True)

            with Image.open(image_path) as img:
                # Handle EXIF orientation
                img = ImageOps.exif_transpose(img)

                # Create thumbnail maintaining aspect ratio
                img.thumbnail(self.thumbnail_size, Image.Resampling.LANCZOS)

                # Convert to RGB if necessary (for JPEG)
                if img.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(
                        img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None
                    )
                    img = background
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # Save thumbnail as JPEG
                img.save(thumbnail_path, "JPEG", quality=85, optimize=True)
        except Exception:
            logger.exception("Error generating thumbnail for {}", image_path)

    def get_thumbnail_path(self, image_id: str) -> Path | None:
        """Get thumbnail path for an image by ID."""
        thumbnail_path = self._get_thumbnail_path(image_id)
        if thumbnail_path.exists():
            return thumbnail_path
        return None


# Register this plugin with pluggy
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register LocalImagePlugin type."""
    return [LocalImagePlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> LocalImagePlugin | None:
    """Create a LocalImagePlugin instance."""
    if type_id != "local":
        return None

    from pathlib import Path

    enabled = config.get("enabled", False)  # Default to disabled

    # Use IMAGE_DIR environment variable if set, otherwise use hardcoded directory
    # Images are stored in ./data/images (relative to current working directory)
    # Resolve to absolute path for reliability
    import os

    image_dir_str = os.getenv("IMAGE_DIR")
    if image_dir_str:
        image_dir = Path(image_dir_str).resolve()
    else:
        image_dir = Path("./data/images").resolve()

    # Thumbnail directory is always image_dir/thumbnails
    # We pass None and let the plugin set it automatically
    return LocalImagePlugin(
        plugin_id=plugin_id,
        name=name,
        image_dir=image_dir,
        thumbnail_dir=None,  # Will be set to image_dir/thumbnails automatically
        enabled=enabled,
    )


@hookimpl
async def handle_plugin_config_update(
    type_id: str,
    config: dict[str, Any],
    enabled: bool | None,
    db_type: Any,
    session: Any,
) -> dict[str, Any] | None:
    """Handle Local Images plugin configuration update and instance management."""
    if type_id != "local":
        return None

    import logging

    from sqlalchemy import select

    from app.models.db_models import PluginDB
    from app.plugins.manager import plugin_manager
    from app.plugins.registry import plugin_registry

    logger = logging.getLogger(__name__)

    # Local Images plugin is single-instance - always use fixed instance ID
    # Always create/update the single instance when plugin type is enabled
    plugin_instance_id = "local-images"

    # Check if Local Images instance exists
    # Note: session is async, but we're in an async function, so we can await
    # However, the hook signature might pass a sync session, so we need to handle both
    try:
        # Try async first
        result = await session.execute(select(PluginDB).where(PluginDB.type_id == "local"))
        local_instance = result.scalar_one_or_none()
    except TypeError:
        # Fallback to sync if session is not async
        result = session.execute(select(PluginDB).where(PluginDB.type_id == "local"))
        local_instance = result.scalar_one_or_none()

    if not local_instance:
        # Create new Local Images instance with hardcoded config
        logger.info(f"[Local Images] Creating single instance: {plugin_instance_id}")
        try:
            instance_enabled = (
                enabled if enabled is not None else (db_type.enabled if db_type else True)
            )
            # Check if plugin is already registered in plugin_manager
            existing_plugin = plugin_manager.get_plugin(plugin_instance_id)
            if existing_plugin:
                # Plugin already exists, just ensure it's enabled
                logger.info(
                    f"[Local Images] Plugin {plugin_instance_id} already registered, "
                    f"ensuring it's enabled"
                )
                if instance_enabled and not existing_plugin.enabled:
                    existing_plugin.enable()
                elif not instance_enabled and existing_plugin.enabled:
                    existing_plugin.disable()
                return {
                    "instance_created": False,
                    "instance_id": plugin_instance_id,
                    "already_exists": True,
                }
            # No config needed - uses hardcoded directory
            plugin = await plugin_registry.register_plugin(
                plugin_id=plugin_instance_id,
                type_id="local",
                name="Local Images",
                config={},  # Empty config - uses hardcoded directory
                enabled=instance_enabled,
            )
            return {
                "instance_created": True,
                "instance_id": plugin_instance_id,
            }
        except ValueError as e:
            # Plugin already registered - this is okay, just ensure it's enabled
            if "already registered" in str(e):
                logger.info(
                    f"[Local Images] Plugin {plugin_instance_id} already registered, "
                    f"ensuring it's enabled"
                )
                existing_plugin = plugin_manager.get_plugin(plugin_instance_id)
                if existing_plugin:
                    instance_enabled = (
                        enabled if enabled is not None else (db_type.enabled if db_type else True)
                    )
                    if instance_enabled and not existing_plugin.enabled:
                        existing_plugin.enable()
                    elif not instance_enabled and existing_plugin.enabled:
                        existing_plugin.disable()
                return {
                    "instance_created": False,
                    "instance_id": plugin_instance_id,
                    "already_exists": True,
                }
            raise
        except Exception as e:
            logger.error(f"[Local Images] Failed to create instance: {e}", exc_info=True)
            return {"instance_created": False, "error": str(e)}
    else:
        # Ensure we're using the correct instance ID (single-instance plugin)
        if local_instance.id != plugin_instance_id:
            # If there's an instance with a different ID, delete it and create the correct one
            logger.warning(
                f"[Local Images] Found instance with wrong ID ({local_instance.id}), "
                f"recreating with correct ID ({plugin_instance_id})"
            )
            session.delete(local_instance)
            # Don't commit here - the route will commit after all hooks complete
            # Committing here causes rollback issues
            # Create the correct instance
            instance_enabled = (
                enabled if enabled is not None else (db_type.enabled if db_type else True)
            )
            try:
                plugin = await plugin_registry.register_plugin(
                    plugin_id=plugin_instance_id,
                    type_id="local",
                    name="Local Images",
                    config={},
                    enabled=instance_enabled,
                )
                return {
                    "instance_created": True,
                    "instance_id": plugin_instance_id,
                }
            except ValueError as e:
                # Plugin already registered - this is okay
                if "already registered" in str(e):
                    existing_plugin = plugin_manager.get_plugin(plugin_instance_id)
                    if existing_plugin:
                        if instance_enabled and not existing_plugin.enabled:
                            existing_plugin.enable()
                        elif not instance_enabled and existing_plugin.enabled:
                            existing_plugin.disable()
                    return {
                        "instance_created": False,
                        "instance_id": plugin_instance_id,
                        "already_exists": True,
                    }
                raise
        # Update existing Local Images instance
        logger.info(f"[Local Images] Updating existing instance: {local_instance.id}")
        instance_enabled = (
            enabled if enabled is not None else (db_type.enabled if db_type else True)
        )

        # Update database - but don't commit yet, we'll commit at the end
        if local_instance.enabled != instance_enabled:
            local_instance.enabled = instance_enabled

        # Update plugin in memory
        plugin = plugin_manager.get_plugin(local_instance.id)
        if plugin:
            # Check if IMAGE_DIR environment variable has changed
            import os

            current_image_dir = os.getenv("IMAGE_DIR")
            if current_image_dir:
                new_image_dir = Path(current_image_dir).resolve()
                if plugin.image_dir.resolve() != new_image_dir:
                    logger.info(
                        f"[Local Images] IMAGE_DIR changed from {plugin.image_dir} "
                        f"to {new_image_dir}, updating plugin"
                    )
                    plugin.image_dir = new_image_dir
                    plugin.image_dir.mkdir(parents=True, exist_ok=True)
                    plugin.thumbnail_dir = plugin.image_dir / "thumbnails"
                    plugin.thumbnail_dir.mkdir(parents=True, exist_ok=True)

            # No config to update - uses hardcoded directory
            if instance_enabled:
                plugin.enable()
                if not plugin.is_running():
                    try:
                        await plugin.initialize()
                        plugin.start()
                    except Exception as e:
                        logger.error(f"[Local Images] Error starting plugin: {e}", exc_info=True)
                else:
                    # Plugin is already running, but re-scan for new images
                    # Also ensure image_dir is correct (in case IMAGE_DIR changed)
                    import os

                    current_image_dir = os.getenv("IMAGE_DIR")
                    if current_image_dir:
                        new_image_dir = Path(current_image_dir).resolve()
                        if plugin.image_dir.resolve() != new_image_dir:
                            logger.info(
                                f"[Local Images] Updating image_dir from {plugin.image_dir} "
                                f"to {new_image_dir}"
                            )
                            plugin.image_dir = new_image_dir
                            plugin.image_dir.mkdir(parents=True, exist_ok=True)
                            plugin.thumbnail_dir = plugin.image_dir / "thumbnails"
                            plugin.thumbnail_dir.mkdir(parents=True, exist_ok=True)
                    try:
                        await plugin.scan_images()
                    except Exception as e:
                        logger.warning(
                            f"[Local Images] Error re-scanning images: {e}", exc_info=True
                        )
            else:
                plugin.disable()
                if plugin.is_running():
                    try:
                        plugin.stop()
                        await plugin.cleanup()
                    except Exception as e:
                        logger.warning(f"[Local Images] Error stopping plugin: {e}", exc_info=True)

            # Update in database - keep config empty
            local_instance.config = {}  # No config needed
            local_instance.enabled = instance_enabled
            # IMPORTANT: Don't commit here - the route will commit after all hooks complete
            # Committing here causes rollback issues. The route handles all commits to ensure
            # db_type.enabled and instance.enabled are both persisted correctly.

            return {
                "instance_updated": True,
                "instance_id": local_instance.id,
            }
        else:
            logger.warning(
                f"[Local Images] Plugin instance {local_instance.id} not found in manager"
            )
            return {"instance_updated": False, "error": "Plugin instance not found"}


# Auto-register this module with pluggy when imported
# The loader will discover and register this module automatically
