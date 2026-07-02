"""Plugin loading logic - loading plugin types and instances from database."""

from loguru import logger

from app.models.db_models import PluginDB, PluginTypeDB
from app.plugins.loader import plugin_loader
from app.plugins.manager import plugin_manager as instance_manager


async def load_plugin_types() -> None:
    """Load plugin types from database or register defaults."""
    # Get plugin types from the loader's registry
    plugin_types = plugin_loader.get_plugin_types()

    for type_info in plugin_types:
        type_id = None
        error_message = None

        try:
            if not type_info.type_id:
                continue

            type_id = type_info.type_id

            # Get name with fallback
            name = type_info.name or type_id or "Unknown Plugin"

            # Check if plugin type exists in database
            db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)

            # Use retry logic for database operations to handle SQLite concurrency
            from app.utils.db_retry import retry_on_db_locked

            @retry_on_db_locked(max_retries=5, initial_delay=0.1, max_delay=1.0)
            async def _save_plugin_type():
                if not db_type:
                    # Create new plugin type in database
                    plugin_type_value = (
                        type_info.plugin_type.value
                        if hasattr(type_info.plugin_type, "value")
                        else str(type_info.plugin_type)
                    )
                    await PluginTypeDB.objects.create(
                        type_id=type_id,
                        plugin_type=plugin_type_value,
                        name=name,
                        description=type_info.description,
                        version=type_info.version,
                        common_config_schema=type_info.common_config_schema,
                        enabled=False,  # Default to disabled - user must explicitly enable
                        error_message=None,  # Clear any previous errors
                    )
                else:
                    # Update existing plugin type if needed
                    plugin_type_value = (
                        type_info.plugin_type.value
                        if hasattr(type_info.plugin_type, "value")
                        else str(type_info.plugin_type)
                    )
                    db_type.name = name
                    db_type.description = type_info.description
                    db_type.version = type_info.version

                    # Merge plugin metadata schema with existing database schema
                    # This preserves user-set values (like display_order) while updating
                    # with new schema from plugin metadata
                    metadata_schema = type_info.common_config_schema or {}
                    existing_schema = db_type.common_config_schema or {}
                    # Merge: existing schema takes precedence (preserves user-set values),
                    # but metadata schema can add new fields
                    merged_schema = {**metadata_schema, **existing_schema}
                    db_type.common_config_schema = merged_schema

                    db_type.plugin_type = plugin_type_value
                    # Clear error message on successful load
                    db_type.error_message = None
                    await db_type.save_with_timestamp()

            await _save_plugin_type()

        except Exception as e:
            # Log the error and mark plugin as broken
            error_message = str(e)
            logger.exception(
                "Error loading plugin type {}: {}", type_id or "unknown", error_message
            )

            if type_id:
                # Try to update or create the plugin type with error status
                # Use retry logic for database operations
                from app.utils.db_retry import retry_on_db_locked

                @retry_on_db_locked(max_retries=3, initial_delay=0.1, max_delay=0.5)
                async def _save_error_status():
                    db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)

                    if db_type:
                        # Update existing plugin type with error
                        db_type.error_message = error_message
                        db_type.enabled = False  # Disable broken plugins
                        await db_type.save_with_timestamp()
                    else:
                        # Create new plugin type entry with error
                        await PluginTypeDB.objects.create(
                            type_id=type_id,
                            plugin_type="unknown",
                            name=type_id or "Unknown Plugin",
                            description=None,
                            version=None,
                            common_config_schema={},
                            enabled=False,
                            error_message=error_message,
                        )

                try:
                    await _save_error_status()
                except Exception:
                    logger.exception("Error updating database for broken plugin {}", type_id)


