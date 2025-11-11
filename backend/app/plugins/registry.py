"""Plugin registry service using unified plugins table and pluggy."""

import json
from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.base import PluginType
from app.plugins.hooks import plugin_manager
from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager as instance_manager


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
        await self._load_plugin_types()

        # Load plugin instances from database
        await self._load_plugin_instances()

        # Initialize all plugins
        if not self._initialized:
            await instance_manager.initialize_all()
            self._initialized = True

    async def _load_plugin_types(self) -> None:
        """Load plugin types from database or register defaults."""
        # Get plugin types from pluggy hooks
        plugin_types = plugin_loader.get_plugin_types()

        async with AsyncSessionLocal() as session:
            for type_info in plugin_types:
                # Check if plugin type exists in database
                result = await session.execute(
                    select(PluginTypeDB).where(PluginTypeDB.type_id == type_info["type_id"])
                )
                db_type = result.scalar_one_or_none()

                if not db_type:
                    # Create new plugin type in database
                    db_type = PluginTypeDB(
                        type_id=type_info["type_id"],
                        plugin_type=type_info["plugin_type"].value,
                        name=type_info["name"],
                        description=type_info.get("description"),
                        version=type_info.get("version"),
                        common_config_schema=type_info.get("common_config_schema", {}),
                        enabled=True,  # Default to enabled
                    )
                    session.add(db_type)
                else:
                    # Update existing plugin type if needed
                    db_type.name = type_info["name"]
                    db_type.description = type_info.get("description")
                    db_type.version = type_info.get("version")
                    db_type.common_config_schema = type_info.get("common_config_schema", {})
                    db_type.plugin_type = type_info["plugin_type"].value

            await session.commit()

    async def _load_plugin_instances(self) -> None:
        """Load plugin instances from database."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(PluginDB))
            db_plugins = result.scalars().all()

            for db_plugin in db_plugins:
                # Check if plugin already registered
                existing = instance_manager.get_plugin(db_plugin.id)
                if existing:
                    # Update existing plugin config
                    await existing.configure(db_plugin.config or {})
                    if db_plugin.enabled:
                        existing.enable()
                    else:
                        existing.disable()
                    continue

                # Create plugin instance using pluggy hooks
                plugin = plugin_loader.create_plugin_instance(
                    plugin_id=db_plugin.id,
                    type_id=db_plugin.type_id,
                    name=db_plugin.name,
                    config=db_plugin.config or {},
                )

                if plugin:
                    # Configure plugin with additional settings
                    # Clean config to ensure all values are actual values, not schema objects
                    plugin_config = db_plugin.config or {}
                    cleaned_config = {}
                    for key, value in plugin_config.items():
                        if isinstance(value, dict) and ("type" in value or "description" in value):
                            # This is a schema object, extract the actual value
                            cleaned_config[key] = value.get("value") or value.get("default") or ""
                        else:
                            cleaned_config[key] = value
                    await plugin.configure(cleaned_config)

                    # Set enabled status
                    if db_plugin.enabled:
                        plugin.enable()
                    else:
                        plugin.disable()

                    # Register plugin
                    instance_manager.register(plugin)

    async def register_plugin(
        self,
        plugin_id: str,
        type_id: str,
        name: str,
        config: dict[str, Any],
        enabled: bool = True,
    ) -> Any:
        """
        Register a new plugin instance.

        Args:
            plugin_id: Unique identifier for the plugin instance
            type_id: Plugin type ID (e.g., 'google', 'local')
            name: Human-readable name
            config: Plugin configuration dictionary
            enabled: Whether the plugin is enabled

        Returns:
            Registered plugin instance
        """
        # Create plugin instance using pluggy hooks
        plugin = plugin_loader.create_plugin_instance(
            plugin_id=plugin_id,
            type_id=type_id,
            name=name,
            config={**config, "enabled": enabled},
        )

        if not plugin:
            raise ValueError(f"Failed to create plugin instance for type_id: {type_id}")

        # Configure plugin
        await plugin.configure(config)

        # Set enabled status
        if enabled:
            plugin.enable()
        else:
            plugin.disable()

        # Register plugin
        instance_manager.register(plugin)

        # Save to database
        async with AsyncSessionLocal() as session:
            # Get plugin type to determine plugin_type
            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == type_id)
            )
            db_type = result.scalar_one_or_none()
            plugin_type = db_type.plugin_type if db_type else "unknown"

            db_plugin = PluginDB(
                id=plugin_id,
                type_id=type_id,
                plugin_type=plugin_type,
                name=name,
                enabled=enabled,
                config=config,
            )
            session.add(db_plugin)
            await session.commit()
            await session.refresh(db_plugin)

        # Initialize plugin
        await plugin.initialize()

        return plugin

    async def unregister_plugin(self, plugin_id: str) -> bool:
        """
        Unregister a plugin.

        Args:
            plugin_id: Plugin ID to unregister

        Returns:
            True if unregistered, False if not found
        """
        plugin = instance_manager.get_plugin(plugin_id)
        if plugin:
            await plugin.cleanup()

        # Remove from database
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(PluginDB).where(PluginDB.id == plugin_id))
            db_plugin = result.scalar_one_or_none()
            if db_plugin:
                await session.delete(db_plugin)
                await session.commit()

        return instance_manager.unregister(plugin_id)


# Global plugin registry instance
plugin_registry = PluginRegistry()

