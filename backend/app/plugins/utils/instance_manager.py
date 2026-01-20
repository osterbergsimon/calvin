"""Generic plugin instance management utilities.

This module provides a generic implementation of handle_plugin_config_update
that eliminates the need for plugins to implement hundreds of lines of
boilerplate instance management code.
"""

import logging
from collections.abc import Callable
from typing import Any

from app.models.db_models import PluginDB
from app.plugins.manager import plugin_manager
from app.plugins.registry import plugin_registry

logger = logging.getLogger(__name__)


class InstanceManagerConfig:
    """Configuration for generic instance management."""

    def __init__(
        self,
        type_id: str,
        single_instance: bool = False,
        instance_id: str | None = None,
        validate_config: Callable[[dict[str, Any]], bool] | None = None,
        generate_instance_id: Callable[[dict[str, Any], str], str] | None = None,
        normalize_config: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        prepare_instance_config: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]
        | None = None,
        on_instance_created: Callable[[Any, dict[str, Any]], None] | None = None,
        on_instance_updated: Callable[[Any, dict[str, Any]], None] | None = None,
        default_instance_name: str | None = None,
    ):
        """
        Initialize instance manager configuration.

        Args:
            type_id: Plugin type ID
            single_instance: If True, only one instance is allowed (uses fixed instance_id)
            instance_id: Fixed instance ID for single-instance plugins
            validate_config: Function to validate config before creating instance.
                           Returns True if config is valid, False otherwise.
            generate_instance_id: Function to generate instance ID from config.
                                Signature: (config: dict, type_id: str) -> str
            normalize_config: Function to normalize config values.
                            Signature: (config: dict) -> dict
            prepare_instance_config: Function to prepare final config for instance creation.
                                   Signature: (config: dict, metadata: dict) -> dict
                                   metadata contains: instance_name, instance_enabled, etc.
            on_instance_created: Callback after instance is created.
                               Signature: (plugin: BasePlugin, result: dict) -> None
            on_instance_updated: Callback after instance is updated.
                               Signature: (plugin: BasePlugin, result: dict) -> None
            default_instance_name: Default name for instances if not provided
        """
        self.type_id = type_id
        self.single_instance = single_instance
        self.instance_id = instance_id
        self.validate_config = validate_config
        self.generate_instance_id = generate_instance_id
        self.normalize_config = normalize_config
        self.prepare_instance_config = prepare_instance_config
        self.on_instance_created = on_instance_created
        self.on_instance_updated = on_instance_updated
        # Replace underscores with spaces before title casing for better readability
        # e.g., "test_plugin" -> "Test Plugin Instance"
        name_template = type_id.replace("_", " ").title()
        self.default_instance_name = default_instance_name or f"{name_template} Instance"


