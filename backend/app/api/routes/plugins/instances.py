"""Plugin instance management endpoints."""

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from sqlalchemy import asc, select

from app.api.routes.plugins.config import mask_sensitive_config
from app.database import AsyncSessionLocal
from app.models.db_models import PluginDB
from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/plugins/instances/{instance_id}/start")
async def start_plugin_instance(instance_id: str):
    """
    Start a plugin instance (if enabled).

    Args:
        instance_id: Plugin instance ID

    Returns:
        Success status and message
    """
    # Check if instance exists in database first
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginDB).where(PluginDB.id == instance_id))
        db_plugin = result.scalar_one_or_none()

        if not db_plugin:
            raise HTTPException(
                status_code=404, detail=f"Plugin instance {instance_id} not found in database"
            )

        if not db_plugin.enabled:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot start disabled plugin {instance_id}. Enable it first.",
            )

    # Try to get plugin from manager
    plugin = plugin_manager.get_plugin(instance_id)

    # If plugin doesn't exist in manager, create it (shouldn't happen if enabled, but handle it)
    if not plugin:
        # Create and register the plugin instance
        plugin = plugin_loader.create_plugin_instance(
            plugin_id=instance_id,
            type_id=db_plugin.type_id,
            name=db_plugin.name,
            config=db_plugin.config or {},
        )
        if plugin:
            await plugin.configure(db_plugin.config or {})
            plugin.enabled = db_plugin.enabled
            await plugin_manager.register(plugin)
        else:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Failed to create plugin instance {instance_id}. "
                    f"Plugin type {db_plugin.type_id} may not be available."
                ),
            )

    if plugin.is_running():
        return {
            "success": True,
            "message": f"Plugin {instance_id} is already running",
            "running": True,
        }

    success = await plugin_manager.start_plugin(instance_id)
    if success:
        return {
            "success": True,
            "message": f"Plugin {instance_id} started successfully",
            "running": plugin.is_running(),
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to start plugin {instance_id}")


@router.post("/plugins/instances/{instance_id}/stop")
async def stop_plugin_instance(instance_id: str):
    """
    Stop a plugin instance.

    Args:
        instance_id: Plugin instance ID

    Returns:
        Success status and message
    """
    # Check if instance exists in database first
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginDB).where(PluginDB.id == instance_id))
        db_plugin = result.scalar_one_or_none()

        if not db_plugin:
            raise HTTPException(
                status_code=404, detail=f"Plugin instance {instance_id} not found in database"
            )

    # Try to get plugin from manager
    plugin = plugin_manager.get_plugin(instance_id)

    # If plugin doesn't exist in manager, it's already stopped
    if not plugin:
        return {
            "success": True,
            "message": f"Plugin {instance_id} is already stopped (not loaded)",
            "running": False,
        }

    if not plugin.is_running():
        return {
            "success": True,
            "message": f"Plugin {instance_id} is already stopped",
            "running": False,
        }

    success = await plugin_manager.stop_plugin(instance_id)
    if success:
        return {
            "success": True,
            "message": f"Plugin {instance_id} stopped successfully",
            "running": False,
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to stop plugin {instance_id}")


@router.get("/plugins/{plugin_id}/instances")
async def get_plugin_instances(plugin_id: str):
    """
    Get all plugin instances for a plugin type, including running status.

    Args:
        plugin_id: Plugin type ID

    Returns:
        List of plugin instances with their running status
    """
    # Get instances from database, sorted by display_order
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginDB)
            .where(PluginDB.type_id == plugin_id)
            .order_by(asc(PluginDB.display_order), asc(PluginDB.name))
        )
        db_plugins = result.scalars().all()

    instances = []
    for db_plugin in db_plugins:
        # Try to get plugin instance if it exists (only enabled plugins have instances)
        plugin = plugin_manager.get_plugin(db_plugin.id)
        running = plugin.is_running() if plugin else False

        # Serialize config, converting Path objects and other non-serializable types to strings
        def serialize_value(val):
            """Recursively serialize values to JSON-serializable types."""
            if val is None:
                return None
            elif isinstance(val, str | int | float | bool):
                return val
            elif isinstance(val, Path):
                return str(val)
            elif isinstance(val, dict):
                return {k: serialize_value(v) for k, v in val.items()}
            elif isinstance(val, list):
                return [serialize_value(item) for item in val]
            else:
                # For any other type (including Path-like objects), convert to string
                try:
                    # Try to get string representation
                    if hasattr(val, "__str__"):
                        return str(val)
                    elif hasattr(val, "path"):
                        return str(val.path)
                    else:
                        return str(val)
                except Exception:
                    return "[Unable to serialize]"

        config = db_plugin.config or {}
        serialized_config = serialize_value(config)

        instances.append(
            {
                "id": db_plugin.id,
                "name": db_plugin.name,
                "enabled": db_plugin.enabled,
                "running": running,
                "config": mask_sensitive_config(serialized_config, mask_for_frontend=True),
                "display_order": db_plugin.display_order or 0,
            }
        )

    return {"instances": instances, "total": len(instances)}


