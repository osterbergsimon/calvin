"""Plugin instance management endpoints."""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.api.routes.plugins.config import mask_sensitive_config
from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager
from app.plugins.utils.instance_manager import apply_plugin_config_update
from app.services.event_system import event_system

router = APIRouter()


class PluginInstanceResponse(BaseModel):
    id: str
    name: str
    enabled: bool
    running: bool
    config: dict[str, Any]
    display_order: int


class PluginInstanceListResponse(BaseModel):
    instances: list[PluginInstanceResponse]
    total: int


class PluginInstanceActionResponse(BaseModel):
    success: bool
    message: str
    running: bool


class PluginInstanceDeleteResponse(BaseModel):
    success: bool
    message: str


class PluginInstanceUpdateResponse(BaseModel):
    success: bool
    message: str
    instance: PluginInstanceResponse


class PluginInstanceOrderUpdateResponse(BaseModel):
    success: bool
    message: str
    updated: int


class PluginInstanceCreateRequest(BaseModel):
    name: str
    enabled: bool = True
    config: dict[str, Any] = {}


def _serialize_instance_config(config: dict[str, Any]) -> dict[str, Any]:
    """Serialize config values to JSON-compatible primitives."""

    def serialize_value(val):
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

    return serialize_value(config) or {}


def _build_instance_response(db_plugin: PluginDB, running: bool) -> PluginInstanceResponse:
    serialized_config = _serialize_instance_config(db_plugin.config or {})
    return PluginInstanceResponse(
        id=db_plugin.id,
        name=db_plugin.name,
        enabled=db_plugin.enabled,
        running=running,
        config=mask_sensitive_config(serialized_config, mask_for_frontend=True),
        display_order=db_plugin.display_order or 0,
    )


