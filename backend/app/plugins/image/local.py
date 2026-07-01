"""Local filesystem image plugin."""

import hashlib
import os
from pathlib import Path
from typing import Any

from loguru import logger
from PIL import Image, ImageOps

from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ImagePlugin


def _default_image_dir() -> Path:
    """Resolve the image directory: IMAGE_DIR env var or ./data/images."""
    image_dir_str = os.getenv("IMAGE_DIR")
    if image_dir_str:
        return Path(image_dir_str).resolve()
    return Path("./data/images").resolve()


class LocalImagePlugin(ImagePlugin):
    """Local filesystem image plugin."""

    metadata = PluginMetadata(
        type_id="local",
        name="Local Images",
        description="Upload and store images on the server. Images are stored in ./data/images",
        default_instance_name="Local Images",
        supports_multiple_instances=False,
        fixed_instance_id="local-images",
        ui_sections=[
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
    )

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self.thumbnail_size = (200, 200)
        self.supported_formats = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        self._images: list[dict[str, Any]] = []
        self._set_image_dir(_default_image_dir())

    def _set_image_dir(self, image_dir: Path) -> None:
        """Point the plugin at an image directory, creating it and its thumbnails dir."""
        self.image_dir = Path(image_dir)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnail_dir = self.image_dir / "thumbnails"
        self.thumbnail_dir.mkdir(parents=True, exist_ok=True)

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Scan images on initialization
        await self.scan_images()

    async def configure(self, config: dict[str, Any]) -> None:
        """
        Configure the plugin with new settings.

        Args:
            config: Configuration dictionary
        """
        await super().configure(config)

        # IMAGE_DIR environment variable takes precedence when set
        current_image_dir = os.getenv("IMAGE_DIR")
        if current_image_dir:
            new_image_dir = Path(current_image_dir).resolve()
            if self.image_dir.resolve() != new_image_dir:
                logger.info(
                    f"[Local Images] IMAGE_DIR changed from {self.image_dir} "
                    f"to {new_image_dir}, updating plugin"
                )
                self._set_image_dir(new_image_dir)

        image_dir_str = str(self.config.get("image_dir") or "")
        if image_dir_str.strip():
            self._set_image_dir(Path(image_dir_str))

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
                        image_id = hashlib.md5(
                            str(file_path).encode(), usedforsecurity=False
                        ).hexdigest()

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
            image_id = hashlib.md5(str(file_path).encode(), usedforsecurity=False).hexdigest()
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
