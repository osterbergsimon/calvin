"""Plugin registry service using unified plugins table and pluggy."""

from typing import Any

from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager as instance_manager

from .loader import load_plugin_instances, load_plugin_types
from .manager import register_plugin, unregister_plugin


class PluginRegistry:
    """Plugin registry using unified plugins table and pluggy."""

    def __init__(self):
        """Initialize plugin registry."""
        self._initialized = False

    async def load_plugins_from_db(self) -> None:
        """Load all plugins from database and register them."""
        # Load plugin types from pluggy hooks first
        plugin_loader.load_all_plugins()

        # Then, load plugin types from database (or register defaults)
        await load_plugin_types()

        # Load plugin instances from database
        await load_plugin_instances()

        # Initialize all plugins
        if not self._initialized:
            await instance_manager.initialize_all()
            self._initialized = True

    async def register_plugin(
        self,
        plugin_id: str,
        type_id: str,
        name: str,
        config: dict[str, Any],
        enabled: bool = False,
        session: Any = None,
    ) -> Any:
        """
        Register a new plugin instance.

        Args:
            plugin_id: Unique identifier for the plugin instance
            type_id: Plugin type ID (e.g., 'google', 'local')
            name: Human-readable name
            config: Plugin configuration dictionary
            enabled: Whether the plugin is enabled
            session: Optional database session. If provided, uses it and doesn't commit.

        Returns:
            Registered plugin instance
        """
        return await register_plugin(plugin_id, type_id, name, config, enabled, session)

    async def unregister_plugin(self, plugin_id: str) -> bool:
        """
        Unregister a plugin.

        Args:
            plugin_id: Plugin ID to unregister

        Returns:
            True if unregistered, False if not found
        """
        return await unregister_plugin(plugin_id)


# Global plugin registry instance
plugin_registry = PluginRegistry()
