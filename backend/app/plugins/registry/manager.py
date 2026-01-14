"""Plugin registration and unregistration logic."""

import logging
from typing import Any

from sqlalchemy import select, text

from app.database import AsyncSessionLocal
from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager as instance_manager

logger = logging.getLogger(__name__)


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
    # Create plugin instance using pluggy hooks
    plugin = plugin_loader.create_plugin_instance(
        plugin_id=plugin_id,
        type_id=type_id,
        name=name,
        config={**config, "enabled": enabled},
    )

    if not plugin:
        # Check if plugin type is registered
        plugin_types = plugin_loader.get_plugin_types()
        type_info = next((t for t in plugin_types if t.get("type_id") == type_id), None)
        if not type_info:
            raise ValueError(
                f"Plugin type '{type_id}' is not installed or not loaded. "
                f"Please install the plugin from the plugin repository first."
            )
        raise ValueError(
            f"Failed to create plugin instance for type_id: {type_id}. "
            f"The plugin type is registered but instance creation failed. "
            f"Check the plugin's create_plugin_instance hook implementation."
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

    # Save to database
    async with AsyncSessionLocal() as session:
        # Get plugin type to determine plugin_type
        result = await session.execute(select(PluginTypeDB).where(PluginTypeDB.type_id == type_id))
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
        except Exception as e:
            logger.warning(
                f"Error cleaning up plugin {plugin_id} during unregister: {e}",
                exc_info=True,
            )
            # Continue with deletion even if cleanup fails

    # Remove from database - this must always happen, even if cleanup failed
    deleted_from_db = False
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(PluginDB).where(PluginDB.id == plugin_id))
            db_plugin = result.scalar_one_or_none()
            if db_plugin:
                logger.info(
                    f"Found plugin {plugin_id} in database (name: {db_plugin.name}, "
                    f"type: {db_plugin.type_id}, enabled: {db_plugin.enabled}), deleting..."
                )
                try:
                    # Use ORM delete as primary method
                    # The object should already be in the session from the query above
                    # Delete it - in this codebase, delete() is async and must be awaited
                    await session.delete(db_plugin)
                    # Commit the transaction (flush happens automatically)
                    await session.commit()
                    deleted_from_db = True
                    logger.info(f"Successfully deleted plugin {plugin_id} from database using ORM")

                    # Verify deletion by querying again in a new session
                    async with AsyncSessionLocal() as verify_session:
                        verify_result = await verify_session.execute(
                            select(PluginDB).where(PluginDB.id == plugin_id)
                        )
                        verify_plugin = verify_result.scalar_one_or_none()
                        if verify_plugin:
                            logger.warning(
                                f"Plugin {plugin_id} still exists after ORM deletion. "
                                "Attempting direct SQL delete as fallback."
                            )
                            # Fallback: try direct SQL delete
                            try:
                                sql_result = await verify_session.execute(
                                    text("DELETE FROM plugins WHERE id = :plugin_id"),
                                    {"plugin_id": plugin_id},
                                )
                                await verify_session.commit()
                                rows_deleted = sql_result.rowcount
                                if rows_deleted > 0:
                                    deleted_from_db = True
                                    logger.info(
                                        f"Successfully deleted {plugin_id} using direct SQL "
                                        f"fallback ({rows_deleted} row(s) deleted)"
                                    )
                                else:
                                    logger.error(
                                        f"Direct SQL delete found no rows to delete for {plugin_id}"
                                    )
                                    deleted_from_db = False
                            except Exception as sql_error:
                                logger.error(
                                    f"Direct SQL delete fallback also failed for "
                                    f"{plugin_id}: {sql_error}",
                                    exc_info=True,
                                )
                                await verify_session.rollback()
                                deleted_from_db = False
                        else:
                            logger.info(
                                f"Verified: Plugin {plugin_id} successfully removed from database"
                            )
                except Exception as e:
                    logger.error(
                        f"Error deleting plugin {plugin_id} from database using ORM: {e}",
                        exc_info=True,
                    )
                    await session.rollback()
                    # Try direct SQL delete as fallback
                    try:
                        async with AsyncSessionLocal() as fallback_session:
                            sql_result = await fallback_session.execute(
                                text("DELETE FROM plugins WHERE id = :plugin_id"),
                                {"plugin_id": plugin_id},
                            )
                            await fallback_session.commit()
                            rows_deleted = sql_result.rowcount
                            if rows_deleted > 0:
                                deleted_from_db = True
                                logger.info(
                                    f"Successfully deleted {plugin_id} using direct SQL "
                                    f"fallback ({rows_deleted} row(s) deleted)"
                                )
                            else:
                                logger.warning(
                                    f"Direct SQL delete found no rows to delete for {plugin_id}"
                                )
                    except Exception as sql_error:
                        logger.error(
                            f"Direct SQL delete fallback also failed for {plugin_id}: {sql_error}",
                            exc_info=True,
                        )
                        # Re-raise the original ORM error
                        raise
            else:
                logger.warning(f"Plugin {plugin_id} not found in database during unregister")
    except Exception as e:
        logger.error(
            f"Unexpected error during database deletion of {plugin_id}: {e}",
            exc_info=True,
        )
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
