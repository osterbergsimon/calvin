"""Plugin manager for registering and managing plugins."""

from typing import Any

from app.plugins.base import BasePlugin, PluginType


class PluginManager:
    """Manages plugin registration and lifecycle."""

    def __init__(self):
        """Initialize plugin manager."""
        self._plugins: dict[str, BasePlugin] = {}
        self._plugins_by_type: dict[PluginType, list[BasePlugin]] = {
            PluginType.CALENDAR: [],
            PluginType.IMAGE: [],
            PluginType.SERVICE: [],
        }

    def register(self, plugin: BasePlugin) -> None:
        """
        Register a plugin.

        Args:
            plugin: Plugin instance to register
        """
        if plugin.plugin_id in self._plugins:
            raise ValueError(f"Plugin with ID '{plugin.plugin_id}' already registered")

        self._plugins[plugin.plugin_id] = plugin
        self._plugins_by_type[plugin.plugin_type].append(plugin)

    def unregister(self, plugin_id: str) -> bool:
        """
        Unregister a plugin.

        Args:
            plugin_id: ID of plugin to unregister

        Returns:
            True if unregistered, False if not found
        """
        if plugin_id not in self._plugins:
            return False

        plugin = self._plugins[plugin_id]
        del self._plugins[plugin_id]
        self._plugins_by_type[plugin.plugin_type].remove(plugin)
        return True

    def get_plugin(self, plugin_id: str) -> BasePlugin | None:
        """
        Get a plugin by ID.

        Args:
            plugin_id: Plugin ID

        Returns:
            Plugin instance or None if not found
        """
        return self._plugins.get(plugin_id)

    def get_plugins(self, plugin_type: PluginType | None = None, enabled_only: bool = True) -> list[BasePlugin]:
        """
        Get plugins, optionally filtered by type and enabled status.

        Args:
            plugin_type: Optional plugin type filter
            enabled_only: If True, only return enabled plugins

        Returns:
            List of plugin instances
        """
        if plugin_type:
            plugins = self._plugins_by_type[plugin_type]
        else:
            plugins = list(self._plugins.values())

        if enabled_only:
            plugins = [p for p in plugins if p.enabled]

        return plugins

    async def initialize_all(self) -> None:
        """Initialize all registered plugins."""
        for plugin in self._plugins.values():
            if plugin.enabled:
                try:
                    await plugin.initialize()
                except Exception as e:
                    print(f"Error initializing plugin {plugin.plugin_id}: {e}")

    async def cleanup_all(self) -> None:
        """Cleanup all registered plugins."""
        for plugin in self._plugins.values():
            try:
                await plugin.cleanup()
            except Exception as e:
                print(f"Error cleaning up plugin {plugin.plugin_id}: {e}")

    def get_plugin_count(self, plugin_type: PluginType | None = None) -> int:
        """
        Get count of plugins, optionally filtered by type.

        Args:
            plugin_type: Optional plugin type filter

        Returns:
            Number of plugins
        """
        if plugin_type:
            return len(self._plugins_by_type[plugin_type])
        return len(self._plugins)


# Global plugin manager instance
plugin_manager = PluginManager()