async def handle_plugin_config_update_generic(
    type_id: str,
    config: dict[str, Any],
    enabled: bool | None,
    db_type: Any,
    session: Any,  # Kept for backward compatibility with hooks, but not used
    manager_config: InstanceManagerConfig,
) -> dict[str, Any] | None:
    """
    Generic implementation of handle_plugin_config_update hook.

    This function handles the common patterns:
    - Config validation
    - Instance ID generation
    - Database queries (find/create/update)
    - Plugin registration
    - Lifecycle management (enable/disable/start/stop)
    - Error handling

    Plugins provide callbacks for plugin-specific logic only.

    Args:
        type_id: Plugin type ID
        config: Configuration dictionary
        enabled: Whether plugin type is enabled
        db_type: PluginTypeDB instance
        session: Database session (kept for backward compatibility, but not used with Ormar)
        manager_config: InstanceManagerConfig with plugin-specific callbacks

    Returns:
        Dictionary with instance_created/instance_updated status and instance_id
    """
    if type_id != manager_config.type_id:
        return None

    # Extract metadata fields before processing config
    specific_instance_id = config.get("_instance_id")
    instance_name = config.get("_instance_name", manager_config.default_instance_name)
    instance_enabled_flag = config.get("_instance_enabled")

    # Remove metadata fields from config before processing
    config = {k: v for k, v in config.items() if not k.startswith("_instance_")}

    # Normalize config if callback provided
    if manager_config.normalize_config:
        config = manager_config.normalize_config(config)

    # Validate config if callback provided
    if manager_config.validate_config:
        if not manager_config.validate_config(config):
            logger.info(f"[{type_id}] Skipping instance creation - config validation failed")
            return {"instance_created": False, "instance_updated": False}

    # Determine instance ID
    if manager_config.single_instance:
        # Single-instance plugin: use fixed instance ID
        plugin_instance_id = manager_config.instance_id or f"{type_id}-instance"
    elif specific_instance_id:
        # Updating specific instance
        plugin_instance_id = specific_instance_id
    elif instance_name and manager_config.generate_instance_id:
        # Multi-instance: generate ID from config
        plugin_instance_id = manager_config.generate_instance_id(config, type_id)
    else:
        # Fallback: try to find existing instance (backward compatibility)
        plugin_instance_id = None

    # Prepare instance config
    instance_config = config.copy()
    if manager_config.prepare_instance_config:
        metadata = {
            "instance_name": instance_name,
            "instance_enabled": instance_enabled_flag,
            "type_enabled": enabled,
        }
        instance_config = manager_config.prepare_instance_config(config, metadata)

    # Query database for existing instance
    db_instance = None
    try:
        if plugin_instance_id:
            # Try to find by ID
            db_instance = await PluginDB.objects.get_or_none(id=plugin_instance_id, type_id=type_id)
            # If found, check if it's actually in the manager
            if db_instance:
                existing_plugin = plugin_manager.get_plugin(db_instance.id)
                if not existing_plugin:
                    # Instance exists in DB but not in manager - treat as new instance
                    # (delete the orphaned DB entry)
                    logger.info(
                        f"[{type_id}] Instance {db_instance.id} exists in DB but not in manager, "
                        "deleting orphaned entry and creating new instance"
                    )
                    await db_instance.delete()
                    db_instance = None

        if not db_instance and manager_config.single_instance:
            # For single-instance, also check by type_id
            db_instance = await PluginDB.objects.get_or_none(type_id=type_id)
            if db_instance:
                existing_plugin = plugin_manager.get_plugin(db_instance.id)
                if not existing_plugin:
                    await db_instance.delete()
                    db_instance = None

        if not db_instance and not plugin_instance_id and not instance_name:
            # Backward compatibility: find first instance of this type
            db_instance = await PluginDB.objects.get_or_none(type_id=type_id)
            if db_instance:
                existing_plugin = plugin_manager.get_plugin(db_instance.id)
                if not existing_plugin:
                    await db_instance.delete()
                    db_instance = None
    except Exception as e:
        logger.warning(f"[{type_id}] Error querying database: {e}", exc_info=True)
        db_instance = None

    # Determine enabled status
    instance_enabled = (
        instance_enabled_flag
        if instance_enabled_flag is not None
        else (enabled if enabled is not None else (db_type.enabled if db_type else False))
    )
    # Convert string values to boolean
    if isinstance(instance_enabled, str):
        instance_enabled = instance_enabled.lower() in ("true", "1", "yes")
    instance_enabled = bool(instance_enabled)

    if not db_instance:
        # Create new instance
        if not plugin_instance_id:
            # Generate instance ID
            if manager_config.generate_instance_id:
                plugin_instance_id = manager_config.generate_instance_id(config, type_id)
            else:
                # Fallback: use type_id with hash
                import hashlib

                config_str = str(sorted(config.items()))
                config_hash = hashlib.md5(config_str.encode()).hexdigest()[:8]
                plugin_instance_id = f"{type_id}-{config_hash}"

        # Ensure uniqueness
        existing = await PluginDB.objects.get_or_none(id=plugin_instance_id)

        if existing:
            # Add timestamp to make unique
            import time

            timestamp = int(time.time() * 1000) % 100000
            plugin_instance_id = f"{plugin_instance_id}-{timestamp}"

        logger.info(
            f"[{type_id}] Creating new instance: {plugin_instance_id} with name: {instance_name}"
        )

        try:
            plugin = await plugin_registry.register_plugin(
                plugin_id=plugin_instance_id,
                type_id=type_id,
                name=instance_name or manager_config.default_instance_name,
                config=instance_config,
                enabled=instance_enabled,
            )

            result = {
                "instance_created": True,
                "instance_id": plugin_instance_id,
            }

            if manager_config.on_instance_created:
                manager_config.on_instance_created(plugin, result)

            return result
        except ValueError as e:
            # Plugin already registered
            if "already registered" in str(e):
                logger.info(
                    f"[{type_id}] Plugin {plugin_instance_id} already registered, "
                    "ensuring it's enabled"
                )
                existing_plugin = plugin_manager.get_plugin(plugin_instance_id)
                if existing_plugin:
                    if instance_enabled and not existing_plugin.enabled:
                        existing_plugin.enable()
                    elif not instance_enabled and existing_plugin.enabled:
                        existing_plugin.disable()
                return {
                    "instance_created": False,
                    "instance_id": plugin_instance_id,
                    "already_exists": True,
                }
            raise
        except Exception as e:
            logger.error(f"[{type_id}] Failed to create instance: {e}", exc_info=True)
            return {"instance_created": False, "error": str(e)}
    else:
        # Update existing instance
        logger.info(f"[{type_id}] Updating existing instance: {db_instance.id}")

        # Update instance name if provided
        if instance_name and instance_name != db_instance.name:
            db_instance.name = instance_name

        # Update enabled status
        final_enabled = (
            instance_enabled_flag
            if instance_enabled_flag is not None
            else (
                enabled
                if enabled is not None
                else (db_type.enabled if db_type else db_instance.enabled)
            )
        )
        if isinstance(final_enabled, str):
            final_enabled = final_enabled.lower() in ("true", "1", "yes")
        final_enabled = bool(final_enabled)

        # Update plugin in memory
        plugin = plugin_manager.get_plugin(db_instance.id)
        if plugin:
            await plugin.configure(instance_config)

            if final_enabled:
                plugin.enable()
                if not plugin.is_running():
                    try:
                        await plugin.initialize()
                        plugin.start()
                    except Exception as e:
                        logger.error(f"[{type_id}] Error starting plugin: {e}", exc_info=True)
            else:
                plugin.disable()
                if plugin.is_running():
                    try:
                        plugin.stop()
                        await plugin.cleanup()
                    except Exception as e:
                        logger.warning(f"[{type_id}] Error stopping plugin: {e}", exc_info=True)

            result = {
                "instance_updated": True,
                "instance_id": db_instance.id,
            }

            if manager_config.on_instance_updated:
                manager_config.on_instance_updated(plugin, result)

        else:
            # Instance exists in DB but not in manager - try to register it
            # If plugin_loader can't create it, just update the DB entry
            logger.info(f"[{type_id}] Instance {db_instance.id} exists in DB but not in manager")
            try:
                # Try to create plugin instance using pluggy hooks
                from app.plugins.loader import plugin_loader

                plugin = plugin_loader.create_plugin_instance(
                    plugin_id=db_instance.id,
                    type_id=type_id,
                    name=db_instance.name,
                    config={**instance_config, "enabled": final_enabled},
                )

                if plugin:
                    # Configure and register plugin
                    await plugin.configure(instance_config)
                    if final_enabled:
                        plugin.enable()
                    else:
                        plugin.disable()

                    await plugin_manager.register(plugin)
                    await plugin.initialize()

                    result = {
                        "instance_created": True,  # Treat as creation since it wasn't in manager
                        "instance_id": db_instance.id,
                    }

                    if manager_config.on_instance_created:
                        manager_config.on_instance_created(plugin, result)
                else:
                    # Plugin can't be created (e.g., plugin type not available)
                    # Just update the DB entry
                    logger.warning(
                        f"[{type_id}] Cannot create plugin instance for {db_instance.id}, "
                        "plugin type may not be available. Updating DB entry only."
                    )
                    result = {
                        "instance_updated": True,
                        "instance_id": db_instance.id,
                        "warning": "Plugin instance updated in DB but not registered in manager",
                    }
            except Exception as e:
                logger.error(
                    f"[{type_id}] Failed to register existing instance: {e}", exc_info=True
                )
                # Still update the DB entry even if registration fails
                result = {
                    "instance_updated": True,
                    "instance_id": db_instance.id,
                    "warning": f"DB updated but registration failed: {str(e)}",
                }

        # Update in database
        db_instance.config = instance_config
        db_instance.enabled = final_enabled
        await db_instance.save_with_timestamp()
        if db_type and hasattr(db_type, "save_with_timestamp"):
            # Only update if it's a real Ormar model (not a mock in tests)
            try:
                db_type.enabled = final_enabled
                await db_type.save_with_timestamp()
            except (AttributeError, TypeError):
                # Fallback for mocks or if save_with_timestamp doesn't exist
                if hasattr(db_type, "update"):
                    db_type.enabled = final_enabled
                    await db_type.update()

        return result
