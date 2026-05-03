# Plugin Installation Guide

This guide explains how to install and manage plugins in Calvin.

## Plugin Package Structure

A plugin package is a directory or zip file containing:

```
my-plugin/
├── plugin.json          # Plugin manifest (required)
├── plugin.py            # Plugin implementation (required)
├── frontend/            # Pre-built web component/static assets (optional)
│   ├── dist.js
│   └── dist.css
└── assets/              # Static assets (optional)
    └── icon.png
```

## Plugin Manifest (plugin.json)

The `plugin.json` file defines plugin metadata, dependencies, and installation requirements.

**See [PLUGIN_PACKAGE_FORMAT.md](./PLUGIN_PACKAGE_FORMAT.md#plugin-manifest-schema-pluginjson) for the complete schema specification.**

### Minimal Example

```json
{
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "service"
}
```

### Complete Example

```json
{
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "service",
  "description": "A custom plugin for Calvin",
  "author": "Your Name",
  "license": "MIT",
  "homepage": "https://github.com/user/my-plugin",
  "keywords": ["api", "service"],
  "dependencies": {
    "python": ">=3.10",
    "packages": {
      "requests": ">=2.28.0",
      "pydantic": "^2.0.0"
    },
    "calvin": ">=1.0.0"
  },
  "files": {
    "include": ["plugin.py", "config.yaml"],
    "exclude": ["tests/**", "*.md"]
  },
  "requirements": {
    "restart_required": true,
    "permissions": ["network"],
    "config_required": true
  }
}
```

### Required Fields

- **`id`**: Unique plugin identifier (lowercase, underscores, hyphens)
- **`name`**: Human-readable plugin name
- **`version`**: Plugin version (semantic versioning)
- **`type`**: Plugin type (`calendar`, `image`, or `service`)

### Optional Fields

#### Metadata
- **`description`**: Plugin description
- **`author`**: Plugin author name
- **`license`**: License type (e.g., `"MIT"`, `"Apache-2.0"`)
- **`homepage`**: Plugin homepage URL
- **`repository`**: Source code repository URL
- **`bugs`**: Bug tracker URL
- **`keywords`**: Array of tags for discovery

#### Dependencies
- **`dependencies.python`**: Required Python version (e.g., `">=3.10"`)
- **`dependencies.packages`**: Python package dependencies (PyPI names with version constraints)
- **`dependencies.system`**: System-level dependencies
- **`dependencies.calvin`**: Minimum required Calvin version

#### Files
- **`files.include`**: Array of files/directories to include (glob patterns)
- **`files.exclude`**: Array of files/directories to exclude (glob patterns)

#### Requirements
- **`requirements.restart_required`**: Whether restart is needed after installation (default: `true`)
- **`requirements.permissions`**: Array of required permissions (e.g., `["network", "filesystem"]`)
- **`requirements.config_required`**: Whether configuration is required before use (default: `false`)

## Plugin Implementation (plugin.py)

The `plugin.py` file contains the plugin implementation using pluggy hooks:

```python
"""My custom plugin."""

from typing import Any
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import ServicePlugin


class MyServicePlugin(ServicePlugin):
    """My custom service plugin."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return {
            "type_id": "my_plugin",
            "plugin_type": PluginType.SERVICE,
            "name": "My Plugin",
            "description": "A custom plugin",
            "version": "1.0.0",
            "common_config_schema": {
                "api_key": {
                    "type": "password",
                    "description": "API key",
                    "ui": {
                        "component": "password",
                        "validation": {"required": True},
                    },
                },
            },
            "display_schema": {
                "kind": "status-tile",
                "label": "Latest Value",
                "value_path": "$.value",
                "status_path": "$.status",
            },
            "plugin_class": cls,
        }

    def __init__(self, plugin_id: str, name: str, api_key: str, enabled: bool = True):
        """Initialize plugin."""
        super().__init__(plugin_id, name, enabled)
        self.api_key = api_key

    async def initialize(self) -> None:
        """Initialize the plugin."""
        pass

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        pass

    async def get_content(self) -> dict[str, Any]:
        """Get service content for display."""
        return {
            "type": "api",
            "url": f"/api/plugins/{self.plugin_id}/data",
        }


# Register plugin with pluggy
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register plugin type."""
    return [MyServicePlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> MyServicePlugin | None:
    """Create plugin instance."""
    if type_id != "my_plugin":
        return None

    enabled = config.get("enabled", False)
    api_key = config.get("api_key", "")

    return MyServicePlugin(
        plugin_id=plugin_id,
        name=name,
        api_key=api_key,
        enabled=enabled,
    )
```

## Plugin Display UI

Service plugins render through `display_schema`. Prefer built-in schema renderers for normal
dashboard content, and use a web component only when the built-in renderers are not expressive
enough.

### Built-In Schema Renderers

The frontend dispatches `display_schema.kind` to a built-in renderer. Supported kinds include:

- `status-tile`
- `status-list`
- `status-row`
- `card-grid`
- `item-list`
- `iframe`
- `image-with-caption`
- `metric-dashboard`
- `weather-forecast`
- `web-component`

Example:

```python
"display_schema": {
    "kind": "status-tile",
    "label": "Latest Value",
    "value_path": "$.value",
    "status_path": "$.status",
}
```

### Web Components

If your plugin needs custom UI, ship a pre-built browser-native web component in the
`frontend/` directory:

```
my-plugin/
├── plugin.json
├── plugin.py
└── frontend/
    ├── dist.js
    └── dist.css
```

The JavaScript module must register the custom element named by `display_schema.element`:

```python
"display_schema": {
    "kind": "web-component",
    "element": "calvin-my-plugin",
    "module": "dist.js",
    "stylesheet": "dist.css",
}
```

At runtime, Calvin loads these assets through:

```text
/api/plugins/{plugin_id}/static/dist.js
/api/plugins/{plugin_id}/static/dist.css
```

Calvin assigns the latest service data to the custom element's `data` property.

### Frontend Asset Installation

During installation:
1. The installer checks for a `frontend/` directory in your plugin package
2. If found, it stores the directory under `backend/data/plugins/{plugin_id}/frontend/`
3. The static asset endpoint serves files from that directory

Schema and web-component plugins do not require a frontend rebuild after installation.

## Installing Plugins

**See [PLUGIN_PACKAGE_FORMAT.md](./PLUGIN_PACKAGE_FORMAT.md) for the complete package format specification.**

### Via UI (Settings Page)

1. **Upload Zip File**: Navigate to Settings → Plugins → Install New Plugin
   - Click "Choose Zip File" and select a plugin zip file
   - Zip files must contain exactly one plugin

2. **Install from GitHub**:
   - Enter GitHub repository URL
   - Optionally specify a branch (defaults to main/master)
   - Click "Browse Plugins" to see available plugins
   - Select a plugin from the list and click "Install"

### Via API

#### Upload Zip File

1. **Package your plugin** as a zip file containing exactly one plugin
2. **Upload via API**:

```bash
curl -X POST "http://localhost:8000/api/plugins/install" \
  -F "file=@my-plugin.zip"
```

#### Install from GitHub Repository

1. **Enumerate available plugins**:

```bash
curl "http://localhost:8000/api/plugins/enumerate-from-github?repo_url=https://github.com/user/repo&branch=main"
```

2. **Install a specific plugin**:

```bash
curl -X POST "http://localhost:8000/api/plugins/install-from-github" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/user/repo",
    "plugin_path": "plugin-directory",
    "branch": "main"
  }'
```

### Installation Process

1. Plugin package is validated (checks for `plugin.json` and `plugin.py`)
2. Plugin is extracted to `backend/data/plugins/{plugin_id}/`
3. Frontend static assets are stored with the installed plugin, if present
4. Plugin is loaded and registered with pluggy
5. Plugin type is added to the database (disabled by default)

## Managing Installed Plugins

### List Installed Plugins

```bash
curl "http://localhost:8000/api/plugins/installed"
```

### Get Plugin Manifest

```bash
curl "http://localhost:8000/api/plugins/installed/{plugin_id}"
```

### Uninstall Plugin

```bash
curl -X DELETE "http://localhost:8000/api/plugins/installed/{plugin_id}"
```

## Plugin Discovery

Installed plugins are automatically discovered and loaded on application startup. The plugin loader:

1. Scans `backend/data/plugins/` for installed plugins
2. Loads each plugin's `plugin.py` file
3. Registers plugins with pluggy
4. Makes plugins available through the plugin registry

## Best Practices

1. **Use semantic versioning** for plugin versions
2. **Validate configuration** in `validate_config()` method
3. **Handle errors gracefully** with proper error messages
4. **Document dependencies** in `plugin.json`
5. **Test plugins** before distribution
6. **Follow naming conventions**: lowercase with underscores for IDs

## Example Plugin Package

See the built-in plugins in `backend/app/plugins/` for reference implementations.
