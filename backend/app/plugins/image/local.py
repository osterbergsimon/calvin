"""Local filesystem image plugin."""

import hashlib
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps

from app.plugins.protocols import ImagePlugin


class LocalImagePlugin(ImagePlugin):
    """Local filesystem image plugin."""

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
        
        if "thumbnail_dir" in config and config["thumbnail_dir"]:
            # Extract actual value from config (handle schema objects)
            thumbnail_dir_value = config["thumbnail_dir"]
            # If it's a dict (schema object), extract the value or default
            if isinstance(thumbnail_dir_value, dict):
                thumbnail_dir_str = thumbnail_dir_value.get("value") or thumbnail_dir_value.get("default") or ""
            else:
                thumbnail_dir_str = str(thumbnail_dir_value)
            
            # Only update if we have a valid string value
            if thumbnail_dir_str and thumbnail_dir_str.strip():
                self.thumbnail_dir = Path(thumbnail_dir_str)
                self.thumbnail_dir.mkdir(parents=True, exist_ok=True)
        elif "image_dir" in config and config["image_dir"]:
            # If thumbnail_dir not provided but image_dir is, use default
            # Only if image_dir was successfully updated
            if hasattr(self, 'image_dir') and self.image_dir:
                self.thumbnail_dir = self.image_dir / "thumbnails"
                self.thumbnail_dir.mkdir(parents=True, exist_ok=True)

    async def get_images(self) -> list[dict[str, Any]]:
        """
        Get list of all available images.

        Returns:
            List of image metadata dictionaries
        """
        await self.scan_images()
        return self._images.copy()

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
        except Exception as e:
            print(f"Error reading image file {img['path']}: {e}")
            return None

    async def scan_images(self) -> list[dict[str, Any]]:
        """
        Scan for new/updated images.

        Returns:
            List of image metadata dictionaries
        """
        images = []
        if not self.image_dir.exists():
            self._images = []
            return []

        for file_path in sorted(self.image_dir.iterdir()):
            if file_path.is_file() and file_path.suffix.lower() in self.supported_formats:
                try:
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

                        images.append(
                            {
                                "id": image_id,
                                "filename": file_path.name,
                                "path": str(file_path),
                                "width": width,
                                "height": height,
                                "size": file_size,
                                "format": file_path.suffix.lower(),
                                "source": self.plugin_id,  # Mark which plugin provided this
                            }
                        )
                except Exception as e:
                    print(f"Error reading image {file_path}: {e}")
                    continue

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
            # Save file to image directory
            file_path = self.image_dir / filename
            with open(file_path, "wb") as f:
                f.write(file_data)

            # Rescan to include new image
            await self.scan_images()

            # Return the new image
            image_id = hashlib.md5(str(file_path).encode()).hexdigest()
            return await self.get_image(image_id)
        except Exception as e:
            print(f"Error uploading image {filename}: {e}")
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
        except Exception as e:
            print(f"Error deleting image {image_id}: {e}")
            return False

    def _get_thumbnail_path(self, image_id: str) -> Path:
        """Get thumbnail path for an image ID."""
        return self.thumbnail_dir / f"{image_id}.jpg"

    def _generate_thumbnail(self, image_path: Path, thumbnail_path: Path) -> None:
        """Generate a thumbnail for an image."""
        try:
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
                    background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
                    img = background
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # Save thumbnail as JPEG
                img.save(thumbnail_path, "JPEG", quality=85, optimize=True)
        except Exception as e:
            print(f"Error generating thumbnail for {image_path}: {e}")

    def get_thumbnail_path(self, image_id: str) -> Path | None:
        """Get thumbnail path for an image by ID."""
        thumbnail_path = self._get_thumbnail_path(image_id)
        if thumbnail_path.exists():
            return thumbnail_path
        return None

