"""Plugin management API endpoints."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from app.plugins.base import PluginType
from app.plugins.loader import plugin_loader
from app.database import AsyncSessionLocal
from app.models.db_models import PluginTypeDB, PluginDB
from sqlalchemy import select

router = APIRouter()

# Sensitive fields that should be masked in logs
SENSITIVE_FIELDS = {
    "email_password",
    "password",
    "api_key",
    "secret",
    "token",
    "access_token",
    "refresh_token",
}


def mask_sensitive_config(config: dict[str, Any]) -> dict[str, Any]:
    """
    Create a copy of config with sensitive fields masked for logging.
    
    Args:
        config: Configuration dictionary
        
    Returns:
        Dictionary with sensitive fields masked
    """
    masked = {}
    for key, value in config.items():
        if key.lower() in SENSITIVE_FIELDS or any(
            field in key.lower() for field in SENSITIVE_FIELDS
        ):
            if value:
                # Mask the value, showing only first and last character if length > 2
                if len(str(value)) > 2:
                    masked[key] = f"{str(value)[0]}***{str(value)[-1]}"
                else:
                    masked[key] = "***"
            else:
                masked[key] = ""
        else:
            masked[key] = value
    return masked


@router.get("/plugins")
async def get_plugins(plugin_type: str | None = None):
    """
    Get all plugin types, optionally filtered by type.

    Args:
        plugin_type: Optional plugin type filter ('calendar', 'image', 'service')

    Returns:
        List of plugin types with their common configuration
    """
    # Parse plugin type if provided
    pt = None
    if plugin_type:
        try:
            pt = PluginType(plugin_type.lower())
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid plugin type: {plugin_type}. Valid types: calendar, image, service",
            )

    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    
    # Filter by plugin type if specified
    if pt:
        plugin_types = [t for t in plugin_types if t.get("plugin_type") == pt]

    # Load enabled status from database
    from app.services.config_service import config_service

    # Convert to response format
    result = []
    for type_info in plugin_types:
        type_id = type_info.get("type_id")
        plugin_type = type_info.get("plugin_type")
        
        # Check if plugin type is enabled from database
        async with AsyncSessionLocal() as session:
            result_db = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == type_id)
            )
            db_type = result_db.scalar_one_or_none()
            enabled = db_type.enabled if db_type else True  # Default to enabled

        plugin_info: dict[str, Any] = {
            "id": type_id,
            "name": type_info.get("name", ""),
            "type": plugin_type.value if hasattr(plugin_type, "value") else str(plugin_type),
            "description": type_info.get("description", ""),
            "config_schema": type_info.get("common_config_schema", {}),
            "enabled": enabled,
            "ui_actions": type_info.get("ui_actions", []),  # Plugin-specific actions (buttons)
            "ui_sections": type_info.get("ui_sections", []),  # Plugin-specific sections (upload, manage, etc.)
        }
        result.append(plugin_info)

    return {"plugins": result, "total": len(result)}


@router.get("/plugins/{plugin_id}")
async def get_plugin(plugin_id: str):
    """Get a specific plugin type by ID."""
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)
    
    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Get enabled status from database
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginTypeDB).where(PluginTypeDB.type_id == plugin_id)
        )
        db_type = result.scalar_one_or_none()
        enabled = db_type.enabled if db_type else True

    plugin_info: dict[str, Any] = {
        "id": type_info.get("type_id"),
        "name": type_info.get("name", ""),
        "type": type_info.get("plugin_type").value if hasattr(type_info.get("plugin_type"), "value") else str(type_info.get("plugin_type")),
        "description": type_info.get("description", ""),
        "config_schema": type_info.get("common_config_schema", {}),
        "enabled": enabled,
    }

    return plugin_info


@router.put("/plugins/{plugin_id}")
async def update_plugin(plugin_id: str, config: dict[str, Any]):
    """
    Update plugin type common configuration and enabled status.

    Args:
        plugin_id: Plugin type ID (e.g., 'google', 'ical', 'local')
        config: Configuration dictionary with common settings and/or enabled status
    """
    print(f"[Plugin Update] Received update for plugin {plugin_id}")
    print(f"[Plugin Update] Config keys: {list(config.keys())}")
    
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)
    
    if not type_info:
        print(f"[Plugin Update] Plugin type {plugin_id} not found")
        raise HTTPException(status_code=404, detail="Plugin type not found")
    
    print(f"[Plugin Update] Found plugin type: {type_info.get('name')}")

    # Store common configuration in database
    from app.plugins.manager import plugin_manager
    from pathlib import Path

    # Handle enabled status separately
    enabled = None
    if "enabled" in config:
        enabled = config["enabled"]
        # Remove enabled from config dict to avoid storing it in config
        config = {k: v for k, v in config.items() if k != "enabled"}
    
    # Mask sensitive fields for logging
    masked_config = mask_sensitive_config(config)
    print(f"[Plugin Update] Updating plugin {plugin_id} with config: {masked_config}")
    
    # Clean config values - ensure all values are strings, not objects
    cleaned_config = {}
    print(f"[Plugin Update] Cleaning config values...")
    for key, value in config.items():
        # Mask sensitive values in logs
        if key.lower() in SENSITIVE_FIELDS or any(field in key.lower() for field in SENSITIVE_FIELDS):
            masked_value = f"{str(value)[0]}***{str(value)[-1]}" if len(str(value)) > 2 else "***" if value else ""
            print(f"[Plugin Update] Processing config key '{key}': type={type(value)}, value={masked_value}")
        else:
            print(f"[Plugin Update] Processing config key '{key}': type={type(value)}, value={value}")
        if isinstance(value, dict):
            # If it's a schema object, extract the actual value or default
            cleaned_value = value.get("value") or value.get("default") or ""
            print(f"[Plugin Update] Extracted value from dict: {cleaned_value}")
            cleaned_config[key] = cleaned_value
        elif isinstance(value, Path):
            # Handle Path objects - convert to string
            cleaned_config[key] = str(value)
            print(f"[Plugin Update] Converted Path to string: {cleaned_config[key]}")
        elif value is None:
            cleaned_config[key] = ""
            print(f"[Plugin Update] Set to empty string (was None)")
        else:
            cleaned_config[key] = str(value)
        # Mask sensitive values in logs
        if key.lower() in SENSITIVE_FIELDS or any(field in key.lower() for field in SENSITIVE_FIELDS):
            masked_value = f"{str(cleaned_config[key])[0]}***{str(cleaned_config[key])[-1]}" if len(str(cleaned_config[key])) > 2 else "***" if cleaned_config[key] else ""
            print(f"[Plugin Update] Final value for '{key}': {masked_value} (type: {type(cleaned_config[key])})")
        else:
            print(f"[Plugin Update] Final value for '{key}': {cleaned_config[key]} (type: {type(cleaned_config[key])})")
    
    config = cleaned_config
    masked_cleaned_config = mask_sensitive_config(config)
    print(f"[Plugin Update] Final cleaned config: {masked_cleaned_config}")

    # Update plugin type in database
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginTypeDB).where(PluginTypeDB.type_id == plugin_id)
        )
        db_type = result.scalar_one_or_none()
        
        if not db_type:
            # Create new plugin type in database
            plugin_type = type_info.get("plugin_type")
            db_type = PluginTypeDB(
                type_id=plugin_id,
                plugin_type=plugin_type.value if hasattr(plugin_type, "value") else str(plugin_type),
                name=type_info.get("name", ""),
                description=type_info.get("description", ""),
                version=type_info.get("version"),
                common_config_schema=type_info.get("common_config_schema", {}),
                enabled=enabled if enabled is not None else True,
            )
            session.add(db_type)
        else:
            # Update existing plugin type
            if enabled is not None:
                db_type.enabled = enabled
            if config:
                # Update common config schema if provided
                current_schema = db_type.common_config_schema or {}
                current_schema.update(config)
                db_type.common_config_schema = current_schema
        
        await session.commit()
        await session.refresh(db_type)
        
        # Save common config to config service for backward compatibility
        if config:
            from app.services.config_service import config_service
            config_key = f"plugin_{plugin_id}_config"
            import json
            # Ensure all values in config are JSON-serializable (strings, not Path objects)
            serializable_config = {}
            for key, value in config.items():
                if isinstance(value, Path):
                    serializable_config[key] = str(value)
                elif isinstance(value, dict):
                    # Skip dict objects that might be schema objects
                    serializable_config[key] = value.get("value") or value.get("default") or ""
                else:
                    serializable_config[key] = value
            config_json = json.dumps(serializable_config)
            # Mask sensitive fields before logging
            masked_serializable = mask_sensitive_config(serializable_config)
            masked_json = json.dumps(masked_serializable)
            print(f"[Plugin Update] Saving config to service: {masked_json}")
            await config_service.set_value(config_key, config_json)
        
        # Update existing plugin instances if this is a local image plugin
        if plugin_id == "local" and config:
            # Find and update the local image plugin instance
            from app.plugins.base import PluginType
            from app.plugins.protocols import ImagePlugin
            
            plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=False)
            for plugin in plugins:
                if isinstance(plugin, ImagePlugin) and plugin.plugin_id == "local-images":
                    # Update plugin directories if provided - use configure method
                    # Ensure all values are strings before passing to configure
                    update_config = {}
                    if "image_dir" in config and config["image_dir"]:
                        update_config["image_dir"] = str(config["image_dir"])
                    if "thumbnail_dir" in config and config["thumbnail_dir"]:
                        update_config["thumbnail_dir"] = str(config["thumbnail_dir"])
                    
                    if update_config:
                        print(f"[Plugin Update] Configuring local plugin with: {update_config}")
                        await plugin.configure(update_config)
                    # Rescan images after directory change
                    await plugin.scan_images()
                    break
        
        # Create or update IMAP plugin instance if settings are saved
        if plugin_id == "imap" and config:
            from app.plugins.registry import plugin_registry
            from app.plugins.base import PluginType
            from app.plugins.protocols import ImagePlugin
            
            # Check if IMAP instance exists
            result = await session.execute(
                select(PluginDB).where(PluginDB.type_id == "imap")
            )
            imap_instance = result.scalar_one_or_none()
            print(f"[IMAP] Checking for existing IMAP instance: {imap_instance.id if imap_instance else 'None'}")
            
            # Check if we have required config (email and password)
            email_address = config.get("email_address", "")
            email_password = config.get("email_password", "")
            
            print(f"[IMAP] Config has email: {bool(email_address)}, password: {bool(email_password)}")
            
            if email_address and email_password:
                # Create or update IMAP instance
                if not imap_instance:
                    # Create new IMAP instance
                    plugin_instance_id = f"imap-{abs(hash(email_address)) % 10000}"
                    print(f"[IMAP] Creating new IMAP instance with ID: {plugin_instance_id}")
                    try:
                        plugin = await plugin_registry.register_plugin(
                            plugin_id=plugin_instance_id,
                            type_id="imap",
                            name="IMAP Email",
                            config=config,
                            enabled=enabled if enabled is not None else True,
                        )
                        print(f"[IMAP] Successfully created IMAP instance: {plugin_instance_id}, plugin: {plugin.plugin_id if plugin else 'None'}")
                    except Exception as e:
                        print(f"[IMAP] ERROR: Failed to create IMAP instance: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    # Update existing IMAP instance
                    print(f"[IMAP] Updating existing IMAP instance: {imap_instance.id}")
                    plugin = plugin_manager.get_plugin(imap_instance.id)
                    if plugin:
                        print(f"[IMAP] Found plugin in manager: {plugin.plugin_id}, class: {plugin.__class__.__name__}")
                        await plugin.configure(config)
                        if enabled is not None:
                            if enabled:
                                plugin.enable()
                            else:
                                plugin.disable()
                        # Update in database
                        imap_instance.config = config
                        if enabled is not None:
                            imap_instance.enabled = enabled
                        await session.commit()
                        print(f"[IMAP] Updated IMAP instance in database")
                    else:
                        print(f"[IMAP] WARNING: Plugin instance {imap_instance.id} not found in plugin manager")
            else:
                print(f"[IMAP] Skipping instance creation - missing email or password")
        
        # Create or update Mealie plugin instance if settings are saved
        if plugin_id == "mealie" and config:
            print(f"[Mealie] Starting Mealie instance creation/update process")
            from app.plugins.registry import plugin_registry
            from app.plugins.base import PluginType
            from app.plugins.protocols import ServicePlugin
            
            # Check if Mealie instance exists
            result = await session.execute(
                select(PluginDB).where(PluginDB.type_id == "mealie")
            )
            mealie_instance = result.scalar_one_or_none()
            print(f"[Mealie] Checking for existing Mealie instance: {mealie_instance.id if mealie_instance else 'None'}")
            
            # Check if we have required config (URL and API token)
            # Note: config has already been cleaned, so values should be strings
            mealie_url = config.get("mealie_url", "")
            api_token = config.get("api_token", "")
            
            print(f"[Mealie] Extracted URL: {mealie_url[:50] if mealie_url else 'None'}...")
            print(f"[Mealie] Extracted API token: {'***' if api_token else 'None'}")
            print(f"[Mealie] Config has URL: {bool(mealie_url)}, API token: {bool(api_token)}")
            
            if mealie_url and api_token:
                # Create or update Mealie instance
                if not mealie_instance:
                    # Create new Mealie instance
                    plugin_instance_id = f"mealie-{abs(hash(mealie_url)) % 10000}"
                    print(f"[Mealie] Creating new Mealie instance with ID: {plugin_instance_id}")
                    try:
                        # Use cleaned config values for instance creation
                        # Get days_ahead from config, default to 7
                        days_ahead = config.get("days_ahead", "7")
                        try:
                            days_ahead = int(days_ahead) if days_ahead else 7
                        except (ValueError, TypeError):
                            days_ahead = 7
                        
                        instance_config = {
                            "mealie_url": mealie_url,
                            "api_token": api_token,
                            "group_id": config.get("group_id", ""),
                            "days_ahead": days_ahead,
                            "display_order": 0,
                            "fullscreen": False,
                        }
                        print(f"[Mealie] Instance config: mealie_url={instance_config['mealie_url'][:50]}..., api_token={'***' if instance_config['api_token'] else 'None'}")
                        plugin = await plugin_registry.register_plugin(
                            plugin_id=plugin_instance_id,
                            type_id="mealie",
                            name="Mealie Meal Plan",
                            config=instance_config,
                            enabled=enabled if enabled is not None else True,
                        )
                        print(f"[Mealie] Successfully created Mealie instance: {plugin_instance_id}, plugin: {plugin.plugin_id if plugin else 'None'}")
                    except Exception as e:
                        print(f"[Mealie] ERROR: Failed to create Mealie instance: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    # Update existing Mealie instance
                    print(f"[Mealie] Updating existing Mealie instance: {mealie_instance.id}")
                    plugin = plugin_manager.get_plugin(mealie_instance.id)
                    if plugin:
                        print(f"[Mealie] Found plugin in manager: {plugin.plugin_id}, class: {plugin.__class__.__name__}")
                        # Use cleaned config values for update
                        # Get days_ahead from config, default to existing value or 7
                        days_ahead = config.get("days_ahead", "")
                        if days_ahead:
                            try:
                                days_ahead = int(days_ahead) if days_ahead else 7
                            except (ValueError, TypeError):
                                days_ahead = mealie_instance.config.get("days_ahead", 7) if mealie_instance.config else 7
                        else:
                            days_ahead = mealie_instance.config.get("days_ahead", 7) if mealie_instance.config else 7
                        
                        instance_config = {
                            "mealie_url": mealie_url,
                            "api_token": api_token,
                            "group_id": config.get("group_id", ""),
                            "days_ahead": days_ahead,
                            "display_order": mealie_instance.config.get("display_order", 0) if mealie_instance.config else 0,
                            "fullscreen": mealie_instance.config.get("fullscreen", False) if mealie_instance.config else False,
                        }
                        await plugin.configure(instance_config)
                        if enabled is not None:
                            if enabled:
                                plugin.enable()
                            else:
                                plugin.disable()
                        # Update in database
                        mealie_instance.config = instance_config
                        if enabled is not None:
                            mealie_instance.enabled = enabled
                        await session.commit()
                        print(f"[Mealie] Updated Mealie instance in database")
                    else:
                        print(f"[Mealie] WARNING: Plugin instance {mealie_instance.id} not found in plugin manager")
            else:
                print(f"[Mealie] Skipping instance creation - missing URL or API token")
                print(f"[Mealie]   mealie_url: {repr(mealie_url)}")
                print(f"[Mealie]   api_token: {'***' if api_token else 'None'}")

    return {"message": "Plugin type configuration updated", "plugin_id": plugin_id}


@router.get("/plugins/{plugin_id}/config")
async def get_plugin_config(plugin_id: str):
    """Get plugin type common configuration."""
    print(f"[Plugin Config] Getting config for plugin {plugin_id}")
    
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)
    
    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Load actual config values from config service (not schema)
    from app.services.config_service import config_service
    config_key = f"plugin_{plugin_id}_config"
    config_json = await config_service.get_value(config_key)
    
    # Mask sensitive fields in raw config before logging
    if config_json:
        import json
        try:
            temp_config = json.loads(config_json)
            masked_temp = mask_sensitive_config(temp_config)
            print(f"[Plugin Config] Raw config from service: {json.dumps(masked_temp)}")
        except:
            pass
    
    if config_json:
        import json
        try:
            config = json.loads(config_json)
            masked_parsed = mask_sensitive_config(config)
            print(f"[Plugin Config] Parsed config: {masked_parsed}")
        except json.JSONDecodeError as e:
            print(f"[Plugin Config] ERROR: Failed to parse JSON: {e}")
            config = {}
    else:
        config = {}
        print(f"[Plugin Config] No config found, using empty dict")
    
    # For local image plugin, always get current plugin instance directories
    # This ensures we show the actual values being used, not just what's stored in config
    if plugin_id == "local":
        from app.plugins.manager import plugin_manager
        from app.plugins.base import PluginType
        from app.plugins.protocols import ImagePlugin
        
        plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=False)
        for plugin in plugins:
            if isinstance(plugin, ImagePlugin) and plugin.plugin_id == "local-images":
                # Always use current plugin instance directories (source of truth)
                # Ensure we convert Path objects to strings
                image_dir = plugin.image_dir
                thumbnail_dir = plugin.thumbnail_dir
                print(f"[Plugin Config] Found local plugin instance:")
                print(f"[Plugin Config]   image_dir: {image_dir} (type: {type(image_dir)})")
                print(f"[Plugin Config]   thumbnail_dir: {thumbnail_dir} (type: {type(thumbnail_dir)})")
                
                # Convert Path objects to strings properly
                if image_dir:
                    if isinstance(image_dir, Path):
                        # Use resolve() to get absolute path, then convert to string
                        try:
                            resolved = image_dir.resolve()
                            config["image_dir"] = str(resolved)
                            print(f"[Plugin Config]   image_dir resolved: {resolved}")
                        except Exception as e:
                            print(f"[Plugin Config]   ERROR resolving image_dir: {e}")
                            config["image_dir"] = str(image_dir)
                    else:
                        config["image_dir"] = str(image_dir)
                else:
                    config["image_dir"] = "./data/images"
                
                if thumbnail_dir:
                    if isinstance(thumbnail_dir, Path):
                        # Use resolve() to get absolute path, then convert to string
                        try:
                            # First, let's check what the Path object actually is
                            print(f"[Plugin Config]   thumbnail_dir repr: {repr(thumbnail_dir)}")
                            print(f"[Plugin Config]   thumbnail_dir str: {str(thumbnail_dir)}")
                            print(f"[Plugin Config]   thumbnail_dir parts: {thumbnail_dir.parts}")
                            resolved = thumbnail_dir.resolve()
                            print(f"[Plugin Config]   thumbnail_dir resolved: {resolved}")
                            config["thumbnail_dir"] = str(resolved)
                            print(f"[Plugin Config]   thumbnail_dir final string: {config['thumbnail_dir']}")
                        except Exception as e:
                            print(f"[Plugin Config]   ERROR resolving thumbnail_dir: {e}")
                            import traceback
                            traceback.print_exc()
                            # Fallback: try direct string conversion
                            try:
                                config["thumbnail_dir"] = str(thumbnail_dir)
                            except Exception as e2:
                                print(f"[Plugin Config]   ERROR converting thumbnail_dir to string: {e2}")
                                config["thumbnail_dir"] = "./data/images/thumbnails"
                    else:
                        config["thumbnail_dir"] = str(thumbnail_dir)
                        print(f"[Plugin Config]   thumbnail_dir is not Path, converted to: {config['thumbnail_dir']}")
                else:
                    config["thumbnail_dir"] = "./data/images/thumbnails"
                
                print(f"[Plugin Config]   Final image_dir: {config['image_dir']} (type: {type(config['image_dir'])})")
                print(f"[Plugin Config]   Final thumbnail_dir: {config['thumbnail_dir']} (type: {type(config['thumbnail_dir'])})")
                break
        else:
            # Plugin instance doesn't exist yet, use defaults
            print(f"[Plugin Config] Local plugin instance not found, using defaults")
            if "image_dir" not in config or not config["image_dir"]:
                config["image_dir"] = "./data/images"
            if "thumbnail_dir" not in config or not config["thumbnail_dir"]:
                config["thumbnail_dir"] = "./data/images/thumbnails"
    
    # Clean up any schema objects that might have been stored incorrectly
    # Ensure all values are strings, not objects
    cleaned_config = {}
    print(f"[Plugin Config] Cleaning config values...")
    for key, value in config.items():
        # Mask sensitive values in logs
        if key.lower() in SENSITIVE_FIELDS or any(field in key.lower() for field in SENSITIVE_FIELDS):
            masked_value = f"{str(value)[0]}***{str(value)[-1]}" if len(str(value)) > 2 else "***" if value else ""
            print(f"[Plugin Config]   Key '{key}': type={type(value)}, value={masked_value}")
        else:
            print(f"[Plugin Config]   Key '{key}': type={type(value)}, value={value}")
        if isinstance(value, dict):
            # If it's a schema object, extract the actual value or default
            cleaned_value = value.get("value") or value.get("default") or ""
            print(f"[Plugin Config]     Extracted from dict: {cleaned_value}")
            cleaned_config[key] = cleaned_value
        elif value is None:
            cleaned_config[key] = ""
            print(f"[Plugin Config]     Set to empty string (was None)")
        elif isinstance(value, Path):
            # Handle Path objects - convert to string
            cleaned_config[key] = str(value)
            print(f"[Plugin Config]     Converted Path to string: {cleaned_config[key]}")
        else:
            cleaned_config[key] = str(value)
            # Mask sensitive values in logs
            if key.lower() in SENSITIVE_FIELDS or any(field in key.lower() for field in SENSITIVE_FIELDS):
                masked_value = f"{str(cleaned_config[key])[0]}***{str(cleaned_config[key])[-1]}" if len(str(cleaned_config[key])) > 2 else "***" if cleaned_config[key] else ""
                print(f"[Plugin Config]     Converted to string: {masked_value}")
            else:
                print(f"[Plugin Config]     Converted to string: {cleaned_config[key]}")
    
    masked_final = mask_sensitive_config(cleaned_config)
    print(f"[Plugin Config] Final cleaned config: {masked_final}")
    return {"plugin_id": plugin_id, "config": cleaned_config}


@router.post("/plugins/{plugin_id}/fetch")
async def fetch_plugin(plugin_id: str):
    """
    Manually trigger plugin fetch/check operation.
    
    Currently supports:
    - IMAP: Checks for new emails and downloads images
    
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
    
    # Get plugin instance from plugin manager
    from app.plugins.manager import plugin_manager
    from app.plugins.base import PluginType
    from app.plugins.protocols import ImagePlugin
    from app.database import AsyncSessionLocal
    from app.models.db_models import PluginDB
    from sqlalchemy import select
    
    # Find IMAP plugin instance
    if plugin_id == "imap":
        print(f"[IMAP Fetch] Starting fetch operation...")
        
        # First, find IMAP plugin instances from database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginDB).where(PluginDB.type_id == "imap")
            )
            imap_plugins_db = result.scalars().all()
        
        print(f"[IMAP Fetch] Found {len(imap_plugins_db)} IMAP instances in database")
        for db_plugin in imap_plugins_db:
            print(f"[IMAP Fetch] DB instance: id={db_plugin.id}, enabled={db_plugin.enabled}, name={db_plugin.name}")
        
        if not imap_plugins_db:
            print(f"[IMAP Fetch] No IMAP instances found in database")
            return {
                "success": False,
                "message": "IMAP plugin instance not found. Please configure and enable the IMAP plugin first.",
                "images_downloaded": False,
                "image_count": 0,
            }
        
        # Try to find the plugin instance from plugin manager
        imap_plugin = None
        print(f"[IMAP Fetch] Looking for plugin instances in plugin manager...")
        for db_plugin in imap_plugins_db:
            # Try to get plugin by its ID
            print(f"[IMAP Fetch] Trying to get plugin by ID: {db_plugin.id}")
            plugin = plugin_manager.get_plugin(db_plugin.id)
            if plugin:
                print(f"[IMAP Fetch] Found plugin: id={plugin.plugin_id}, class={plugin.__class__.__name__}, enabled={plugin.enabled}")
                if isinstance(plugin, ImagePlugin):
                    # Check if it's an ImapImagePlugin
                    if plugin.__class__.__name__ == "ImapImagePlugin":
                        print(f"[IMAP Fetch] Found ImapImagePlugin instance!")
                        imap_plugin = plugin
                        break
            else:
                print(f"[IMAP Fetch] Plugin {db_plugin.id} not found in plugin manager")
        
        # If not found by ID, try to find by class name
        if not imap_plugin:
            print(f"[IMAP Fetch] Not found by ID, searching all IMAGE plugins by class name...")
            plugins = plugin_manager.get_plugins(PluginType.IMAGE, enabled_only=False)
            print(f"[IMAP Fetch] Found {len(plugins)} IMAGE plugins total")
            for plugin in plugins:
                print(f"[IMAP Fetch] Checking plugin: id={plugin.plugin_id}, class={plugin.__class__.__name__}")
                if plugin.__class__.__name__ == "ImapImagePlugin":
                    print(f"[IMAP Fetch] Found ImapImagePlugin by class name!")
                    imap_plugin = plugin
                    break
        
        if not imap_plugin:
            print(f"[IMAP Fetch] ERROR: IMAP plugin instance not found in plugin manager")
            print(f"[IMAP Fetch] All registered plugins: {list(plugin_manager._plugins.keys())}")
            return {
                "success": False,
                "message": "IMAP plugin instance found in database but not loaded. Please restart the application.",
                "images_downloaded": False,
                "image_count": 0,
            }
        
        print(f"[IMAP Fetch] Using IMAP plugin: {imap_plugin.plugin_id}")
        
        # Check if plugin has fetch_now method
        if hasattr(imap_plugin, 'fetch_now'):
            print(f"[IMAP Fetch] Calling fetch_now()...")
            result = await imap_plugin.fetch_now()
            print(f"[IMAP Fetch] Fetch result: success={result.get('success')}, images_downloaded={result.get('images_downloaded')}, image_count={result.get('image_count')}")
            return result
        else:
            print(f"[IMAP Fetch] ERROR: Plugin does not have fetch_now method")
            return {
                "success": False,
                "message": "IMAP plugin does not support manual fetch",
                "images_downloaded": False,
                "image_count": 0,
            }
    
    # Default: plugin doesn't support fetching
    return {
        "success": False,
        "message": "This plugin type does not support manual fetch",
        "images_downloaded": False,
        "image_count": 0,
    }


