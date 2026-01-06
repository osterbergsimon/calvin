# Phase 2 Refactoring Progress

## Status: In Progress

### Completed Modules

1. **`plugins/themes.py`** ✅
   - `_load_builtin_themes()` - Load built-in themes from JSON
   - `_register_theme_in_db()` - Register theme in database
   - `_unregister_theme_from_db()` - Remove theme from database
   - `sync_themes_to_db()` - Sync all themes to database
   - `BUILTIN_THEMES` constant

2. **`plugins/config.py`** ✅
   - `mask_sensitive_config()` - Mask sensitive fields in config
   - `get_plugin_config()` - GET /plugins/{plugin_id}/config endpoint
   - `SENSITIVE_FIELDS` constant

3. **`plugins/instances.py`** ✅
   - `start_plugin_instance()` - POST /plugins/instances/{instance_id}/start
   - `stop_plugin_instance()` - POST /plugins/instances/{instance_id}/stop
   - `get_plugin_instances()` - GET /plugins/{plugin_id}/instances
   - `update_plugin_instances_order()` - PUT /plugins/{plugin_id}/instances/order

4. **`plugins/github.py`** ✅
   - `enumerate_plugins_from_github()` - GET /plugins/enumerate-from-github
   - `install_plugin_from_github()` - POST /plugins/install-from-github

### Remaining Work

5. **`plugins/crud.py`** ⏳ (In Progress)
   - `get_plugins()` - GET /plugins
   - `get_plugin()` - GET /plugins/{plugin_id}
   - `update_plugin()` - PUT /plugins/{plugin_id}
   - `get_installed_plugins()` - GET /plugins/installed
   - `install_plugin()` - POST /plugins/install
   - `get_installed_plugin()` - GET /plugins/installed/{plugin_id}
   - `uninstall_plugin()` - DELETE /plugins/installed/{plugin_id}
   - `fetch_plugin()` - POST /plugins/{plugin_id}/fetch
   - `geocode_location()` - POST /plugins/{plugin_id}/geocode
   - `test_plugin()` - POST /plugins/{plugin_id}/test

6. **`plugins/__init__.py`** ⏳ (Not Started)
   - Aggregate all routers
   - Export main router

7. **Update main router** ⏳ (Not Started)
   - Update `app/api/routes/__init__.py` or `app/main.py` to use new structure

### Notes

- All modules need proper imports
- Some endpoints have print statements that should be replaced with logging (Phase 1 task)
- `update_plugin()` is very complex (~300 lines) and may need further refactoring
- Need to ensure all dependencies are correctly imported