@router.post("/plugins/instances/{instance_id}/start", response_model=PluginInstanceActionResponse)
async def start_plugin_instance(instance_id: str):
    """
    Start a plugin instance (if enabled).

    Args:
        instance_id: Plugin instance ID

    Returns:
        Success status and message
    """
    # Check if instance exists in database first
    db_plugin = await PluginDB.objects.get_or_none(id=instance_id)

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
        # Emit plugin_instance_started event
        try:
            await event_system.emit_event(
                "plugin_instance_started",
                {
                    "instance_id": instance_id,
                    "plugin_id": db_plugin.type_id,
                    "started_at": datetime.now(UTC).isoformat(),
                },
                wait_for_handlers=False,  # Fire-and-forget
            )
            logger.debug(f"Emitted plugin_instance_started event for instance {instance_id}")
        except Exception as e:
            # Don't fail plugin start if event emission fails
            logger.warning(
                f"Failed to emit plugin_instance_started event for instance {instance_id}: {e}"
            )

        return {
            "success": True,
            "message": f"Plugin {instance_id} started successfully",
            "running": plugin.is_running(),
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to start plugin {instance_id}")


@router.post("/plugins/instances/{instance_id}/stop", response_model=PluginInstanceActionResponse)
async def stop_plugin_instance(instance_id: str):
    """
    Stop a plugin instance.

    Args:
        instance_id: Plugin instance ID

    Returns:
        Success status and message
    """
    # Check if instance exists in database first
    db_plugin = await PluginDB.objects.get_or_none(id=instance_id)

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
        # Emit plugin_instance_stopped event
        try:
            await event_system.emit_event(
                "plugin_instance_stopped",
                {
                    "instance_id": instance_id,
                    "plugin_id": db_plugin.type_id,
                    "stopped_at": datetime.now(UTC).isoformat(),
                },
                wait_for_handlers=False,  # Fire-and-forget
            )
            logger.debug(f"Emitted plugin_instance_stopped event for instance {instance_id}")
        except Exception as e:
            # Don't fail plugin stop if event emission fails
            logger.warning(
                f"Failed to emit plugin_instance_stopped event for instance {instance_id}: {e}"
            )

        return {
            "success": True,
            "message": f"Plugin {instance_id} stopped successfully",
            "running": False,
        }
    else:
        raise HTTPException(status_code=500, detail=f"Failed to stop plugin {instance_id}")


@router.get("/plugins/{plugin_id}/instances", response_model=PluginInstanceListResponse)
async def get_plugin_instances(plugin_id: str):
    """
    Get all plugin instances for a plugin type, including running status.

    Args:
        plugin_id: Plugin type ID

    Returns:
        List of plugin instances with their running status
    """
    # Get instances from database, sorted by display_order
    db_plugins = (
        await PluginDB.objects.filter(type_id=plugin_id).order_by(["display_order", "name"]).all()
    )

    instances = []
    for db_plugin in db_plugins:
        # Try to get plugin instance if it exists (only enabled plugins have instances)
        plugin = plugin_manager.get_plugin(db_plugin.id)
        running = plugin.is_running() if plugin else False

        # Serialize config, converting Path objects and other non-serializable types to strings
        instances.append(_build_instance_response(db_plugin, running).model_dump())

    return {"instances": instances, "total": len(instances)}


@router.delete("/plugins/instances/{instance_id}", response_model=PluginInstanceDeleteResponse)
async def delete_plugin_instance(instance_id: str):
    db_plugin = await PluginDB.objects.get_or_none(id=instance_id)

    if not db_plugin:
        raise HTTPException(
            status_code=404, detail=f"Plugin instance {instance_id} not found in database"
        )

    plugin = plugin_manager.get_plugin(instance_id)
    if plugin:
        if plugin.is_running():
            try:
                plugin.stop()
                from app.plugins.protocols import BackendPlugin
                from app.services.backend_scheduler import backend_plugin_scheduler

                if isinstance(plugin, BackendPlugin):
                    await backend_plugin_scheduler.unregister_plugin_tasks(instance_id)
                await plugin.cleanup()
            except Exception as e:
                logger.warning(f"Error stopping plugin {instance_id} during delete: {e}")
        await plugin_manager.unregister(instance_id)

    type_id = db_plugin.type_id
    await db_plugin.delete()

    try:
        await event_system.emit_event(
            "plugin_instance_deleted",
            {
                "instance_id": instance_id,
                "plugin_id": type_id,
                "deleted_at": datetime.now(UTC).isoformat(),
            },
            wait_for_handlers=False,
        )
    except Exception as e:
        logger.warning(f"Failed to emit plugin_instance_deleted event for {instance_id}: {e}")

    return {"success": True, "message": f"Plugin instance {instance_id} deleted successfully"}


@router.post("/plugins/{plugin_id}/instances", response_model=PluginInstanceUpdateResponse)
async def create_plugin_instance(
    plugin_id: str,
    request: PluginInstanceCreateRequest,
):
    """
    Create a plugin instance via an explicit instance lifecycle endpoint.

    The typed payload is translated into the config-update metadata fields
    understood by the generic instance manager.
    """
    if plugin_loader.get_plugin_class(plugin_id) is None:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    instance_config = {
        **request.config,
        "_instance_name": request.name,
        "_instance_enabled": request.enabled,
    }

    db_plugin_type = await PluginTypeDB.objects.get_or_none(type_id=plugin_id)

    try:
        result = await apply_plugin_config_update(plugin_id, instance_config, None, db_plugin_type)
    except Exception as e:
        logger.exception("Instance creation failed for plugin type {}", plugin_id)
        raise HTTPException(status_code=500, detail=f"Failed to create instance: {e}")

    created_instance_id = result.get("instance_id") if result else None
    if not created_instance_id:
        raise HTTPException(status_code=400, detail="Plugin did not create an instance")

    db_plugin = await PluginDB.objects.get_or_none(id=created_instance_id)
    if not db_plugin:
        raise HTTPException(status_code=500, detail="Created plugin instance not found in database")

    plugin = plugin_manager.get_plugin(created_instance_id)
    instance = _build_instance_response(db_plugin, plugin.is_running() if plugin else False)
    return {
        "success": True,
        "message": f"Plugin instance {created_instance_id} created successfully",
        "instance": instance,
    }


@router.put("/plugins/instances/{instance_id}", response_model=PluginInstanceUpdateResponse)
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
    # Get instance from database
    db_plugin = await PluginDB.objects.get_or_none(id=instance_id)

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
            # Ormar JSON fields detect changes automatically
            existing_config = dict(db_plugin.config or {})
            existing_config.update(config)
            db_plugin.config = existing_config
            updated_config = existing_config

    # Update name if provided
    if "name" in instance_data:
        db_plugin.name = instance_data["name"]

    await db_plugin.save_with_timestamp()

    # Update plugin instance in memory if it exists
    plugin = plugin_manager.get_plugin(instance_id)

    # Track if this is a new instance creation
    was_new_instance = False

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
            was_new_instance = True
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

                # Emit plugin_instance_created event
                try:
                    await event_system.emit_event(
                        "plugin_instance_created",
                        {
                            "instance_id": instance_id,
                            "plugin_id": db_plugin.type_id,
                            "name": db_plugin.name,
                            "created_at": datetime.now(UTC).isoformat(),
                        },
                        wait_for_handlers=False,  # Fire-and-forget
                    )
                    logger.debug(
                        f"Emitted plugin_instance_created event for instance {instance_id}"
                    )
                except Exception as e:
                    # Don't fail instance creation if event emission fails
                    logger.warning(
                        f"Failed to emit plugin_instance_created event "
                        f"for instance {instance_id}: {e}"
                    )
            except Exception:
                logger.exception("Error creating and starting plugin {}", instance_id)
                plugin = None

    if plugin:
        # Update enabled status
        if enabled is not None:
            if enabled:
                plugin.enable()
                # Start the plugin if it's not running
                # Skip initialize/start if plugin was just created (already done above)
                if not plugin.is_running() and not was_new_instance:
                    try:
                        await plugin.initialize()
                        plugin.start()
                        # Register scheduled tasks for backend plugins
                        from app.plugins.protocols import BackendPlugin
                        from app.services.backend_scheduler import backend_plugin_scheduler

                        if isinstance(plugin, BackendPlugin):
                            await backend_plugin_scheduler.register_plugin_tasks(plugin)
                    except Exception:
                        logger.exception("Error starting plugin {}", instance_id)
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
                    except Exception:
                        logger.opt(exception=True).warning("Error stopping plugin {}", instance_id)

        # Update config if provided
        if updated_config is not None:
            try:
                await plugin.configure(updated_config)
            except Exception:
                logger.opt(exception=True).warning("Error updating plugin {} config", instance_id)

    # Emit plugin_instance_updated event if instance was updated (but not newly created)
    if (
        plugin
        and not was_new_instance
        and (enabled is not None or updated_config is not None or "name" in instance_data)
    ):
        try:
            changes = {}
            if enabled is not None:
                changes["enabled"] = enabled
            if updated_config is not None:
                changes["config"] = updated_config
            if "name" in instance_data:
                changes["name"] = instance_data["name"]

            await event_system.emit_event(
                "plugin_instance_updated",
                {
                    "instance_id": instance_id,
                    "plugin_id": db_plugin.type_id,
                    "changes": changes,
                    "updated_at": datetime.now(UTC).isoformat(),
                },
                wait_for_handlers=False,  # Fire-and-forget
            )
            logger.debug(f"Emitted plugin_instance_updated event for instance {instance_id}")
        except Exception as e:
            # Don't fail instance update if event emission fails
            logger.warning(
                f"Failed to emit plugin_instance_updated event for instance {instance_id}: {e}"
            )

    # Get updated plugin reference (may have been created above)
    plugin = plugin_manager.get_plugin(instance_id)
    instance = _build_instance_response(db_plugin, plugin.is_running() if plugin else False)

    return {
        "success": True,
        "message": f"Plugin instance {instance_id} updated successfully",
        "instance": instance,
    }


@router.put(
    "/plugins/{plugin_id}/instances/order",
    response_model=PluginInstanceOrderUpdateResponse,
)
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
    # Get all instances for this plugin type
    db_plugins = await PluginDB.objects.filter(type_id=plugin_id).all()

    # Update display_order for each instance
    updated_count = 0
    for db_plugin in db_plugins:
        if db_plugin.id in instance_orders:
            db_plugin.display_order = instance_orders[db_plugin.id]
            await db_plugin.save_with_timestamp()
            updated_count += 1

    if updated_count > 0:
        return {
            "success": True,
            "message": f"Updated display order for {updated_count} instance(s)",
            "updated": updated_count,
        }
    else:
        return {"success": False, "message": "No instances were updated", "updated": 0}
