"""Pluggy hook specifications for plugin registration."""

from typing import Any

import pluggy

from app.plugins.base import BasePlugin, PluginType

# Create pluggy hook specification manager
hookspec = pluggy.HookspecMarker("calvin")
hookimpl = pluggy.HookimplMarker("calvin")


class PluginHookSpec:
    """Hook specifications for plugin registration."""

    @hookspec
    def register_plugin_types(self) -> list[dict[str, Any]]:
        """
        Register plugin types.

        Returns:
            List of plugin type dictionaries with keys:
            - type_id: Unique identifier (e.g., 'google', 'local')
            - plugin_type: Plugin category (PluginType enum value)
            - name: Human-readable name
            - description: Plugin type description
            - version: Plugin type version (optional)
            - common_config_schema: Common config schema (dict, optional)
            - plugin_class: Plugin class (BasePlugin subclass)
        """
        pass

    @hookspec
    def create_plugin_instance(
        self,
        plugin_id: str,
        type_id: str,
        name: str,
        config: dict[str, Any],
    ) -> BasePlugin | None:
        """
        Create a plugin instance.

        Args:
            plugin_id: Unique identifier for the plugin instance
            type_id: Plugin type ID (e.g., 'google', 'local')
            name: Human-readable name
            config: Plugin configuration dictionary

        Returns:
            Plugin instance or None if type_id is not handled by this plugin
        """
        pass


# Create plugin manager
plugin_manager = pluggy.PluginManager("calvin")
plugin_manager.add_hookspecs(PluginHookSpec)