@router.post("/plugins/{plugin_id}/test")
async def test_plugin(plugin_id: str):
    """
    Test plugin connection/configuration.
    
    Currently supports:
    - IMAP: Tests email connection
    - Mealie: Tests Mealie API connection
    
    Args:
        plugin_id: Plugin type ID (e.g., 'imap', 'mealie')
    
    Returns:
        Test result with success status and message
    """
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)
    
    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")
    
    # Get plugin config
    from app.services.config_service import config_service
    config_key = f"plugin_{plugin_id}_config"
    config_json = await config_service.get_value(config_key)
    
    if config_json:
        import json
        try:
            config = json.loads(config_json)
        except json.JSONDecodeError:
            config = {}
    else:
        config = {}
    
    # Test based on plugin type
    if plugin_id == "imap":
        # Test IMAP connection
        import imaplib
        email_address = config.get("email_address", "")
        email_password = config.get("email_password", "")
        imap_server = config.get("imap_server", "imap.gmail.com")
        imap_port = int(config.get("imap_port", 993))
        
        if not email_address or not email_password:
            return {
                "success": False,
                "message": "Email address and password are required",
            }
        
        try:
            # Test connection
            mail = imaplib.IMAP4_SSL(imap_server, imap_port)
            mail.login(email_address, email_password)
            mail.select("INBOX")
            mail.close()
            mail.logout()
            
            return {
                "success": True,
                "message": f"Successfully connected to {imap_server}",
            }
        except imaplib.IMAP4.error as e:
            error_msg = str(e)
            if "authentication failed" in error_msg.lower() or "invalid credentials" in error_msg.lower():
                return {
                    "success": False,
                    "message": "Authentication failed. Please check your email address and password.",
                }
            elif "connection refused" in error_msg.lower() or "timeout" in error_msg.lower():
                return {
                    "success": False,
                    "message": f"Could not connect to {imap_server}. Please check the server address and port.",
                }
            else:
                return {
                    "success": False,
                    "message": f"Connection error: {error_msg}",
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Error: {str(e)}",
            }
    elif plugin_id == "mealie":
        # Test Mealie API connection
        import httpx
        mealie_url = config.get("mealie_url", "").rstrip("/")
        api_token = config.get("api_token", "")
        
        if not mealie_url or not api_token:
            return {
                "success": False,
                "message": "Mealie URL and API token are required",
            }
        
        try:
            # Test connection by fetching user info or recipes endpoint
            headers = {"Authorization": f"Bearer {api_token}"}
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try to fetch user info or a simple endpoint
                response = await client.get(
                    f"{mealie_url}/api/users/self",
                    headers=headers,
                )
                if response.status_code == 200:
                    return {
                        "success": True,
                        "message": f"Successfully connected to Mealie at {mealie_url}",
                    }
                elif response.status_code == 401:
                    return {
                        "success": False,
                        "message": "Authentication failed. Please check your API token.",
                    }
                elif response.status_code == 404:
                    # Try alternative endpoint
                    response = await client.get(
                        f"{mealie_url}/api/recipes",
                        headers=headers,
                    )
                    if response.status_code == 200:
                        return {
                            "success": True,
                            "message": f"Successfully connected to Mealie at {mealie_url}",
                        }
                    else:
                        return {
                            "success": False,
                            "message": f"Could not connect to Mealie API. Status: {response.status_code}",
                        }
                else:
                    return {
                        "success": False,
                        "message": f"Mealie API returned status {response.status_code}",
                    }
        except httpx.ConnectError:
            return {
                "success": False,
                "message": f"Could not connect to {mealie_url}. Please check the URL.",
            }
        except httpx.TimeoutException:
            return {
                "success": False,
                "message": f"Connection to {mealie_url} timed out. Please check the URL and network.",
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Error: {str(e)}",
            }
    
    # Default: plugin doesn't support testing
    return {
        "success": False,
        "message": "This plugin type does not support connection testing",
    }


@router.get("/plugins/types/calendar")
async def get_calendar_plugin_types():
    """
    Get available calendar plugin types (only enabled ones).

    Returns:
        List of available calendar plugin types
    """
    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    calendar_types = [t for t in plugin_types if t.get("plugin_type") == PluginType.CALENDAR]
    
    # Filter to only enabled plugin types from database
    enabled_types = []
    async with AsyncSessionLocal() as session:
        for type_info in calendar_types:
            type_id = type_info.get("type_id")
            result = await session.execute(
                select(PluginTypeDB).where(PluginTypeDB.type_id == type_id)
            )
            db_type = result.scalar_one_or_none()
            enabled = db_type.enabled if db_type else True  # Default to enabled
            if enabled:
                enabled_types.append(type_info)
    
    return {
        "types": [
            {
                "id": t.get("type_id"),
                "name": t.get("name", ""),
                "description": t.get("description", ""),
                "supports_ical_url": True,
                "supports_api_key": False,
            }
            for t in enabled_types
        ]
    }

