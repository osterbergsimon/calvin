"""Test utilities for creating test data."""

from io import BytesIO
from pathlib import Path
from typing import Literal

from PIL import Image


def create_test_image(
    format: Literal["JPEG", "PNG", "WEBP"] = "JPEG",
    width: int = 100,
    height: int = 100,
    color: tuple[int, int, int] = (255, 0, 0),  # Red by default
) -> bytes:
    """
    Create a test image in memory.

    Args:
        format: Image format (JPEG, PNG, or WEBP)
        width: Image width in pixels
        height: Image height in pixels
        color: RGB color tuple (default: red)

    Returns:
        Image file data as bytes
    """
    # Create a simple colored image
    img = Image.new("RGB", (width, height), color=color)

    # Save to bytes
    buffer = BytesIO()
    img.save(buffer, format=format)
    buffer.seek(0)
    return buffer.getvalue()


def create_test_image_file(
    file_path: Path,
    format: Literal["JPEG", "PNG", "WEBP"] = "JPEG",
    width: int = 100,
    height: int = 100,
    color: tuple[int, int, int] = (255, 0, 0),
) -> Path:
    """
    Create a test image file on disk.

    Args:
        file_path: Path where to save the image
        format: Image format (JPEG, PNG, or WEBP)
        width: Image width in pixels
        height: Image height in pixels
        color: RGB color tuple (default: red)

    Returns:
        Path to the created image file
    """
    image_data = create_test_image(format=format, width=width, height=height, color=color)
    file_path.write_bytes(image_data)
    return file_path


def create_test_images_set(
    directory: Path,
    count: int = 3,
    formats: list[Literal["JPEG", "PNG", "WEBP"]] | None = None,
) -> list[Path]:
    """
    Create a set of test images in a directory.

    Args:
        directory: Directory where to create images
        count: Number of images to create
        formats: List of formats to use (defaults to [JPEG, PNG, WEBP])

    Returns:
        List of paths to created image files
    """
    if formats is None:
        formats = ["JPEG", "PNG", "WEBP"]

    directory.mkdir(parents=True, exist_ok=True)

    colors = [
        (255, 0, 0),  # Red
        (0, 255, 0),  # Green
        (0, 0, 255),  # Blue
        (255, 255, 0),  # Yellow
        (255, 0, 255),  # Magenta
        (0, 255, 255),  # Cyan
    ]

    created_files = []
    for i in range(count):
        format = formats[i % len(formats)]
        color = colors[i % len(colors)]
        filename = f"test_image_{i+1}.{format.lower()}"
        file_path = directory / filename
        create_test_image_file(
            file_path,
            format=format,
            width=200 + (i * 50),  # Varying sizes
            height=200 + (i * 50),
            color=color,
        )
        created_files.append(file_path)

    return created_files
