"""Plugin management endpoints - CRUD operations, installation, and actions."""

import asyncio
import json
import shutil
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile
from loguru import logger

from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.base import PluginType
from app.plugins.hooks import plugin_manager as hook_manager
from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager
from app.services.config_service import config_service
from app.services.event_system import event_system
from app.services.plugin_installer import frontend_build_manager, plugin_installer
from app.services.theme_installer import theme_installer

from .themes import BUILTIN_THEMES, _unregister_theme_from_db

router = APIRouter()


@router.get("/plugins")
async def get_plugins(
    plugin_type: str | None = Query(None, description="Optional plugin type filter"),
):
    """
    Get all plugin types, optionally filtered by type.

    Args:
        plugin_type: Optional plugin type filter
            ('calendar', 'image', 'service', 'theme', 'backend')

    Returns:
        List of plugin types with their common configuration
    """
    # Normalize plugin_type: treat empty string as None
    if plugin_type == "":
        plugin_type = None

    # Parse plugin type if provided
    pt = None
    include_themes = False
    only_themes = False
    if plugin_type:
        plugin_type_lower = plugin_type.lower()
        try:
            pt = PluginType(plugin_type_lower)
            if pt == PluginType.THEME:
                only_themes = True
                include_themes = True
        except ValueError:
            valid_types = "calendar, image, service, theme, backend"
            raise HTTPException(
                status_code=400,
                detail=f"Invalid plugin type: {plugin_type}. Valid types: {valid_types}",
            )

    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()

    # Filter out test plugins
    plugin_types = [t for t in plugin_types if not t.get("type_id", "").startswith("test_")]

    # Filter by plugin type if specified
    if pt:
        plugin_types = [t for t in plugin_types if t.get("plugin_type") == pt]

    # Load enabled status and error messages from database
    try:
        db_types_list = await PluginTypeDB.objects.all()
        db_types = {db_type.type_id: db_type for db_type in db_types_list}
    except Exception as e:
        logger.error(
            f"[get_plugins] Failed to load plugin types from database: {e}. "
            "This may indicate missing tables. Check database initialization.",
            exc_info=True,
        )
        # Continue with empty dict - app won't crash but plugins won't load
        db_types = {}

    # Convert to response format
    result = []
    # Only add regular plugins if not filtering for themes only
    if not only_themes:
        for type_info in plugin_types:
            type_id = type_info.get("type_id")
            plugin_type_enum = type_info.get("plugin_type")

            # Get plugin type info from database (including error messages)
            db_type = db_types.get(type_id)
            enabled = db_type.enabled if db_type else True  # Default to enabled
            error_message = db_type.error_message if db_type else None

            # Merge plugin metadata common_config_schema with database common_config_schema
            # This ensures user-set values (like display_order) are preserved
            metadata_schema = type_info.get("common_config_schema", {}) or {}
            db_schema = (
                db_type.common_config_schema if db_type and db_type.common_config_schema else {}
            )
            # Only override keys that are defined in the plugin's own metadata schema —
            # prevents instance config fields that leaked into db_schema from showing here.
            merged_schema = {**metadata_schema}
            for key in metadata_schema:
                if key in db_schema:
                    merged_schema[key] = db_schema[key]

            plugin_info: dict[str, Any] = {
                "id": type_id,
                "name": type_info.get("name", ""),
                "type": plugin_type_enum.value
                if hasattr(plugin_type_enum, "value")
                else str(plugin_type_enum),
                "description": type_info.get("description", ""),
                "config_schema": merged_schema,  # Legacy name
                "common_config_schema": merged_schema,  # Also send as common_config_schema for frontend
                "instance_config_schema": type_info.get("instance_config_schema", {}),
                "enabled": enabled,
                "ui_actions": type_info.get("ui_actions", []),  # Plugin-specific actions (buttons)
                # Plugin-specific sections (upload, manage, etc.)
                "ui_sections": type_info.get("ui_sections", []),
                # Whether plugin supports multiple instances
                # (defaults to True for backward compatibility)
                "supports_multiple_instances": type_info.get("supports_multiple_instances", True),
                # Human-readable label for a single instance (e.g. "Location", "Device")
                "instance_label": type_info.get("instance_label"),
            }

            # Include error message if plugin is broken
            if error_message:
                plugin_info["error_message"] = error_message

            result.append(plugin_info)

    # Add themes from filesystem (no longer stored in database)
    # Include themes when:
    # 1. Explicitly requested (plugin_type == "theme")
    # 2. No filter specified (plugin_type is None) - show all types including themes
    if include_themes or plugin_type is None:
        try:
            # Get built-in themes from BUILTIN_THEMES
            for theme_id, theme_manifest in BUILTIN_THEMES.items():
                theme_entry = {
                    "id": theme_id,
                    "name": theme_manifest.get("name", theme_id),
                    "type": PluginType.THEME.value,
                    "description": theme_manifest.get("description", ""),
                    "config_schema": {},
                    "instance_config_schema": {},
                    "enabled": True,  # Built-in themes are always enabled
                    "ui_actions": [],
                    "ui_sections": [],
                    "supports_multiple_instances": False,
                    "is_builtin": True,
                    "version": theme_manifest.get("version", "1.0.0"),
                }
                result.append(theme_entry)

            # Get installed themes from filesystem
            installed_themes = theme_installer.get_installed_themes()
            for theme_manifest in installed_themes:
                theme_id = theme_manifest.get("id")
                if not theme_id:
                    continue

                # Skip if already added as built-in
                if theme_id in BUILTIN_THEMES:
                    continue

                theme_entry = {
                    "id": theme_id,
                    "name": theme_manifest.get("name", theme_id),
                    "type": PluginType.THEME.value,
                    "description": theme_manifest.get("description", ""),
                    "config_schema": {},
                    "instance_config_schema": {},
                    "enabled": True,  # Installed themes are enabled by default
                    "ui_actions": [],
                    "ui_sections": [],
                    "supports_multiple_instances": False,
                    "is_builtin": False,
                    "version": theme_manifest.get("version", "1.0.0"),
                }
                result.append(theme_entry)
        except Exception as e:
            logger.error(f"[get_plugins] Error including themes: {e}", exc_info=True)

    return {"plugins": result, "total": len(result)}


