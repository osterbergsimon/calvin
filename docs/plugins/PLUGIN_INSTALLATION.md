# Plugin Installation Guide

How to install and manage plugins in Calvin. Installation is **live** — a
successfully installed plugin appears in the settings UI immediately, no
server restart.

## Plugin Package Structure

A plugin package is a directory or zip file containing:

```
my-plugin/
├── plugin.json          # Plugin manifest (required)
├── plugin.py            # The plugin class (required)
├── frontend/            # Pre-built web-component assets (optional)
│   ├── dist.js
│   └── dist.css
└── assets/              # Backend static assets (optional)
```

## Plugin Manifest (plugin.json)

Complete schema: [PLUGIN_PACKAGE_FORMAT.md](PLUGIN_PACKAGE_FORMAT.md).

### Minimal example

```json
{
  "api_version": 1,
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "service"
}
```

### Complete example

```json
{
  "api_version": 1,
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "service",
  "description": "A custom plugin for Calvin",
  "author": "Your Name",
  "license": "MIT",
  "homepage": "https://github.com/user/my-plugin",
  "keywords": ["api", "service"],
  "dependencies": {"packages": ["httpx>=0.27"]},
  "files": {
    "include": ["plugin.py", "plugin.json"],
    "exclude": ["tests/**", "*.md"]
  },
  "requirements": {"config_required": true}
}
```

Key points (details in the package format spec):

- **`api_version`** (int) is required and must match the host's supported
  contract version (currently `1`). Manifests without it — or with an older
  or newer version — are rejected with a message saying whether to update the
  plugin or update Calvin.
- **`dependencies.packages`** is the only dependency mechanism: a list of pip
  requirement strings, installed into the host venv during install.
- Retired keys (`format_version`, `protocol_version`, `python_dependencies`,
  `dependencies.python`, `dependencies.calvin`) do nothing; the plugin-repo
  validator rejects them.

## Plugin Implementation (plugin.py)

`plugin.py` declares one `BasePlugin`-family subclass with a
`metadata = PluginMetadata(...)` attribute — no module-level hooks:

```python
"""My custom plugin."""

from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class MyServicePlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="my_plugin",
        name="My Plugin",
        description="A custom plugin",
        instance_config_schema={
            "api_key": {
                "type": "password",
                "description": "API key",
                "default": "",
                "ui": {"component": "password", "validation": {"required": True}},
            },
        },
        display_schema={
            "kind": "status",
            "item": {"label": "Latest Value", "value_path": "$.value",
                     "status_path": "$.status"},
        },
    )

    async def fetch(self, start_date=None, end_date=None):
        """Return the payload display_schema binds to."""
        return {"value": "ok", "status": "ok"}
```

The host discovers the class, generates the settings form from
`instance_config_schema`, and constructs instances itself — see
[PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md) and the authoring guide
[`calvin-plugins/CREATING_PLUGINS.md`](../../../calvin-plugins/CREATING_PLUGINS.md).

## Plugin Display UI

Service plugins render through `display_schema` with a built-in `kind`
(`status`, `card-grid`, `item-list`, `iframe`, `image-with-caption`,
`metric-dashboard`, `weather-forecast`, `web-component`). For custom UI, ship
a pre-built web component under `frontend/`; it is served at
`/api/plugins/{plugin_id}/static/{asset}` and receives each data payload on
its `data` property. There is never a frontend rebuild.

Full renderer reference: [PLUGIN_FRONTEND_COMPONENTS.md](PLUGIN_FRONTEND_COMPONENTS.md).

## Installing Plugins

### Via UI (Settings Page)

1. **Upload zip file**: Settings → Plugins → Install New Plugin → choose a
   zip containing exactly one plugin.
2. **Install from GitHub**: enter the repository URL (optionally a branch),
   click "Browse Plugins", pick a plugin, click "Install".

### Via API

Upload a zip:

```bash
curl -X POST "http://localhost:8000/api/plugins/install" \
  -F "file=@my-plugin.zip"
```

Install from a GitHub repository:

```bash
# 1. Enumerate available plugins
curl "http://localhost:8000/api/plugins/enumerate-from-github?repo_url=https://github.com/user/repo&branch=main"

# 2. Install one
curl -X POST "http://localhost:8000/api/plugins/install-from-github" \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/user/repo", "plugin_path": "plugin-directory", "branch": "main"}'
```

### What happens during install

1. Package validated (structure, required fields, `api_version` gate).
2. Files extracted to `backend/data/plugins/{plugin_id}/`.
3. `dependencies.packages` pip-installed — **a failed package install rolls
   the plugin back** and the error is returned.
4. `plugin.py` imported; the plugin class is discovered and its
   `PluginMetadata` validated — **a bad kind, retired display keys, or a
   missing plugin class also roll the install back** with HTTP 400.
5. The plugin type is registered in the database (disabled by default) and is
   immediately visible in `GET /api/plugins` and the settings UI.

Details: [PLUGIN_PERSISTENCE_AND_RESTART.md](PLUGIN_PERSISTENCE_AND_RESTART.md).

### Common install errors

| Error | Cause |
|---|---|
| `plugin.json must declare api_version …` | Manifest missing `api_version`. |
| `api_version N is newer than this Calvin supports …` | Plugin targets a newer contract — update Calvin. |
| `api_version N is no longer supported …` | Stale plugin — update/reinstall it from the plugin repository. |
| `pip install failed for '<req>' …` | A `dependencies.packages` entry failed; the plugin was rolled back. |
| `Plugin <id> failed validation: …` | `plugin.py` didn't import cleanly or declares no valid plugin class; rolled back. |
| `Plugin <id> is already installed` | Uninstall first, or force-reinstall. |

## Managing Installed Plugins

```bash
# List installed plugins
curl "http://localhost:8000/api/plugins/installed"

# Get a plugin's manifest
curl "http://localhost:8000/api/plugins/installed/{plugin_id}"

# Uninstall (stops instances, removes DB rows, unloads the module, deletes files)
curl -X DELETE "http://localhost:8000/api/plugins/installed/{plugin_id}"
```

## Plugin Discovery at Startup

Installed plugins are also loaded on application startup:

1. The loader scans `backend/data/plugins/`.
2. Each plugin's manifest `api_version` is checked — mismatches are skipped
   with a recorded load error (surfaced as `error_message` in the plugin
   listing).
3. Each `plugin.py` is imported and its plugin class registered.

## Best Practices

1. **Use semantic versioning** for the `version` field.
2. **Validate configuration** in `validate_config` (async classmethod).
3. **Return actionable error strings** in data payloads — they surface on
   the dashboard.
4. **Declare dependencies** in `dependencies.packages`.
5. **Test before distribution** — run the plugin's test suite against the
   Calvin backend (see CREATING_PLUGINS.md).
6. **Follow naming conventions**: lowercase ids with underscores/hyphens.

## Examples

Reference plugin: [`mealie/`](../../../calvin-plugins/mealie) in
`calvin-plugins`. Built-in plugins: `backend/app/plugins/{calendar,image,service}/`.
