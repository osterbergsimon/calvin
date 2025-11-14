"""Image source plugins."""

# Import all plugins to trigger their auto-registration
from app.plugins.image import (
    imap,  # noqa: F401
    local,  # noqa: F401
    picsum,  # noqa: F401
    unsplash,  # noqa: F401
)
from app.plugins.image.imap import ImapImagePlugin
from app.plugins.image.local import LocalImagePlugin
from app.plugins.image.picsum import PicsumImagePlugin
from app.plugins.image.unsplash import UnsplashImagePlugin

__all__ = [
    "ImapImagePlugin",
    "LocalImagePlugin",
    "PicsumImagePlugin",
    "UnsplashImagePlugin",
]
