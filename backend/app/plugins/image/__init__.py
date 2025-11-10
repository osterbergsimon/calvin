"""Image source plugins."""

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

