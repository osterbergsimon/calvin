"""Unit tests for image service."""

import pytest
from pathlib import Path
from PIL import Image

from app.services.image_service import ImageService


def create_test_image(path: Path, width: int = 100, height: int = 100):
    """Create a valid test image file."""
    img = Image.new('RGB', (width, height), color='red')
    img.save(path, 'JPEG')


@pytest.mark.unit
def test_image_service_initialization(temp_image_dir: Path):
    """Test initializing image service with a directory."""
    service = ImageService(str(temp_image_dir))
    # image_dir is stored as Path, compare Path objects
    assert service.image_dir == Path(temp_image_dir)
    assert len(service.get_images()) == 0


@pytest.mark.unit
def test_scan_images_empty_directory(temp_image_dir: Path):
    """Test scanning an empty directory."""
    service = ImageService(str(temp_image_dir))
    service.scan_images()
    
    assert len(service.get_images()) == 0


@pytest.mark.unit
def test_scan_images_with_files(temp_image_dir: Path):
    """Test scanning a directory with image files."""
    # Create a valid test image file
    test_image = temp_image_dir / "test.jpg"
    create_test_image(test_image)
    
    service = ImageService(str(temp_image_dir))
    service.scan_images()
    
    # Should find the image
    images = service.get_images()
    assert len(images) == 1
    assert images[0]["filename"] == "test.jpg"


@pytest.mark.unit
def test_get_images(temp_image_dir: Path):
    """Test getting all images."""
    # Create valid test images
    create_test_image(temp_image_dir / "test1.jpg")
    create_test_image(temp_image_dir / "test2.jpg")
    
    service = ImageService(str(temp_image_dir))
    service.scan_images()
    
    images = service.get_images()
    assert len(images) == 2
    assert all("id" in img for img in images)
    assert all("filename" in img for img in images)


@pytest.mark.unit
def test_get_current_image(temp_image_dir: Path):
    """Test getting the current image."""
    create_test_image(temp_image_dir / "test.jpg")
    
    service = ImageService(str(temp_image_dir))
    service.scan_images()
    
    current = service.get_current_image()
    assert current is not None
    assert "id" in current
    assert "filename" in current


@pytest.mark.unit
def test_next_image(temp_image_dir: Path):
    """Test navigating to the next image."""
    create_test_image(temp_image_dir / "test1.jpg")
    create_test_image(temp_image_dir / "test2.jpg")
    
    service = ImageService(str(temp_image_dir))
    service.scan_images()
    
    first_image = service.get_current_image()
    service.next_image()
    second_image = service.get_current_image()
    
    assert first_image["id"] != second_image["id"]


@pytest.mark.unit
def test_previous_image(temp_image_dir: Path):
    """Test navigating to the previous image."""
    create_test_image(temp_image_dir / "test1.jpg")
    create_test_image(temp_image_dir / "test2.jpg")
    
    service = ImageService(str(temp_image_dir))
    service.scan_images()
    
    first_image = service.get_current_image()
    service.next_image()
    service.previous_image()
    back_to_first = service.get_current_image()
    
    assert first_image["id"] == back_to_first["id"]


@pytest.mark.unit
def test_get_image_by_id(temp_image_dir: Path):
    """Test getting an image by ID."""
    create_test_image(temp_image_dir / "test.jpg")
    
    service = ImageService(str(temp_image_dir))
    service.scan_images()
    
    images = service.get_images()
    assert len(images) > 0
    image_id = images[0]["id"]
    
    found_image = service.get_image_by_id(image_id)
    assert found_image is not None
    assert found_image["id"] == image_id

