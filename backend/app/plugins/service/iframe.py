"""Iframe service plugin for displaying web services."""

from typing import Any

from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl, plugin_manager
from app.plugins.protocols import ServicePlugin


class IframeServicePlugin(ServicePlugin):
    """Iframe service plugin for displaying web services in iframes."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "iframe",
            "plugin_type": PluginType.SERVICE,
            "name": "Iframe Service",
            "description": "Web service displayed in iframe",
            "version": "1.0.0",
            "common_config_schema": {},
            "display_schema": {
                "type": "iframe",
                "api_endpoint": None,  # Iframe services don't use API endpoints
                "method": None,
                "data_schema": None,
                "render_template": "iframe",
            },
            "plugin_class": cls,
        }

    def __init__(self, plugin_id: str, name: str, url: str, enabled: bool = True, fullscreen: bool = False):
        """
        Initialize iframe service plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            url: URL to display in iframe
            enabled: Whether the plugin is enabled
            fullscreen: Whether to display in fullscreen mode
        """
        super().__init__(plugin_id, name, enabled)
        self.url = url
        self.fullscreen = fullscreen

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Validate URL
        if not self.url or not (self.url.startswith("http://") or self.url.startswith("https://")):
            raise ValueError(f"Invalid URL: {self.url}")

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        # Nothing to cleanup for iframe
        pass

    async def get_content(self) -> dict[str, Any]:
        """
        Get service content for display.

        Returns:
            Dictionary with content information
        """
        return {
            "type": "iframe",
            "url": self.url,
            "fullscreen": self.fullscreen,
            "config": {
                "allowFullscreen": True,
                "sandbox": "allow-same-origin allow-scripts allow-forms allow-popups",
            },
        }

    async def validate_config(self, config: dict[str, Any]) -> bool:
        """
        Validate plugin configuration.

        Args:
            config: Configuration dictionary with 'url' key

        Returns:
            True if configuration is valid
        """
        if "url" not in config:
            return False

        url = config["url"]
        if not isinstance(url, str) or not url.strip():
            return False

        return url.startswith("http://") or url.startswith("https://")


# Register this plugin with pluggy
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register IframeServicePlugin type."""
    return [IframeServicePlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> IframeServicePlugin | None:
    """Create an IframeServicePlugin instance."""
    if type_id != "iframe":
        return None
    
    enabled = config.get("enabled", False)  # Default to disabled
    url = config.get("url", "")
    fullscreen = config.get("fullscreen", False)
    
    # Handle schema objects
    if isinstance(url, dict):
        url = url.get("value") or url.get("default") or ""
    url = str(url) if url else ""
    
    if isinstance(fullscreen, dict):
        fullscreen = fullscreen.get("value") or fullscreen.get("default") or False
    fullscreen = bool(fullscreen) if not isinstance(fullscreen, bool) else fullscreen
    
    return IframeServicePlugin(
        plugin_id=plugin_id,
        name=name,
        url=url,
        enabled=enabled,
        fullscreen=fullscreen,
    )

