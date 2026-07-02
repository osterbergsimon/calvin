"""Plugin registration and unregistration logic."""

from typing import Any

from loguru import logger

from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager as instance_manager


async def register_plugin(
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
    # Create plugin instance from the loader's type registry
    plugin = plugin_loader.create_plugin_instance(
        plugin_id=plugin_id,
        type_id=type_id,
        name=name,
        config={**config, "enabled": enabled},
    )

    if not plugin:
        # Check if plugin type is registered
        raise ValueError(
            f"Plugin type '{type_id}' is not installed or not loaded. "
            f"Please install the plugin from the plugin repository first."
        )

    # Configure plugin
    await plugin.configure(config)

    # Set enabled status
    if enabled:
        plugin.enable()
    else:
        plugin.disable()

    # Register plugin
    await instance_manager.register(plugin)

    # Save to database with retry logic for SQLite concurrency
    # Get plugin type to determine plugin_type
    from app.utils.db_retry import retry_on_db_locked

    @retry_on_db_locked(max_retries=5, initial_delay=0.1, max_delay=1.0)
    async def _save_plugin_to_db():
        db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)
        plugin_type = db_type.plugin_type if db_type else "unknown"

        await PluginDB.objects.create(
            id=plugin_id,
            type_id=type_id,
            plugin_type=plugin_type,
            name=name,
            enabled=enabled,
            config=config,
        )

    await _save_plugin_to_db()

    # Initialize plugin
    await plugin.initialize()

    return plugin


async def unregister_plugin(plugin_id: str) -> bool:
    """
    Unregister a plugin.

    Args:
        plugin_id: Plugin ID to unregister

    Returns:
        True if unregistered, False if not found
    """
    plugin = instance_manager.get_plugin(plugin_id)
    if plugin:
        try:
            await plugin.cleanup()
        except Exception:
            logger.opt(exception=True).warning(
                "Error cleaning up plugin {} during unregister", plugin_id
            )
            # Continue with deletion even if cleanup fails

    # Remove from database - this must always happen, even if cleanup failed
    deleted_from_db = False
    try:
        db_plugin = await PluginDB.objects.get_or_none(id=plugin_id)
        if db_plugin:
            logger.info(
                f"Found plugin {plugin_id} in database (name: {db_plugin.name}, "
                f"type: {db_plugin.type_id}, enabled: {db_plugin.enabled}), deleting..."
            )
            try:
                # Use Ormar delete - much simpler!
                await db_plugin.delete()
                deleted_from_db = True
                logger.info(f"Successfully deleted plugin {plugin_id} from database")

                # Verify deletion by querying again
                verify_plugin = await PluginDB.objects.get_or_none(id=plugin_id)
                if verify_plugin:
                    logger.warning(
                        f"Plugin {plugin_id} still exists after deletion. "
                        "This should not happen with Ormar."
                    )
                    deleted_from_db = False
                else:
                    logger.info(f"Verified: Plugin {plugin_id} successfully removed from database")
            except Exception:
                logger.exception("Error deleting plugin {} from database", plugin_id)
                deleted_from_db = False
                raise
        else:
            logger.warning(f"Plugin {plugin_id} not found in database during unregister")
    except Exception:
        logger.exception("Unexpected error during database deletion of {}", plugin_id)
        # Don't re-raise here - we want to continue and unregister from manager
        # But mark as not deleted
        deleted_from_db = False

    # Unregister from manager (this is just in-memory, so it's okay if it fails)
    # Do this even if plugin wasn't in database, in case it's in memory but not persisted
    await instance_manager.unregister(plugin_id)

    # Return True if we successfully deleted from database, or if plugin was in manager
    # (handles case where plugin exists in memory but not in DB yet)
    result = deleted_from_db or (plugin is not None)
    if not result:
        logger.warning(f"Plugin {plugin_id} not found in database or manager during unregister")
    return result
