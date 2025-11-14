"""Plugin system for Calvin Dashboard.

This module provides a pluggable architecture for:
- Calendar sources (Google, Proton, etc.)
- Image sources (local filesystem, cloud storage, etc.)
- Service plugins (webhooks, APIs, iframes, etc.)
"""

from app.plugins.base import BasePlugin, PluginType
from app.plugins.manager import PluginManager
from app.plugins.protocols import (
    CalendarPlugin,
    ImagePlugin,
    ServicePlugin,
)

__all__ = [
    "BasePlugin",
    "PluginType",
    "PluginManager",
    "CalendarPlugin",
    "ImagePlugin",
    "ServicePlugin",
]
