"""Image endpoints."""

import hashlib
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from app.services import image_service as image_service_module
from app.services import plugin_image_service

router = APIRouter()


def get_image_service():
    """Get the global image service instance (legacy)."""
    return image_service_module.image_service


@router.get("/images/list")
async def list_images():
    """
    Get list of all images from all enabled image plugins.

    Returns:
        List of image metadata
    """
    # Get randomize setting from config
    from app.services.config_service import config_service
    randomize_value = await config_service.get_value("randomize_images")
    randomize = randomize_value == "true" if randomize_value else False
    
    # Use plugin service to aggregate images from all plugins
    images = await plugin_image_service.get_images(randomize=randomize)
    return {"images": images, "total": len(images)}


@router.get("/images/current")
async def get_current_image():
    """
    Get current image metadata from plugin service.

    Returns:
        Current image metadata
    """
    # Get randomize setting from config
    from app.services.config_service import config_service
    randomize_value = await config_service.get_value("randomize_images")
    randomize = randomize_value == "true" if randomize_value else False
    
    image = await plugin_image_service.get_current_image(randomize=randomize)
    if not image:
        return {"image": None, "message": "No images available"}

    return {"image": image}


@router.get("/images/{image_id}")
async def get_image_file(image_id: str):
    """
    Get image file by ID from plugin service.
    
    For remote images (like Unsplash), redirects to the image URL.
    For local images, serves the file directly.

    Args:
        image_id: Image ID

    Returns:
        Image file or redirect to image URL
    """
    # Get image metadata
    image = await plugin_image_service.get_image_by_id(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check if this is a remote image (has URL but no local path)
    # For remote images, redirect to the URL instead of downloading
    image_url = image.get("url") or image.get("raw_url")
    image_path = image.get("path")
    
    # If it's a remote URL (starts with http), redirect to it
    if image_url and image_url.startswith("http"):
        from fastapi.responses import RedirectResponse
        return RedirectResponse(
            url=image_url,
            status_code=302,
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            },
        )
    
    # For local images, check if path exists
    if image_path and Path(image_path).exists():
        image_path_obj = Path(image_path)
        return FileResponse(
            image_path_obj,
            media_type=f"image/{image['format'].lstrip('.')}",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            },
        )
    
    # Fallback: Get image data from plugin (download if needed)
    image_data = await plugin_image_service.get_image_data(image_id)
    if not image_data:
        raise HTTPException(status_code=404, detail="Image file not found")

    # Return image data directly
    from fastapi.responses import Response
    return Response(
        content=image_data,
        media_type=f"image/{image.get('format', 'jpeg').lstrip('.')}",
        headers={
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/images/{image_id}/thumbnail")
async def get_image_thumbnail(image_id: str):
    """
    Get thumbnail for an image by ID from plugin service.

    Args:
        image_id: Image ID

    Returns:
        Thumbnail image file
    """
    from app.plugins.manager import plugin_manager
    from app.plugins.base import PluginType
    from app.plugins.protocols import ImagePlugin

    # Get image metadata
    image = await plugin_image_service.get_image_by_id(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Find which plugin owns this image
    source_plugin_id = image.get("source")
    if not source_plugin_id:
        raise HTTPException(status_code=404, detail="Image source not found")

    # Get the plugin
    plugin = plugin_manager.get_plugin(source_plugin_id)
    if not plugin or not isinstance(plugin, ImagePlugin):
        raise HTTPException(status_code=404, detail="Image plugin not found")

    # Get thumbnail path using protocol-defined method
    thumbnail_path = plugin.get_thumbnail_path(image_id)
    if thumbnail_path and thumbnail_path.exists():
        return FileResponse(
                thumbnail_path,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",  # Cache for 1 day
                },
            )

    # Fallback: generate thumbnail from image data
    image_data = await plugin_image_service.get_image_data(image_id)
    if not image_data:
        raise HTTPException(status_code=404, detail="Image file not found")

    # Generate thumbnail on the fly
    from PIL import Image as PILImage, ImageOps
    from io import BytesIO
    try:
        img = PILImage.open(BytesIO(image_data))
        img = ImageOps.exif_transpose(img)
        img.thumbnail((200, 200), PILImage.Resampling.LANCZOS)
        
        # Convert to RGB if necessary
        if img.mode in ("RGBA", "LA", "P"):
            background = PILImage.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")
        
        # Save to bytes
        thumbnail_bytes = BytesIO()
        img.save(thumbnail_bytes, "JPEG", quality=85, optimize=True)
        thumbnail_bytes.seek(0)
        
        from fastapi.responses import Response
        return Response(
            content=thumbnail_bytes.read(),
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=86400",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")


@router.post("/images/next")
async def next_image():
    """
    Move to next image and return it from plugin service.

    Returns:
        Next image metadata
    """
    # Get randomize setting from config
    from app.services.config_service import config_service
    randomize_value = await config_service.get_value("randomize_images")
    randomize = randomize_value == "true" if randomize_value else False
    
    image = await plugin_image_service.next_image(randomize=randomize)
    if not image:
        return {"image": None, "message": "No images available"}

    return {"image": image}


@router.post("/images/previous")
async def previous_image():
    """
    Move to previous image and return it from plugin service.

    Returns:
        Previous image metadata
    """
    # Get randomize setting from config
    from app.services.config_service import config_service
    randomize_value = await config_service.get_value("randomize_images")
    randomize = randomize_value == "true" if randomize_value else False
    
    image = await plugin_image_service.previous_image(randomize=randomize)
    if not image:
        return {"image": None, "message": "No images available"}

    return {"image": image}


@router.get("/images/config")
async def get_image_config():
    """
    Get image service configuration from plugins.

    Returns:
        Configuration dictionary
    """
    from app.plugins.manager import plugin_manager
    from app.plugins.base import PluginType

    # Get all image plugins
    plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=True)
    
    # Return plugin count and basic info
    return {
        "plugin_count": len(plugins),
        "plugins": [
            {
                "id": p.plugin_id,
                "name": p.name,
                "enabled": p.enabled,
            }
            for p in plugins
        ],
    }


@router.post("/images/upload")
async def upload_image(file: UploadFile = File(...)):
    """
    Upload an image file to the first plugin that supports upload.

    Args:
        file: Image file to upload

    Returns:
        Uploaded image metadata
    """
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    supported_formats = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    if file_ext not in supported_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Supported formats: {', '.join(supported_formats)}",
        )

    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {max_size / (1024 * 1024):.0f}MB",
        )

    # Upload to plugin service (will try first plugin that supports upload)
    uploaded_image = await plugin_image_service.upload_image(file_content, file.filename)
    if not uploaded_image:
        raise HTTPException(status_code=500, detail="Failed to upload image: No plugin supports upload")

    return {
        "message": "Image uploaded successfully",
        "image": uploaded_image,
    }


@router.delete("/images/{image_id}")
async def delete_image(image_id: str):
    """
    Delete an image by ID from plugin service.

    Args:
        image_id: Image ID

    Returns:
        Success message
    """
    # Delete from plugin service (will find the plugin that owns the image)
    deleted = await plugin_image_service.delete_image(image_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Image not found or deletion not supported")

    return {"message": "Image deleted successfully"}
