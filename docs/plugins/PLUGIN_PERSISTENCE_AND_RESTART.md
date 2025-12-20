# Plugin Persistence and Restart Requirements

## How Plugins Are Persisted

Plugins are persisted in two database tables:

### 1. Plugin Types (`plugin_types` table)
Stores plugin type definitions:
- `type_id`: Unique identifier (e.g., 'google', 'local', 'iframe')
- `plugin_type`: Category ('calendar', 'image', 'service')
- `name`: Human-readable name
- `version`: Plugin version
- `common_config_schema`: Configuration schema (JSON)
- `enabled`: Whether the plugin type is enabled
- `error_message`: Error message if plugin failed to load

### 2. Plugin Instances (`plugins` table)
Stores individual plugin instances:
- `id`: Unique instance identifier
- `type_id`: References the plugin type
- `plugin_type`: Category ('calendar', 'image', 'service')
- `name`: Instance name
- `version`: Plugin version
- `enabled`: Whether the instance is enabled
- `config`: Instance-specific configuration (JSON)

## Installation Process

When you install a plugin:

1. ✅ **Files are installed** to `backend/data/plugins/{plugin_id}/`
2. ✅ **Frontend components** are copied to `frontend/src/components/plugins/{plugin_id}/`
3. ✅ **Plugin module is loaded** into memory via `plugin_loader.load_installed_plugins()`
4. ✅ **Plugin is registered** with pluggy (the plugin system)
5. ❌ **Plugin type is NOT automatically added to database**

## Why Restart Is Required

Plugin types are registered in the database during **server startup** via `PluginRegistry.load_plugins_from_db()`. This process:

1. Loads all plugin modules from disk
2. Discovers plugin types via pluggy hooks
3. Creates/updates `PluginTypeDB` entries in the database
4. Defaults new plugins to `enabled=False` (user must enable manually)

**After installing a plugin, it won't appear in the UI until you restart the server** because the database registration only happens at startup.

## Workaround: Server Restart

To make newly installed plugins appear immediately:

1. **Restart the backend server**
2. The plugin will be discovered and registered in the database
3. It will appear in the Settings → Plugins section (disabled by default)
4. You can then enable and configure it

## Future Improvement

A future version may add automatic database registration after installation, eliminating the need for a restart.

