"""Service plugins."""

# Import all plugins to trigger their auto-registration
from app.plugins.service import (
    iframe,  # noqa: F401
)
from app.plugins.service.iframe import IframeServicePlugin

__all__ = [
    "IframeServicePlugin",
]
