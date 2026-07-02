# Plugin Persistence and Lifecycle

How plugins are persisted, what happens at install/uninstall, and how load
errors surface. Under plugin contract 1.0 **installation is live — no server
restart is required** at any point.

## How Plugins Are Persisted

Two database tables:

### 1. Plugin types (`plugin_types` table)

One row per plugin type, mirrored from the loader's registry by
[registry/loader.py](../../backend/app/plugins/registry/loader.py):

- `type_id` — unique identifier (e.g. `google`, `local`, `mealie`)
- `plugin_type` — family (`calendar`, `image`, `service`, `backend`, `theme`)
- `name`, `description`, `version` — from `PluginMetadata`
- `common_config_schema` — merged with any user-set values (user values win)
- `enabled` — new types default to **disabled**; the user enables them
- `error_message` — set when the type failed to load, cleared on success

### 2. Plugin instances (`plugins` table)

One row per configured instance:

- `id` — instance id (fixed for single-instance plugins, identity-hash or
  config-hash otherwise — see `instance_id_for` in
  [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md))
- `type_id`, `plugin_type`, `name`, `version`, `enabled`
- `config` — instance config as **bare scalar** values (JSON)

Instance rows are written by the host-side config-update flow
(`apply_plugin_config_update`); plugins never touch these tables directly.

## Install Lifecycle

`POST /api/plugins/install` (or install-from-GitHub) runs the whole chain
synchronously — when the call returns success, the plugin is usable:

1. **Validate + copy.** The package is validated
   ([PLUGIN_PACKAGE_FORMAT.md](PLUGIN_PACKAGE_FORMAT.md)) — including the
   required `api_version` — and extracted to
   `backend/data/plugins/{plugin_id}/`. Frontend assets stay inside that
   directory and are served at `/api/plugins/{plugin_id}/static/{asset}`.
2. **Pip dependencies.** `dependencies.packages` are installed into the
   host's venv. Any failure rolls the plugin directory back and fails the
   install.
3. **Import + discover.** The loader imports `plugin.py` and registers every
   `BasePlugin` subclass that declares a `metadata = PluginMetadata(...)`
   attribute. `PluginMetadata` is validated at class-definition time, so a
   bad `display_schema.kind` or a retired display key raises **here**.
4. **Validate the result.** If the module failed to import, recorded a load
   error, or declared no plugin class, the install **rolls back**
   (directory removed) and the API returns HTTP 400 with the reason.
5. **DB registration.** The new type is registered in `plugin_types`
   (disabled by default) via `load_plugin_types_for_single`, and a
   `plugin_installed` event is emitted.
6. **Visible immediately.** The type appears in `GET /api/plugins` and the
   settings UI right away. Enable it, configure an instance, done.

## Uninstall Lifecycle

`DELETE /api/plugins/installed/{plugin_id}` reverses the chain:

1. Running instances are stopped and cleaned up (backend-plugin scheduled
   tasks unregistered).
2. Instance rows and the type row are deleted from the database.
3. The loader unloads the plugin's module and drops its type registrations
   (`unload_installed_plugin`) — the type disappears from
   `get_plugin_types()` without a restart.
4. The plugin directory (including frontend assets) is removed.
5. A `plugin_uninstalled` event is emitted.

## Startup

On server startup ([main.py](../../backend/app/main.py) lifespan):

1. `initialize_database()` runs first.
2. The loader imports built-in plugin packages and all installed plugins from
   `backend/data/plugins/`. Installed plugins whose manifest `api_version`
   doesn't match the host are **skipped loudly** with a recorded load error.
3. Types are mirrored to `plugin_types`; enabled instances are constructed
   (`cls(plugin_id, name, enabled)`), configured, and initialized.

## Load Errors

Failures surface instead of silently hiding the plugin:

- The loader records per-plugin errors (`plugin_loader.get_load_error(id)`) —
  import/syntax errors, metadata validation errors, unsupported
  `api_version`.
- At **install time** these become an HTTP 400 with the message, and the
  broken plugin is rolled back so you can fix and retry.
- At **startup/registration time** they land in `plugin_types.error_message`
  and are included in the plugin listing (`error_message` field) so the
  settings UI can show why a type is broken.

## Notes

- `requirements.restart_required` in `plugin.json` is a legacy flag: it is
  still echoed in the install response but nothing in the lifecycle needs it.
  Don't set it.
- Config values are stored as bare scalars; legacy `{value}` wrappers are
  normalized once at the API write boundary.
