"""Image endpoints."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from app.services import image_service as image_service_module

router = APIRouter()


def get_image_service():
    """Get the global image service instance."""
    return image_service_module.image_service


@router.get("/images/list")
async def list_images():
    """
    Get list of all images.

    Returns:
        List of image metadata
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    images = image_service.get_images()
    return {"images": images, "total": len(images)}


@router.get("/images/current")
async def get_current_image():
    """
    Get current image metadata.

    Returns:
        Current image metadata
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    image = image_service.get_current_image()
    if not image:
        return {"image": None, "message": "No images available"}

    return {"image": image}


@router.get("/images/{image_id}")
async def get_image_file(image_id: str):
    """
    Get image file by ID.

    Args:
        image_id: Image ID

    Returns:
        Image file
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    image = image_service.get_image_by_id(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = Path(image["path"])
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    return FileResponse(
        image_path,
        media_type=f"image/{image['format'].lstrip('.')}",
        headers={
            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
        },
    )


@router.post("/images/next")
async def next_image():
    """
    Move to next image and return it.

    Returns:
        Next image metadata
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    image = image_service.next_image()
    if not image:
        return {"image": None, "message": "No images available"}

    return {"image": image}


@router.post("/images/previous")
async def previous_image():
    """
    Move to previous image and return it.

    Returns:
        Previous image metadata
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    image = image_service.previous_image()
    if not image:
        return {"image": None, "message": "No images available"}

    return {"image": image}


@router.get("/images/config")
async def get_image_config():
    """
    Get image service configuration.

    Returns:
        Configuration dictionary
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    config = image_service.get_config()
    return config


@router.post("/images/upload")
async def upload_image(file: UploadFile = File(...)):
    """
    Upload an image file.

    Args:
        file: Image file to upload

    Returns:
        Uploaded image metadata
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in image_service.supported_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Supported formats: {', '.join(image_service.supported_formats)}",
        )

    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {max_size / (1024 * 1024):.0f}MB",
        )

    # Save file to image directory
    try:
        # Generate unique filename if file already exists
        image_path = image_service.image_dir / file.filename
        counter = 1
        while image_path.exists():
            stem = Path(file.filename).stem
            image_path = image_service.image_dir / f"{stem}_{counter}{file_ext}"
            counter += 1

        # Write file
        with open(image_path, "wb") as f:
            f.write(file_content)

        # Force rescan to include new image
        image_service._last_scan = None
        images = image_service.scan_images()

        # Find the uploaded image
        uploaded_image = None
        for img in images:
            if img["path"] == str(image_path):
                uploaded_image = img
                break

        if not uploaded_image:
            raise HTTPException(status_code=500, detail="Failed to find uploaded image")

        return {
            "message": "Image uploaded successfully",
            "image": uploaded_image,
        }
    except Exception as e:
        # Clean up file if something went wrong
        if image_path.exists():
            image_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")


@router.delete("/images/{image_id}")
async def delete_image(image_id: str):
    """
    Delete an image by ID.

    Args:
        image_id: Image ID

    Returns:
        Success message
    """
    image_service = get_image_service()
    if not image_service:
        raise HTTPException(status_code=503, detail="Image service not initialized")

    image = image_service.get_image_by_id(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = Path(image["path"])
    if image_path.exists():
        try:
            image_path.unlink()
            # Force rescan to remove deleted image
            image_service._last_scan = None
            image_service.scan_images()
            return {"message": "Image deleted successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete image: {str(e)}")
    else:
        raise HTTPException(status_code=404, detail="Image file not found")
