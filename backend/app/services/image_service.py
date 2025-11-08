"""Image service for managing photo slideshow."""

import os
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime
from PIL import Image
import hashlib


class ImageService:
    """Service for managing images for slideshow."""

    def __init__(self, image_dir: Path):
        """
        Initialize image service.

        Args:
            image_dir: Directory containing images
        """
        self.image_dir = Path(image_dir)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.supported_formats = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
        self._images: List[Dict] = []
        self._current_index = 0
        self._last_scan: Optional[datetime] = None
        self._scan_interval = 60  # Rescan every 60 seconds

    def scan_images(self) -> List[Dict]:
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
                        
                        images.append({
                            'id': image_id,
                            'filename': file_path.name,
                            'path': str(file_path),
                            'width': width,
                            'height': height,
                            'size': file_size,
                            'format': file_path.suffix.lower(),
                        })
                except Exception as e:
                    print(f"Error reading image {file_path}: {e}")
                    continue

        self._images = images
        self._last_scan = now
        return images

    def get_images(self) -> List[Dict]:
        """
        Get list of all images.

        Returns:
            List of image metadata dictionaries
        """
        return self.scan_images()

    def get_current_image(self) -> Optional[Dict]:
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

    def next_image(self) -> Optional[Dict]:
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

    def previous_image(self) -> Optional[Dict]:
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

    def get_image_by_id(self, image_id: str) -> Optional[Dict]:
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
            if img['id'] == image_id:
                return img
        
        return None

    def get_config(self) -> Dict:
        """
        Get image service configuration.

        Returns:
            Configuration dictionary
        """
        return {
            'image_dir': str(self.image_dir),
            'total_images': len(self._images),
            'current_index': self._current_index,
            'supported_formats': list(self.supported_formats),
        }


# Global image service instance (will be initialized in main.py)
image_service: Optional[ImageService] = None

