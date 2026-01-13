"""Image source plugins."""

# Import all plugins to trigger their auto-registration
from app.plugins.image import (
    local,  # noqa: F401
)
from app.plugins.image.local import LocalImagePlugin

__all__ = [
    "LocalImagePlugin",
]
