"""Image source plugins."""

# Import all plugins to trigger their auto-registration
from app.plugins.image import (
    imap,  # noqa: F401
    local,  # noqa: F401
)
from app.plugins.image.imap import ImapImagePlugin
from app.plugins.image.local import LocalImagePlugin

__all__ = [
    "ImapImagePlugin",
    "LocalImagePlugin",
]