# Specific routes must come before parameterized routes to avoid path conflicts
@router.get("/plugins/rebuild-status")
async def get_rebuild_status():
    """Return the current state of a background frontend rebuild."""
    return {
        "state": frontend_build_manager.state,
        "message": frontend_build_manager.message,
    }


@router.get("/plugins/installed")
async def get_installed_plugins():
    """
    Get list of installed plugins and themes.

    Returns:
        List of installed plugin and theme manifests
    """
    try:
        plugins = plugin_installer.get_installed_plugins()
        # Remove internal path from response
        for plugin in plugins:
            plugin.pop("_installed_path", None)

        # Also include installed themes
        themes = theme_installer.get_installed_themes()
        # Remove internal path from response
        for theme in themes:
            theme.pop("_installed_path", None)
            # Add type field to distinguish from plugins
            theme["type"] = PluginType.THEME.value

        return {"plugins": plugins + themes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get installed plugins: {str(e)}")


@router.post("/plugins/inspect")
async def inspect_plugin(file: UploadFile = File(...)):
    """
    Read plugin.json from a zip without installing it.

    Returns the manifest so the caller can check python_dependencies and
    show a security warning before committing to an install.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = Path(temp_file.name)

        manifest = plugin_installer.validate_plugin_package(temp_path)
        return {"manifest": manifest}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except (PermissionError, OSError):
                pass


@router.post("/plugins/install")
async def install_plugin(
    file: UploadFile = File(...),
    plugin_id: str | None = None,
):
    """
    Install a plugin from a zip file or directory.

    Args:
        file: Plugin package zip file
        plugin_id: Optional plugin ID override

    Returns:
        Plugin manifest
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Save uploaded file to temporary location
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_file:
            # Write uploaded file to temp file
            shutil.copyfileobj(file.file, temp_file)
            temp_path = Path(temp_file.name)

        # Install plugin
        try:
            manifest = plugin_installer.install_plugin(temp_path, plugin_id)

            # Reload plugins to include the newly installed one
            plugin_loader.load_installed_plugins()

            # Emit plugin_installed event
            try:
                await event_system.emit_event(
                    "plugin_installed",
                    {
                        "plugin_id": manifest["id"],
                        "plugin_type": manifest.get("type", "unknown"),
                        "version": manifest.get("version", "unknown"),
                        "installed_at": datetime.now(UTC).isoformat(),
                    },
                    wait_for_handlers=False,  # Fire-and-forget
                )
                logger.debug(f"Emitted plugin_installed event for plugin {manifest['id']}")
            except Exception as e:
                # Don't fail plugin installation if event emission fails
                logger.warning(
                    f"Failed to emit plugin_installed event for plugin {manifest['id']}: {e}"
                )

            if manifest.get("_has_frontend"):
                frontend_build_manager.start_background_build(plugin_installer.get_frontend_dir())

            return {
                "success": True,
                "message": f"Plugin {manifest['id']} installed successfully",
                "manifest": manifest,
                "requires_restart": True,
                "frontend_rebuild_in_progress": manifest.get("_has_frontend", False),
            }
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to install plugin: {str(e)}")
    finally:
        # Clean up temp file
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except (PermissionError, OSError):
                # File might be locked on Windows, ignore
                pass


@router.get("/plugins/installed/{plugin_id}")
async def get_installed_plugin(plugin_id: str):
    """
    Get manifest for an installed plugin.

    Args:
        plugin_id: Plugin identifier

    Returns:
        Plugin manifest
    """
    manifest = plugin_installer.get_plugin_manifest(plugin_id)
    if not manifest:
        raise HTTPException(status_code=404, detail=f"Plugin {plugin_id} not found")
    return manifest


@router.delete("/plugins/installed/{plugin_id}")
async def uninstall_plugin(plugin_id: str):
    """
    Uninstall a plugin or theme.

    Args:
        plugin_id: Plugin/theme identifier

    Returns:
        Success message
    """
    try:
        # Check if it's a theme by checking database
        db_type = await PluginTypeDB.objects.get_or_none(type_id=plugin_id)

        plugin_type_str = None
        if db_type:
            plugin_type_str = db_type.plugin_type

        if db_type and db_type.plugin_type == PluginType.THEME.value:
            # Uninstall theme
            theme_installer.uninstall_theme(plugin_id)
            # Remove theme from database
            await _unregister_theme_from_db(plugin_id)

            # Emit plugin_uninstalled event
            try:
                await event_system.emit_event(
                    "plugin_uninstalled",
                    {
                        "plugin_id": plugin_id,
                        "plugin_type": PluginType.THEME.value,
                        "uninstalled_at": datetime.now(UTC).isoformat(),
                    },
                    wait_for_handlers=False,  # Fire-and-forget
                )
                logger.debug(f"Emitted plugin_uninstalled event for theme {plugin_id}")
            except Exception as e:
                # Don't fail plugin uninstallation if event emission fails
                logger.warning(
                    f"Failed to emit plugin_uninstalled event for theme {plugin_id}: {e}"
                )

            return {
                "success": True,
                "message": f"Theme {plugin_id} uninstalled successfully",
            }
        else:
            # Uninstall regular plugin
            plugin_installer.uninstall_plugin(plugin_id)

            # Stop and delete all instances of this plugin type
            db_instances = await PluginDB.objects.filter(type_id=plugin_id).all()
            for db_instance in db_instances:
                plugin = plugin_manager.get_plugin(db_instance.id)
                if plugin:
                    if plugin.is_running():
                        try:
                            plugin.stop()
                            from app.plugins.protocols import BackendPlugin
                            from app.services.backend_scheduler import backend_plugin_scheduler

                            if isinstance(plugin, BackendPlugin):
                                await backend_plugin_scheduler.unregister_plugin_tasks(
                                    db_instance.id
                                )
                            await plugin.cleanup()
                        except Exception as e:
                            logger.warning(
                                f"Error stopping instance {db_instance.id} during uninstall: {e}"
                            )
                    await plugin_manager.unregister(db_instance.id)
                await db_instance.delete()
                logger.info(f"Removed plugin instance {db_instance.id} from database")

            # Remove plugin from database (plugin_types table)
            # Only remove if it exists in the database
            # This ensures the plugin won't show up after uninstalling
            if db_type:
                await db_type.delete()
                logger.info(f"Removed plugin {plugin_id} from database")

            # Unregister the plugin module from pluggy so it no longer appears in get_plugin_types()
            module_name = f"installed_plugin_{plugin_id}"
            registered_module = sys.modules.get(module_name)
            if registered_module is not None:
                try:
                    hook_manager.unregister(registered_module)
                except Exception as e:
                    logger.warning(f"Failed to unregister plugin hook for {plugin_id}: {e}")
                del sys.modules[module_name]

            plugin_loader._loaded_modules = {
                m
                for m in plugin_loader._loaded_modules
                if not m.startswith(f"installed_plugin_{plugin_id}")
            }

            # Emit plugin_uninstalled event
            try:
                await event_system.emit_event(
                    "plugin_uninstalled",
                    {
                        "plugin_id": plugin_id,
                        "plugin_type": plugin_type_str or "unknown",
                        "uninstalled_at": datetime.now(UTC).isoformat(),
                    },
                    wait_for_handlers=False,  # Fire-and-forget
                )
                logger.debug(f"Emitted plugin_uninstalled event for plugin {plugin_id}")
            except Exception as e:
                # Don't fail plugin uninstallation if event emission fails
                logger.warning(
                    f"Failed to emit plugin_uninstalled event for plugin {plugin_id}: {e}"
                )

            return {
                "success": True,
                "message": f"Plugin {plugin_id} uninstalled successfully",
            }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to uninstall plugin: {str(e)}")


@router.get("/plugins/{plugin_id}")
async def get_plugin(plugin_id: str):
    """Get a specific plugin type or theme by ID."""
    # Validate plugin_id - reject invalid values that indicate frontend bugs
    if (
        not plugin_id
        or plugin_id.strip() == ""
        or plugin_id.lower() in ("none", "null", "undefined")
    ):
        logger.warning(f"Invalid plugin_id received: {plugin_id} | Path: /api/plugins/{plugin_id}")
        raise HTTPException(status_code=400, detail=f"Invalid plugin ID: {plugin_id}")

    # Check if it's a theme first (check built-in, then database, then installed)
    theme_manifest = None

    # Check built-in themes first
    if plugin_id in BUILTIN_THEMES:
        theme_manifest = BUILTIN_THEMES.get(plugin_id)
    else:
        # Check database
        db_type = await PluginTypeDB.objects.get_or_none(type_id=plugin_id)

        if db_type and db_type.plugin_type == PluginType.THEME.value:
            # It's a theme in database - try to get manifest
            try:
                theme_manifest = theme_installer.get_theme_manifest(plugin_id)
            except Exception:
                pass

    # If still not found, try installed themes (might not be in DB yet)
    if not theme_manifest:
        try:
            theme_manifest = theme_installer.get_theme_manifest(plugin_id)
        except Exception:
            pass

    if theme_manifest:
        # Remove internal path if present
        theme_manifest.pop("_installed_path", None)
        return theme_manifest

    # Not a theme - get plugin type from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Get enabled status and error message from database
    db_type = await PluginTypeDB.objects.get_or_none(type_id=plugin_id)

    enabled = db_type.enabled if db_type else True
    error_message = db_type.error_message if db_type else None

    # Merge plugin metadata common_config_schema with database common_config_schema
    # This ensures user-set values (like display_order) are preserved
    metadata_schema = type_info.get("common_config_schema", {}) or {}
    db_schema = db_type.common_config_schema if db_type and db_type.common_config_schema else {}
    # Only override keys that are defined in the plugin's own metadata schema —
    # prevents instance config fields that leaked into db_schema from showing here.
    merged_schema = {**metadata_schema}
    for key in metadata_schema:
        if key in db_schema:
            merged_schema[key] = db_schema[key]

    plugin_info: dict[str, Any] = {
        "id": type_info.get("type_id"),
        "name": type_info.get("name", ""),
        "type": type_info.get("plugin_type").value
        if hasattr(type_info.get("plugin_type"), "value")
        else str(type_info.get("plugin_type")),
        "description": type_info.get("description", ""),
        "config_schema": merged_schema,
        "display_schema": type_info.get("display_schema"),
        "statusbar_schema": type_info.get("statusbar_schema"),
        "enabled": enabled,
    }

    # Include error message if plugin is broken
    if error_message:
        plugin_info["error_message"] = error_message

    return plugin_info


@router.put("/plugins/{plugin_id}")
async def update_plugin(plugin_id: str, config: dict[str, Any]):
    """
    Update plugin type common configuration and enabled status.

    This endpoint ONLY handles plugin types, not instances.
    For instance updates, use PUT /plugins/instances/{instance_id}

    Args:
        plugin_id: Plugin type ID (e.g., 'google', 'ical', 'local', 'light', 'midnight')
        config: Configuration dictionary with common settings and/or enabled status
    """
    logger.debug(f"Updating plugin type {plugin_id} with config keys: {list(config.keys())}")

    # Handle enabled status separately
    enabled = None
    if "enabled" in config:
        enabled = config["enabled"]
        # Remove enabled from config dict to avoid storing it in config
        config = {k: v for k, v in config.items() if k != "enabled"}

    # Clean config values - ensure all values are strings, not objects
    cleaned_config = {}
    for key, value in config.items():
        if isinstance(value, dict):
            # If it's a schema object, extract the actual value or default
            cleaned_value = value.get("value") or value.get("default") or ""
            cleaned_config[key] = cleaned_value
        elif isinstance(value, Path):
            # Handle Path objects - convert to string
            cleaned_config[key] = str(value)
        elif value is None:
            cleaned_config[key] = ""
        else:
            cleaned_config[key] = str(value)

    config = cleaned_config

    # Get plugin type from pluggy hooks first
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        # Check if it might be an instance ID to provide helpful error
        db_plugin_instance = await PluginDB.objects.get_or_none(id=plugin_id)
        if db_plugin_instance:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{plugin_id}' is a plugin instance ID, not a plugin type ID. "
                    f"Use PUT /plugins/instances/{plugin_id} to update instances."
                ),
            )
        raise HTTPException(
            status_code=404,
            detail=(
                f"Plugin type '{plugin_id}' not found. "
                f"If '{plugin_id}' is an instance ID, use PUT /plugins/instances/{plugin_id}"
            ),
        )

    # Check if it's a theme first (themes use type_id directly)
    db_type = await PluginTypeDB.objects.get_or_none(type_id=plugin_id)

    if db_type and db_type.plugin_type == PluginType.THEME.value:
        # It's a theme - handle enabled status only (themes don't have config)
        if enabled is not None:
            previous_enabled = db_type.enabled
            db_type.enabled = enabled
            await db_type.save_with_timestamp()

            # Emit plugin_enabled or plugin_disabled events if enabled status changed
            if previous_enabled is not None and previous_enabled != enabled:
                event_type = "plugin_enabled" if enabled else "plugin_disabled"
                try:
                    await event_system.emit_event(
                        event_type,
                        {
                            "plugin_id": plugin_id,
                            "plugin_type": PluginType.THEME.value,
                            f"{'enabled' if enabled else 'disabled'}_at": datetime.now(
                                UTC
                            ).isoformat(),
                        },
                        wait_for_handlers=False,  # Fire-and-forget
                    )
                    logger.debug(f"Emitted {event_type} event for theme {plugin_id}")
                except Exception as e:
                    # Don't fail plugin update if event emission fails
                    logger.warning(f"Failed to emit {event_type} event for theme {plugin_id}: {e}")

            return {"success": True, "enabled": enabled}
        else:
            # No enabled status to update
            return {"success": True}

    # Store previous enabled state for event emission
    previous_enabled = None
    if db_type:
        previous_enabled = db_type.enabled

    # If not found as plugin type, create it
    if not db_type:
        # Create new plugin type in database
        plugin_type = type_info.get("plugin_type")
        # Only store keys that are defined in the plugin's own common_config_schema
        metadata_schema = type_info.get("common_config_schema", {}) or {}
        allowed_keys = set(metadata_schema.keys())
        filtered_config = {k: v for k, v in config.items() if k in allowed_keys} if config else {}
        initial_schema = {**metadata_schema, **filtered_config}
        logger.debug(
            f"Creating new plugin type {plugin_id} with schema: {initial_schema}, "
            f"config={config}, metadata_schema={metadata_schema}"
        )
        db_type = await PluginTypeDB.objects.create(
            type_id=plugin_id,
            plugin_type=plugin_type.value if hasattr(plugin_type, "value") else str(plugin_type),
            name=type_info.get("name", ""),
            description=type_info.get("description", ""),
            version=type_info.get("version"),
            common_config_schema=initial_schema,
            enabled=enabled if enabled is not None else True,
        )
    else:
        # Update existing plugin type
        if enabled is not None:
            db_type.enabled = enabled
        if config:
            current_schema = db_type.common_config_schema or {}
            # Only allow keys defined in the plugin's own common_config_schema —
            # prevents instance config fields from leaking into the type-level schema.
            metadata_schema = type_info.get("common_config_schema", {}) or {}
            allowed_keys = set(metadata_schema.keys())
            filtered_config = {k: v for k, v in config.items() if k in allowed_keys}
            updated_schema = {**current_schema, **filtered_config}
            db_type.common_config_schema = updated_schema
            logger.debug(
                f"Updated plugin {plugin_id} common_config_schema: "
                f"old={current_schema}, new={updated_schema}, config={config}"
            )
        await db_type.save_with_timestamp()

    # Save common config to config service for backward compatibility
    if config:
        config_key = f"plugin_{plugin_id}_config"
        serializable_config = {}
        for key, value in config.items():
            if isinstance(value, Path):
                serializable_config[key] = str(value)
            elif isinstance(value, dict):
                serializable_config[key] = value.get("value") or value.get("default") or ""
            else:
                serializable_config[key] = value
        config_json = json.dumps(serializable_config)
        await config_service.set_value(config_key, config_json)

    # Call plugin-specific config update handlers (if any)
    hook_config = cleaned_config.copy()
    update_coroutines = hook_manager.hook.handle_plugin_config_update(
        type_id=plugin_id,
        config=hook_config,
        enabled=enabled,
        db_type=db_type,
        session=None,  # No session needed with Ormar
    )
    await asyncio.gather(*update_coroutines, return_exceptions=True)

    # Emit plugin_enabled or plugin_disabled events if enabled status changed
    if enabled is not None and previous_enabled is not None and previous_enabled != enabled:
        # Get plugin type as string
        plugin_type_enum = type_info.get("plugin_type")
        plugin_type_str = (
            plugin_type_enum.value if hasattr(plugin_type_enum, "value") else str(plugin_type_enum)
        )

        event_type = "plugin_enabled" if enabled else "plugin_disabled"
        try:
            await event_system.emit_event(
                event_type,
                {
                    "plugin_id": plugin_id,
                    "plugin_type": plugin_type_str,
                    f"{'enabled' if enabled else 'disabled'}_at": datetime.now(UTC).isoformat(),
                },
                wait_for_handlers=False,  # Fire-and-forget
            )
            logger.debug(f"Emitted {event_type} event for plugin {plugin_id}")
        except Exception as e:
            # Don't fail plugin update if event emission fails
            logger.warning(f"Failed to emit {event_type} event for plugin {plugin_id}: {e}")

    return {
        "message": "Plugin type configuration updated",
        "plugin_id": plugin_id,
    }