@router.put("/plugins/instances/{instance_id}")
async def update_plugin_instance(instance_id: str, instance_data: dict[str, Any] = Body(...)):
    """
    Update a plugin instance (enabled status, config, etc.).

    Args:
        instance_id: Plugin instance ID (e.g., 'imap-6444', 'mealie-7040')
        instance_data: Dictionary with fields to update:
            - enabled: bool (optional) - Enable/disable instance
            - config: dict (optional) - Update instance configuration
            - name: str (optional) - Update instance name

    Returns:
        Success status and updated instance information
    """
    async with AsyncSessionLocal() as session:
        # Get instance from database
        result = await session.execute(select(PluginDB).where(PluginDB.id == instance_id))
        db_plugin = result.scalar_one_or_none()

        if not db_plugin:
            raise HTTPException(
                status_code=404, detail=f"Plugin instance {instance_id} not found in database"
            )

        # Update enabled status if provided
        enabled = instance_data.get("enabled")
        if enabled is not None:
            db_plugin.enabled = enabled

        # Update config if provided
        updated_config = None
        if "config" in instance_data:
            config = instance_data["config"]
            # Merge with existing config if it's a partial update
            if isinstance(config, dict):
                existing_config = db_plugin.config or {}
                existing_config.update(config)
                db_plugin.config = existing_config
                updated_config = existing_config

        # Update name if provided
        if "name" in instance_data:
            db_plugin.name = instance_data["name"]

        await session.commit()
        await session.refresh(db_plugin)

        # Update plugin instance in memory if it exists
        plugin = plugin_manager.get_plugin(instance_id)

        # If plugin doesn't exist in memory but is enabled in database, create it
        # (either enabled was set to True, or it was already True and we're just updating config)
        should_be_enabled = enabled if enabled is not None else db_plugin.enabled
        if not plugin and should_be_enabled:
            plugin = plugin_loader.create_plugin_instance(
                plugin_id=instance_id,
                type_id=db_plugin.type_id,
                name=db_plugin.name,
                config=db_plugin.config or {},
            )
            if plugin:
                try:
                    await plugin.configure(db_plugin.config or {})
                    plugin.enabled = db_plugin.enabled
                    await plugin_manager.register(plugin)
                    await plugin.initialize()
                    plugin.start()
                    # Register scheduled tasks for backend plugins
                    from app.plugins.protocols import BackendPlugin
                    from app.services.backend_scheduler import backend_plugin_scheduler

                    if isinstance(plugin, BackendPlugin):
                        await backend_plugin_scheduler.register_plugin_tasks(plugin)
                except Exception as e:
                    logger.error(
                        f"Error creating and starting plugin {instance_id}: {e}", exc_info=True
                    )
                    plugin = None

        if plugin:
            # Update enabled status
            if enabled is not None:
                if enabled:
                    plugin.enable()
                    # Start the plugin if it's not running
                    if not plugin.is_running():
                        try:
                            await plugin.initialize()
                            plugin.start()
                            # Register scheduled tasks for backend plugins
                            from app.plugins.protocols import BackendPlugin
                            from app.services.backend_scheduler import backend_plugin_scheduler

                            if isinstance(plugin, BackendPlugin):
                                await backend_plugin_scheduler.register_plugin_tasks(plugin)
                        except Exception as e:
                            logger.error(f"Error starting plugin {instance_id}: {e}", exc_info=True)
                else:
                    plugin.disable()
                    # Stop the plugin if it's running
                    if plugin.is_running():
                        try:
                            plugin.stop()
                            # Unregister scheduled tasks for backend plugins
                            from app.plugins.protocols import BackendPlugin
                            from app.services.backend_scheduler import backend_plugin_scheduler

                            if isinstance(plugin, BackendPlugin):
                                await backend_plugin_scheduler.unregister_plugin_tasks(instance_id)
                            await plugin.cleanup()
                        except Exception as e:
                            logger.warning(
                                f"Error stopping plugin {instance_id}: {e}", exc_info=True
                            )

            # Update config if provided
            if updated_config is not None:
                try:
                    await plugin.configure(updated_config)
                except Exception as e:
                    logger.warning(
                        f"Error updating plugin {instance_id} config: {e}", exc_info=True
                    )

        # Serialize config for response
        def serialize_value(val):
            """Recursively serialize values to JSON-serializable types."""
            if val is None:
                return None
            elif isinstance(val, str | int | float | bool):
                return val
            elif isinstance(val, Path):
                return str(val)
            elif isinstance(val, dict):
                return {k: serialize_value(v) for k, v in val.items()}
            elif isinstance(val, list):
                return [serialize_value(item) for item in val]
            else:
                try:
                    if hasattr(val, "__str__"):
                        return str(val)
                    elif hasattr(val, "path"):
                        return str(val.path)
                    else:
                        return str(val)
                except Exception:
                    return "[Unable to serialize]"

        config = db_plugin.config or {}
        serialized_config = serialize_value(config)

        # Get updated plugin reference (may have been created above)
        plugin = plugin_manager.get_plugin(instance_id)

        return {
            "success": True,
            "message": f"Plugin instance {instance_id} updated successfully",
            "instance": {
                "id": db_plugin.id,
                "name": db_plugin.name,
                "enabled": db_plugin.enabled,
                "running": plugin.is_running() if plugin else False,
                "config": mask_sensitive_config(serialized_config, mask_for_frontend=True),
                "display_order": db_plugin.display_order or 0,
            },
        }


@router.put("/plugins/{plugin_id}/instances/order")
async def update_plugin_instances_order(
    plugin_id: str, instance_orders: dict[str, int] = Body(...)
):
    """
    Update display order for plugin instances.

    Args:
        plugin_id: Plugin type ID
        instance_orders: Dictionary mapping instance IDs to their new display_order values

    Returns:
        Success status and message
    """
    async with AsyncSessionLocal() as session:
        # Get all instances for this plugin type
        result = await session.execute(select(PluginDB).where(PluginDB.type_id == plugin_id))
        db_plugins = result.scalars().all()

        # Update display_order for each instance
        updated_count = 0
        for db_plugin in db_plugins:
            if db_plugin.id in instance_orders:
                db_plugin.display_order = instance_orders[db_plugin.id]
                updated_count += 1

        if updated_count > 0:
            await session.commit()
            return {
                "success": True,
                "message": f"Updated display order for {updated_count} instance(s)",
                "updated": updated_count,
            }
        else:
            return {"success": False, "message": "No instances were updated", "updated": 0}