async def load_plugin_types_for_single(plugin_id: str) -> None:
    """Register a single plugin type in the database after install.

    Mirrors the per-type save logic from ``load_plugin_types()`` for one
    ``plugin_id`` so a freshly installed plugin appears in
    ``get_plugin_types()`` output without a server restart. Handles both
    create (no existing row) and update (row already exists). No-ops with a
    warning if the type is not found after install.
    """
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.type_id == plugin_id), None)
    if type_info is None:
        logger.warning(
            "Plugin type {} not found after install — skipping DB registration", plugin_id
        )
        return

    type_id: str = type_info.type_id

    db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)

    from app.utils.db_retry import retry_on_db_locked

    @retry_on_db_locked(max_retries=5, initial_delay=0.1, max_delay=1.0)
    async def _save_plugin_type() -> None:
        plugin_type_value = (
            type_info.plugin_type.value
            if type_info.plugin_type is not None
            else str(type_info.plugin_type)
        )
        if not db_type:
            await PluginTypeDB.objects.create(
                type_id=type_id,
                plugin_type=plugin_type_value,
                name=type_info.name or type_id or "Unknown Plugin",
                description=type_info.description,
                version=type_info.version,
                common_config_schema=type_info.common_config_schema,
                enabled=False,
                error_message=None,
            )
        else:
            db_type.name = type_info.name or type_id or "Unknown Plugin"
            db_type.description = type_info.description
            db_type.version = type_info.version
            metadata_schema = type_info.common_config_schema or {}
            existing_schema = db_type.common_config_schema or {}
            db_type.common_config_schema = {**metadata_schema, **existing_schema}
            db_type.plugin_type = plugin_type_value
            db_type.error_message = None
            await db_type.save_with_timestamp()

    await _save_plugin_type()


async def load_plugin_instances() -> None:
    """Load plugin instances from database."""
    db_plugins = await PluginDB.objects.all()

    for db_plugin in db_plugins:
        # Skip disabled plugins - don't create instances for them
        if not db_plugin.enabled:
            # If plugin was previously registered but is now disabled,
            # unregister and cleanup it
            existing = instance_manager.get_plugin(db_plugin.id)
            if existing:
                try:
                    await existing.cleanup()
                    await instance_manager.unregister(db_plugin.id)
                except Exception:
                    logger.opt(exception=True).warning(
                        "Error cleaning up disabled plugin {}", db_plugin.id
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
                except Exception:
                    logger.exception("Error updating existing plugin {}", db_plugin.id)
                    # Disable plugin on error
                    existing.disable()
                    db_plugin.enabled = False
                    await db_plugin.save_with_timestamp()
                continue

            # Create plugin instance (only for enabled plugins)
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
            except Exception:
                logger.exception(
                    "Error creating plugin instance {} (type: {})",
                    db_plugin.id,
                    db_plugin.type_id,
                )
                # Mark plugin as disabled in database on error
                db_plugin.enabled = False
                await db_plugin.save_with_timestamp()
                continue

            if plugin:
                try:
                    # Configure plugin with additional settings
                    # Clean config to ensure all values are actual values,
                    # not schema objects
                    plugin_config = db_plugin.config or {}
                    cleaned_config = {}
                    for key, value in plugin_config.items():
                        if isinstance(value, dict) and ("type" in value or "description" in value):
                            # This is a schema object, extract the actual value
                            cleaned_config[key] = value.get("value") or value.get("default") or ""
                        else:
                            cleaned_config[key] = value
                    await plugin.configure(cleaned_config)

                    # Ensure plugin is enabled
                    # (should already be from constructor, but verify)
                    if not plugin.enabled:
                        plugin.enable()

                    # Register plugin
                    await instance_manager.register(plugin)

                    # Initialize and start the plugin
                    try:
                        await plugin.initialize()
                        plugin.start()
                    except Exception:
                        logger.exception("Error initializing plugin {}", db_plugin.id)
                        plugin.stop()
                except Exception:
                    logger.exception("Error configuring plugin {}", db_plugin.id)
                    # Only disable this specific plugin on error
                    try:
                        db_plugin.enabled = False
                        await db_plugin.save_with_timestamp()
                    except Exception:
                        logger.exception("Error updating database for plugin {}", db_plugin.id)
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

        except Exception:
            # Catch-all for any unexpected errors
            logger.exception("Unexpected error loading plugin instance {}", db_plugin.id)
            # Disable plugin on error
            try:
                db_plugin.enabled = False
                await db_plugin.save_with_timestamp()
            except Exception:
                pass  # Ignore errors when trying to disable
