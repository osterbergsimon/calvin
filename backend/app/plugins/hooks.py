"""Pluggy hook specifications for plugin registration."""

from typing import Any

import pluggy

from app.plugins.base import BasePlugin

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

    @hookspec
    async def handle_plugin_config_update(
        self,
        type_id: str,
        config: dict[str, Any],
        enabled: bool | None,
        db_type: Any,  # PluginTypeDB
        session: Any,  # AsyncSession
    ) -> dict[str, Any] | None:
        """
        Handle plugin-specific configuration update and instance management.

        This hook allows plugins to handle their own instance creation/update logic
        when the plugin type configuration is updated. This keeps plugins self-contained.

        Args:
            type_id: Plugin type ID (e.g., 'mealie', 'yr_weather')
            config: Updated configuration dictionary (already cleaned)
            enabled: New enabled state (None if not changed)
            db_type: PluginTypeDB instance from database
            session: Database session for queries/updates

        Returns:
            Dictionary with status information, or None if this plugin doesn't handle the update.
            The dict can contain keys like:
            - 'instance_created': bool - whether a new instance was created
            - 'instance_updated': bool - whether an existing instance was updated
            - 'instance_id': str - ID of the created/updated instance
        """
        pass

    @hookspec
    async def test_plugin_connection(
        self,
        type_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        Test plugin connection/configuration.

        This hook allows plugins to implement their own connection testing logic.

        Args:
            type_id: Plugin type ID (e.g., 'imap', 'mealie', 'yr_weather')
            config: Plugin configuration dictionary

        Returns:
            Dictionary with test result, or None if this plugin doesn't support testing.
            The dict should contain:
            - 'success': bool - whether the test succeeded
            - 'message': str - test result message
        """
        pass

    @hookspec
    async def fetch_plugin_data(
        self,
        type_id: str,
        instance_id: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Manually trigger plugin fetch/check operation.

        This hook allows plugins to implement their own fetch logic (e.g., check for new emails).

        Args:
            type_id: Plugin type ID (e.g., 'imap')
            instance_id: Optional plugin instance ID (if None, use first instance)

        Returns:
            Dictionary with fetch result, or None if this plugin doesn't support fetching.
            The dict should contain:
            - 'success': bool - whether the fetch succeeded
            - 'message': str - fetch result message
            - Additional plugin-specific fields (e.g., 'images_downloaded', 'image_count')
        """
        pass

    @hookspec
    async def fetch_service_data(
        self,
        instance_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Fetch service data from a service plugin instance.

        This hook allows service plugins to implement their own data fetching logic
        for the generic /web-services/{service_id}/data endpoint.

        Args:
            instance_id: Plugin instance ID
            start_date: Optional start date (YYYY-MM-DD format, plugin-specific)
            end_date: Optional end date (YYYY-MM-DD format, plugin-specific)

        Returns:
            Dictionary with service data, or None if this plugin doesn't handle this instance.
            The dict can contain any plugin-specific data structure.
        """
        pass


# Create plugin manager
plugin_manager = pluggy.PluginManager("calvin")
plugin_manager.add_hookspecs(PluginHookSpec)
