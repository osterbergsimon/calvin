"""Base plugin classes and types."""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any


class PluginType(str, Enum):
    """Plugin type enumeration."""

    CALENDAR = "calendar"
    IMAGE = "image"
    SERVICE = "service"


class BasePlugin(ABC):
    """Base class for all plugins."""

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        """
        Initialize plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name for the plugin
            enabled: Whether the plugin is enabled
        """
        self.plugin_id = plugin_id
        self.name = name
        self.enabled = enabled

    @property
    @abstractmethod
    def plugin_type(self) -> PluginType:
        """Return the type of this plugin."""
        pass

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the plugin (e.g., load configuration, connect to services)."""
        pass

    @abstractmethod
    async def cleanup(self) -> None:
        """Cleanup plugin resources (e.g., close connections, save state)."""
        pass

    async def configure(self, config: dict[str, Any]) -> None:
        """
        Configure the plugin with settings.

        Args:
            config: Configuration dictionary
        """
        # Default implementation: store config
        self._config = config

    def get_config(self) -> dict[str, Any]:
        """
        Get current plugin configuration.

        Returns:
            Configuration dictionary
        """
        return getattr(self, "_config", {})

    def enable(self) -> None:
        """Enable the plugin."""
        self.enabled = True

    def disable(self) -> None:
        """Disable the plugin."""
        self.enabled = False

    def __repr__(self) -> str:
        """String representation of the plugin."""
        return f"{self.__class__.__name__}(id={self.plugin_id}, name={self.name}, enabled={self.enabled})"

