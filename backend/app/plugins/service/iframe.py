"""Iframe service plugin for displaying web services."""

from typing import Any

from app.plugins.protocols import ServicePlugin


class IframeServicePlugin(ServicePlugin):
    """Iframe service plugin for displaying web services in iframes."""

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

