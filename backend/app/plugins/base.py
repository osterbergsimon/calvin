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
        self._running = False  # Runtime state: whether plugin is currently running

    @property
    @abstractmethod
    def plugin_type(self) -> PluginType:
        """Return the type of this plugin."""
        pass

    @classmethod
    @abstractmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """
        Get plugin metadata for registration.
        
        This method should be overridden by each plugin class to return:
        - type_id: Unique identifier (e.g., 'google', 'local')
        - name: Human-readable name
        - description: Plugin type description
        - version: Plugin type version (optional, default: "1.0.0")
        - common_config_schema: Common config schema (dict, optional)
        - ui_actions: Plugin-specific actions/buttons (list, optional)
        - ui_sections: Plugin-specific sections (list, optional)
        
        Returns:
            Dictionary with plugin metadata
        """
        pass

    @abstractmethod
    async def initialize(self) -> None:
        """
        Initialize the plugin (e.g., load configuration, connect to services).
        
        Note: This method should call start() when initialization is complete
        to mark the plugin as running.
        """
        pass

    @abstractmethod
    async def cleanup(self) -> None:
        """
        Cleanup plugin resources (e.g., close connections, save state).
        
        Note: This method should call stop() before cleanup to mark the plugin
        as not running.
        """
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

    def start(self) -> None:
        """
        Start the plugin (mark as running).
        
        This should be called after successful initialization.
        Plugins can override this to add custom start logic.
        """
        if not self.enabled:
            raise RuntimeError(f"Cannot start disabled plugin {self.plugin_id}")
        self._running = True

    def stop(self) -> None:
        """
        Stop the plugin (mark as not running).
        
        This should be called before cleanup.
        Plugins can override this to add custom stop logic.
        """
        self._running = False

    def is_running(self) -> bool:
        """
        Check if the plugin is currently running.
        
        Returns:
            True if plugin is running, False otherwise
        """
        return self._running

    @property
    def running(self) -> bool:
        """Property to access running state."""
        return self._running

    def __repr__(self) -> str:
        """String representation of the plugin."""
        return f"{self.__class__.__name__}(id={self.plugin_id}, name={self.name}, enabled={self.enabled}, running={self._running})"

