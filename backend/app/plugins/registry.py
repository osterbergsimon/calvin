"""Plugin registry service using unified plugins table and pluggy."""

from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.db_models import PluginDB, PluginTypeDB
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
        import logging

        logger = logging.getLogger(__name__)

        # Get plugin types from pluggy hooks
        plugin_types = plugin_loader.get_plugin_types()

        async with AsyncSessionLocal() as session:
            for type_info in plugin_types:
                type_id = None
                error_message = None

                try:
                    # Validate required fields
                    if not isinstance(type_info, dict):
                        continue
                    if "type_id" not in type_info:
                        continue
                    if "plugin_type" not in type_info:
                        continue

                    type_id = type_info["type_id"]

                    # Get name with fallback
                    name = type_info.get("name") or type_id or "Unknown Plugin"

                    # Check if plugin type exists in database
                    result = await session.execute(
                        select(PluginTypeDB).where(PluginTypeDB.type_id == type_id)
                    )
                    db_type = result.scalar_one_or_none()

                    if not db_type:
                        # Create new plugin type in database
                        plugin_type_value = (
                            type_info["plugin_type"].value
                            if hasattr(type_info["plugin_type"], "value")
                            else str(type_info["plugin_type"])
                        )
                        db_type = PluginTypeDB(
                            type_id=type_id,
                            plugin_type=plugin_type_value,
                            name=name,
                            description=type_info.get("description"),
                            version=type_info.get("version"),
                            common_config_schema=type_info.get("common_config_schema", {}),
                            enabled=False,  # Default to disabled - user must explicitly enable
                            error_message=None,  # Clear any previous errors
                        )
                        session.add(db_type)
                    else:
                        # Update existing plugin type if needed
                        plugin_type_value = (
                            type_info["plugin_type"].value
                            if hasattr(type_info["plugin_type"], "value")
                            else str(type_info["plugin_type"])
                        )
                        db_type.name = name
                        db_type.description = type_info.get("description")
                        db_type.version = type_info.get("version")
                        db_type.common_config_schema = type_info.get("common_config_schema", {})
                        db_type.plugin_type = plugin_type_value
                        # Clear error message on successful load
                        db_type.error_message = None

                except Exception as e:
                    # Log the error and mark plugin as broken
                    error_message = str(e)
                    logger.error(
                        f"Error loading plugin type {type_id or 'unknown'}: {error_message}",
                        exc_info=True,
                    )

                    if type_id:
                        # Try to update or create the plugin type with error status
                        try:
                            result = await session.execute(
                                select(PluginTypeDB).where(PluginTypeDB.type_id == type_id)
                            )
                            db_type = result.scalar_one_or_none()

                            if db_type:
                                # Update existing plugin type with error
                                db_type.error_message = error_message
                                db_type.enabled = False  # Disable broken plugins
                            else:
                                # Create new plugin type entry with error
                                db_type = PluginTypeDB(
                                    type_id=type_id,
                                    plugin_type="unknown",
                                    name=type_id or "Unknown Plugin",
                                    description=None,
                                    version=None,
                                    common_config_schema={},
                                    enabled=False,
                                    error_message=error_message,
                                )
                                session.add(db_type)
                        except Exception as db_error:
                            logger.error(
                                f"Error updating database for broken plugin {type_id}: {db_error}",
                                exc_info=True,
                            )

            await session.commit()

    async def _load_plugin_instances(self) -> None:
        """Load plugin instances from database."""
        import logging

        logger = logging.getLogger(__name__)

        async with AsyncSessionLocal() as session:
            result = await session.execute(select(PluginDB))
            db_plugins = result.scalars().all()

            for db_plugin in db_plugins:
                # Skip disabled plugins - don't create instances for them
                if not db_plugin.enabled:
                    # If plugin was previously registered but is now disabled,
                    # unregister and cleanup it
                    existing = instance_manager.get_plugin(db_plugin.id)
                    if existing:
                        try:
                            await existing.cleanup()
                            instance_manager.unregister(db_plugin.id)
                        except Exception as e:
                            logger.warning(
                                f"Error cleaning up disabled plugin {db_plugin.id}: {e}",
                                exc_info=True,
                            )
                    continue

                # Only process enabled plugins from here on
                try:
                    # Check if plugin already registered
                    existing = instance_manager.get_plugin(db_plugin.id)
                    if existing:
                        try:
                            # Update existing plugin config
                            await existing.configure(db_plugin.config or {})
                            # Plugin should already be enabled (we only process enabled plugins)
                            if not existing.enabled:
                                existing.enable()
                        except Exception as e:
                            logger.error(
                                f"Error updating existing plugin {db_plugin.id}: {e}", exc_info=True
                            )
                            # Disable plugin on error
                            existing.disable()
                            db_plugin.enabled = False
                            await session.commit()
                        continue

                    # Create plugin instance using pluggy hooks (only for enabled plugins)
                    plugin = None
                    try:
                        plugin_config = db_plugin.config or {}
                        # Plugin is enabled, so pass enabled=True to constructor
                        plugin_config_with_enabled = {**plugin_config, "enabled": True}

                        plugin = plugin_loader.create_plugin_instance(
                            plugin_id=db_plugin.id,
                            type_id=db_plugin.type_id,
                            name=db_plugin.name,
                            config=plugin_config_with_enabled,
                        )
                    except Exception as e:
                        logger.error(
                            f"Error creating plugin instance {db_plugin.id} "
                            f"(type: {db_plugin.type_id}): {e}",
                            exc_info=True,
                        )
                        # Mark plugin as disabled in database on error
                        db_plugin.enabled = False
                        await session.commit()
                        continue

                    if plugin:
                        try:
                            # Configure plugin with additional settings
                            # Clean config to ensure all values are actual values,
                            # not schema objects
                            plugin_config = db_plugin.config or {}
                            cleaned_config = {}
                            for key, value in plugin_config.items():
                                if isinstance(value, dict) and (
                                    "type" in value or "description" in value
                                ):
                                    # This is a schema object, extract the actual value
                                    cleaned_config[key] = (
                                        value.get("value") or value.get("default") or ""
                                    )
                                else:
                                    cleaned_config[key] = value
                            await plugin.configure(cleaned_config)

                            # Ensure plugin is enabled
                            # (should already be from constructor, but verify)
                            if not plugin.enabled:
                                plugin.enable()

                            # Register plugin
                            instance_manager.register(plugin)

                            # Initialize and start the plugin
                            try:
                                await plugin.initialize()
                                plugin.start()
                            except Exception as init_error:
                                logger.error(
                                    f"Error initializing plugin {db_plugin.id}: {init_error}",
                                    exc_info=True,
                                )
                                plugin.stop()
                        except Exception as e:
                            logger.error(
                                f"Error configuring plugin {db_plugin.id}: {e}", exc_info=True
                            )
                            # Only disable this specific plugin on error
                            try:
                                db_plugin.enabled = False
                                await session.commit()
                            except Exception as db_error:
                                logger.error(
                                    f"Error updating database for plugin "
                                    f"{db_plugin.id}: {db_error}",
                                    exc_info=True,
                                )
                    else:
                        # Plugin creation returned None - this could be normal
                        # if plugin type isn't registered
                        # Don't disable it, just log a warning
                        logger.warning(
                            f"Plugin instance creation returned None for "
                            f"{db_plugin.id} (type: {db_plugin.type_id}). "
                            f"Plugin type may not be registered or "
                            f"plugin may not be available."
                        )
                        # Don't disable - the plugin might work later
                        # when the plugin type is registered

                except Exception as e:
                    # Catch-all for any unexpected errors
                    logger.error(
                        f"Unexpected error loading plugin instance {db_plugin.id}: {e}",
                        exc_info=True,
                    )
                    # Disable plugin on error
                    try:
                        db_plugin.enabled = False
                        await session.commit()
                    except Exception:
                        pass  # Ignore errors when trying to disable

    async def register_plugin(
        self,
        plugin_id: str,
        type_id: str,
        name: str,
        config: dict[str, Any],
        enabled: bool = False,  # Default to disabled - user must explicitly enable
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