@router.post("/plugins/{plugin_id}/fetch")
async def fetch_plugin(plugin_id: str):
    """
    Manually trigger plugin fetch/check operation.

    Uses plugin hooks to allow plugins to implement their own fetch logic.

    Args:
        plugin_id: Plugin type ID (e.g., 'imap')

    Returns:
        Fetch result with success status, message, and details
    """
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Call plugin-specific fetch handlers via hooks
    # Pluggy returns a list of coroutines for async hooks, we need to await them
    fetch_coroutines = hook_manager.hook.fetch_plugin_data(
        type_id=plugin_id,
        instance_id=None,
    )
    fetch_results = await asyncio.gather(*fetch_coroutines, return_exceptions=True)

    # Check if any plugin handled the fetch
    for result in fetch_results:
        # Skip exceptions (they're wrapped in the result)
        if isinstance(result, Exception):
            continue
        if result is not None:
            return result

    # Default: plugin doesn't support fetching
    return {
        "success": False,
        "message": "This plugin type does not support manual fetch",
        "images_downloaded": False,
        "image_count": 0,
    }


@router.get("/plugins/{plugin_id}/scan")
async def scan_plugin_options(
    plugin_id: str, field: str = Query(..., description="Config field key to scan options for")
):
    """
    Scan/discover available options for a plugin config field.

    Args:
        plugin_id: Plugin type ID (e.g., 'chromecast')
        field: Config field key to scan (e.g., 'device_name')

    Returns:
        Dict with 'options' list of {value, label} dicts
    """
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    scan_coroutines = hook_manager.hook.scan_plugin_options(
        type_id=plugin_id,
        field_key=field,
    )
    results = await asyncio.gather(*scan_coroutines, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            continue
        if result is not None:
            return result

    return {"options": [], "error": "Plugin does not support option scanning for this field"}


@router.get("/plugins/{plugin_id}/data")
async def get_plugin_data(
    plugin_id: str,
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
):
    """
    Get data from a service plugin instance.

    This is a generic endpoint that works for all service plugins that implement
    the fetch_service_data() method (e.g., weather plugins).

    Args:
        plugin_id: Plugin instance ID
        start_date: Optional start date (plugin-specific)
        end_date: Optional end date (plugin-specific)

    Returns:
        Plugin data (format depends on plugin type)
    """
    from app.models.db_models import PluginDB
    from app.plugins.protocols import ServicePlugin

    # Get the plugin instance
    db_plugin = await PluginDB.objects.get_or_none(id=plugin_id)

    if not db_plugin:
        raise HTTPException(status_code=404, detail="Plugin instance not found")

    # Get plugin instance from manager
    plugin_instance = plugin_manager.get_plugin(plugin_id)
    if not plugin_instance or not isinstance(plugin_instance, ServicePlugin):
        raise HTTPException(
            status_code=404, detail="Service plugin instance not found or not a service plugin"
        )

    # Ensure plugin is initialized and running
    if not plugin_instance.is_running():
        try:
            await plugin_instance.initialize()
            plugin_instance.start()
        except Exception as e:
            logger.error(f"Error initializing plugin {plugin_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to initialize plugin: {str(e)}")

    # Try hook-based data fetching first (for external plugins)
    try:
        hook_coroutines = hook_manager.hook.fetch_service_data(
            instance_id=plugin_id, start_date=start_date, end_date=end_date
        )
        # Process hook results (pluggy returns a list of coroutines)
        if hook_coroutines:
            hook_results = await asyncio.gather(*hook_coroutines, return_exceptions=True)
            # Check if any plugin handled the fetch
            for result in hook_results:
                # Skip exceptions
                if isinstance(result, Exception):
                    continue
                if result is not None:
                    return result
    except Exception as e:
        logger.debug(f"Hook-based fetch_service_data failed for {plugin_id}: {e}")

    # Fall back to protocol method (for built-in plugins)
    try:
        data = await plugin_instance.fetch_service_data(start_date=start_date, end_date=end_date)
        if data is not None:
            return data
    except Exception as e:
        logger.error(f"Error calling fetch_service_data for {plugin_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch plugin data: {str(e)}")

    # If plugin returned None, it doesn't support data fetching
    raise HTTPException(
        status_code=501,
        detail="This plugin does not support data fetching via this endpoint",
    )


@router.post("/plugins/{plugin_id}/geocode")
async def geocode_location(plugin_id: str, request: dict[str, Any] = Body(...)):
    """
    Geocode a location name to coordinates using OpenStreetMap Nominatim API.

    This endpoint is used by plugins (e.g., Yr.no weather) to convert location
    names to latitude/longitude coordinates.

    Args:
        plugin_id: Plugin instance ID
        request: Request body with "location" field

    Returns:
        Dictionary with latitude, longitude, and display_name
    """
    location = request.get("location", "").strip()
    if not location:
        raise HTTPException(status_code=400, detail="Location is required")

    # Verify plugin type (optional - allow geocoding even if plugin instance doesn't exist yet)
    # This allows users to geocode before saving the plugin configuration
    # Check if plugin exists and is yr_weather type
    db_plugin = await PluginDB.objects.get_or_none(id=plugin_id)

    # If plugin exists, verify it's the right type
    if db_plugin and db_plugin.type_id != "yr_weather":
        raise HTTPException(
            status_code=400, detail="Geocoding is only available for Yr.no weather plugins"
        )

    # If plugin doesn't exist, check if the plugin_id matches the expected pattern
    # This allows geocoding for new plugin instances before they're saved
    # We'll allow it if the plugin_id looks like it could be a yr_weather plugin
    # (starts with 'yr_weather' or is just 'yr_weather')
    if not db_plugin:
        # Allow geocoding for new instances - we'll validate the location instead
        pass

    try:
        # Use OpenStreetMap Nominatim API (free, no API key required)
        # Per usage policy: https://operations.osmfoundation.org/policies/nominatim/
        # We must include a User-Agent header
        headers = {
            "User-Agent": "Calvin-Dashboard/1.0 (https://github.com/osterbergsimon/calvin)",
        }

        params = {
            "q": location,
            "format": "json",
            "limit": 5,  # Get more results to find the best match
            "addressdetails": 1,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            results = response.json()

            if not results:
                return {
                    "success": False,
                    "message": (
                        f"Location '{location}' not found. Please try a more specific location."
                    ),
                }

            # Try to find the best match
            # Prefer results that match the input location name more closely
            best_result = None
            best_score = -1
            location_lower = location.lower()
            # Extract the main location name (before comma if present)
            main_location = location_lower.split(",")[0].strip()

            for result in results:
                display_name = result.get("display_name", "").lower()
                place_type = result.get("type", "")
                importance = result.get("importance", 0)
                score = 0

                # Score based on how well it matches
                # 1. If the main location name appears at the start of display_name, high score
                if display_name.startswith(main_location):
                    score += 100
                # 2. If main location name appears early in display_name
                elif main_location in display_name[: len(main_location) + 30]:
                    score += 50
                # 3. If main location name appears anywhere
                elif main_location in display_name:
                    score += 25

                # Prefer actual places over administrative boundaries
                if place_type in ("city", "town", "village", "municipality", "island"):
                    score += 30
                elif place_type in ("administrative", "boundary"):
                    score -= 20  # Penalize administrative boundaries

                # Boost by importance
                score += importance * 10

                # Prefer results where the input location name is the primary name
                # (check if it's in the name field, not just display_name)
                name = result.get("name", "").lower()
                if main_location in name:
                    score += 40

                if score > best_score:
                    best_score = score
                    best_result = result

            # Fallback to first result if no better match found
            if best_result is None:
                best_result = results[0]

            result = best_result
            lat = float(result["lat"])
            lon = float(result["lon"])

            # Round to 4 decimals as per Yr.no API requirements
            lat = round(lat, 4)
            lon = round(lon, 4)

            # Get display name
            display_name = result.get("display_name", location)

            return {
                "success": True,
                "latitude": lat,
                "longitude": lon,
                "display_name": display_name,
                "message": f"Found coordinates for '{display_name}'",
            }

    except httpx.HTTPStatusError as e:
        return {
            "success": False,
            "message": f"Geocoding service error: {e.response.status_code}",
        }
    except httpx.HTTPError as e:
        return {
            "success": False,
            "message": f"Network error: {str(e)}",
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}",
        }


@router.post("/plugins/{plugin_id}/test")
async def test_plugin(plugin_id: str, test_config: dict[str, Any] | None = Body(default=None)):
    """
    Test plugin connection/configuration.

    Uses plugin hooks to allow plugins to implement their own connection testing logic.

    Args:
        plugin_id: Plugin type ID (e.g., 'imap', 'mealie')
        test_config: Optional config to use for testing (if not provided, uses saved config)

    Returns:
        Test result with success status and message
    """
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Use provided test_config if available, otherwise get saved config
    if test_config:
        config = test_config
    else:
        # Get plugin config
        config_key = f"plugin_{plugin_id}_config"
        config_json = await config_service.get_value(config_key)

        if config_json:
            try:
                config = json.loads(config_json)
            except json.JSONDecodeError:
                config = {}
        else:
            config = {}

    # Call plugin-specific test handlers via hooks
    # Pluggy returns a list of coroutines for async hooks, we need to await them
    test_coroutines = hook_manager.hook.test_plugin_connection(
        type_id=plugin_id,
        config=config,
    )
    test_results = await asyncio.gather(*test_coroutines, return_exceptions=True)

    # Check if any plugin handled the test
    for result in test_results:
        # Skip exceptions (they're wrapped in the result)
        if isinstance(result, Exception):
            continue
        if result is not None:
            return result

    # Default: plugin doesn't support testing
    return {
        "success": False,
        "message": "This plugin type does not support connection testing",
    }


@router.post("/plugins/{plugin_id}/backend/run-task")
async def run_backend_plugin_task(plugin_id: str):
    """
    Manually trigger scheduled task for a backend plugin.

    Args:
        plugin_id: Plugin instance ID

    Returns:
        Task execution result with success status and message
    """
    from app.plugins.protocols import BackendPlugin

    plugin = plugin_manager.get_plugin(plugin_id)

    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin instance '{plugin_id}' not found")

    if not isinstance(plugin, BackendPlugin):
        raise HTTPException(
            status_code=400,
            detail=f"Plugin '{plugin_id}' is not a backend plugin",
        )

    if not plugin.enabled:
        return {
            "success": False,
            "message": f"Plugin '{plugin_id}' is disabled. Enable it first to run tasks.",
        }

    try:
        # Check if plugin supports scheduled tasks
        schedule_config = await plugin.get_schedule_config()
        if not schedule_config:
            return {
                "success": False,
                "message": f"Plugin '{plugin_id}' does not support scheduled tasks",
            }

        # Run the task
        result = await plugin.run_scheduled_task()

        if not isinstance(result, dict):
            result = {"success": True, "message": "Task executed successfully", "data": result}

        return result
    except NotImplementedError:
        return {
            "success": False,
            "message": f"Plugin '{plugin_id}' does not support scheduled tasks",
        }
    except Exception as e:
        logger.exception(f"Error running task for backend plugin {plugin_id}")
        return {
            "success": False,
            "message": f"Error running task: {str(e)}",
        }


@router.get("/plugins/{plugin_id}/backend/status")
async def get_backend_plugin_status(plugin_id: str):
    """
    Get status information for a backend plugin.

    Args:
        plugin_id: Plugin instance ID

    Returns:
        Plugin status information
    """
    from app.plugins.protocols import BackendPlugin
    from app.services.backend_scheduler import backend_plugin_scheduler

    plugin = plugin_manager.get_plugin(plugin_id)

    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin instance '{plugin_id}' not found")

    if not isinstance(plugin, BackendPlugin):
        raise HTTPException(
            status_code=400,
            detail=f"Plugin '{plugin_id}' is not a backend plugin",
        )

    plugin_status: dict[str, Any] = {
        "plugin_id": plugin_id,
        "name": plugin.name,
        "enabled": plugin.enabled,
        "running": plugin.is_running(),
    }

    # Get scheduled task information
    schedule_config = await plugin.get_schedule_config()
    if schedule_config:
        plugin_status["scheduled_task"] = {
            "enabled": schedule_config.get("enabled", False),
            "interval": schedule_config.get("interval"),
            "cron": schedule_config.get("cron"),
            "max_concurrent": schedule_config.get("max_concurrent", 1),
        }

        # Check if task is registered in scheduler
        registered_tasks = backend_plugin_scheduler.get_registered_tasks()
        if plugin_id in registered_tasks:
            plugin_status["scheduled_task"]["registered"] = True
            plugin_status["scheduled_task"]["job_id"] = registered_tasks[plugin_id]
        else:
            plugin_status["scheduled_task"]["registered"] = False
    else:
        plugin_status["scheduled_task"] = None

    # Get provided services
    try:
        provided_services = await plugin.get_provided_services()
        plugin_status["provided_services"] = provided_services
    except Exception:
        plugin_status["provided_services"] = []

    return plugin_status
