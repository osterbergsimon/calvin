"""Image service for managing photo slideshow."""

import hashlib
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps


class ImageService:
    """Service for managing images for slideshow."""

    def __init__(self, image_dir: Path, thumbnail_dir: Path | None = None):
        """
        Initialize image service.

        Args:
            image_dir: Directory containing images
            thumbnail_dir: Directory for storing thumbnails (defaults to image_dir/thumbnails)
        """
        self.image_dir = Path(image_dir)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnail_dir = Path(thumbnail_dir) if thumbnail_dir else self.image_dir / "thumbnails"
        self.thumbnail_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnail_size = (200, 200)  # Thumbnail size in pixels
        self.supported_formats = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        self._images: list[dict] = []
        self._current_index = 0
        self._last_scan: datetime | None = None
        self._scan_interval = 60  # Rescan every 60 seconds

    def scan_images(self) -> list[dict]:
        """
        Scan image directory for images.

        Returns:
            List of image metadata dictionaries
        """
        now = datetime.now()
        # Only rescan if enough time has passed
        if self._last_scan and (now - self._last_scan).total_seconds() < self._scan_interval:
            return self._images

        images = []
        if not self.image_dir.exists():
            self._images = []
            self._last_scan = now
            return []

        for file_path in sorted(self.image_dir.iterdir()):
            if file_path.is_file() and file_path.suffix.lower() in self.supported_formats:
                try:
                    # Get image metadata
                    with Image.open(file_path) as img:
                        width, height = img.size
                        # Get file size
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
                            }
                        )
                except Exception as e:
                    print(f"Error reading image {file_path}: {e}")
                    continue

        self._images = images
        self._last_scan = now
        return images

    def get_images(self) -> list[dict]:
        """
        Get list of all images.

        Returns:
            List of image metadata dictionaries
        """
        return self.scan_images()

    def get_current_image(self) -> dict | None:
        """
        Get current image metadata.

        Returns:
            Current image metadata or None if no images
        """
        if not self._images:
            self.scan_images()

        if not self._images:
            return None

        # Ensure index is valid
        if self._current_index >= len(self._images):
            self._current_index = 0

        return self._images[self._current_index]

    def next_image(self) -> dict | None:
        """
        Move to next image and return it.

        Returns:
            Next image metadata or None if no images
        """
        if not self._images:
            self.scan_images()

        if not self._images:
            return None

        self._current_index = (self._current_index + 1) % len(self._images)
        return self._images[self._current_index]

    def previous_image(self) -> dict | None:
        """
        Move to previous image and return it.

        Returns:
            Previous image metadata or None if no images
        """
        if not self._images:
            self.scan_images()

        if not self._images:
            return None

        self._current_index = (self._current_index - 1) % len(self._images)
        return self._images[self._current_index]

    def set_current_index(self, index: int) -> bool:
        """
        Set current image index.

        Args:
            index: Image index to set

        Returns:
            True if successful, False if index invalid
        """
        if not self._images:
            self.scan_images()

        if not self._images or index < 0 or index >= len(self._images):
            return False

        self._current_index = index
        return True

    def get_image_by_id(self, image_id: str) -> dict | None:
        """
        Get image by ID.

        Args:
            image_id: Image ID

        Returns:
            Image metadata or None if not found
        """
        if not self._images:
            self.scan_images()

        for img in self._images:
            if img["id"] == image_id:
                return img

        return None

    def _get_thumbnail_path(self, image_id: str) -> Path:
        """
        Get thumbnail path for an image ID.

        Args:
            image_id: Image ID

        Returns:
            Path to thumbnail file
        """
        return self.thumbnail_dir / f"{image_id}.jpg"

    def _generate_thumbnail(self, image_path: Path, thumbnail_path: Path) -> None:
        """
        Generate a thumbnail for an image.

        Args:
            image_path: Path to source image
            thumbnail_path: Path to save thumbnail
        """
        try:
            with Image.open(image_path) as img:
                # Handle EXIF orientation
                img = ImageOps.exif_transpose(img)
                
                # Create thumbnail maintaining aspect ratio
                img.thumbnail(self.thumbnail_size, Image.Resampling.LANCZOS)
                
                # Convert to RGB if necessary (for JPEG)
                if img.mode in ("RGBA", "LA", "P"):
                    # Create white background
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
        """
        Get thumbnail path for an image by ID.

        Args:
            image_id: Image ID

        Returns:
            Path to thumbnail file or None if not found
        """
        thumbnail_path = self._get_thumbnail_path(image_id)
        if thumbnail_path.exists():
            return thumbnail_path
        return None

    def get_config(self) -> dict:
        """
        Get image service configuration.

        Returns:
            Configuration dictionary
        """
        return {
            "image_dir": str(self.image_dir),
            "thumbnail_dir": str(self.thumbnail_dir),
            "total_images": len(self._images),
            "current_index": self._current_index,
            "supported_formats": list(self.supported_formats),
        }


# Global image service instance (will be initialized in main.py)
image_service: ImageService | None = None
