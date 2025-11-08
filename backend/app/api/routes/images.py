"""Image endpoints."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
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
    
    image_path = Path(image['path'])
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

