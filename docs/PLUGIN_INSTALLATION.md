# Plugin Installation Guide

This guide explains how to install and manage plugins in Calvin.

## Plugin Package Structure

A plugin package is a directory or zip file containing:

```
my-plugin/
├── plugin.json          # Plugin manifest (required)
├── plugin.py            # Plugin implementation (required)
├── frontend/            # Frontend components (optional)
│   └── MyComponent.vue
└── assets/              # Static assets (optional)
    └── icon.png
```

## Plugin Manifest (plugin.json)

The `plugin.json` file defines plugin metadata:

```json
{
  "id": "my_plugin",
  "name": "My Plugin",
  "description": "A custom plugin for Calvin",
  "version": "1.0.0",
  "type": "service",
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "python": ">=3.10"
  }
}
```

### Required Fields

- **`id`**: Unique plugin identifier (lowercase, underscores)
- **`name`**: Human-readable plugin name
- **`version`**: Plugin version (semantic versioning)
- **`type`**: Plugin type (`calendar`, `image`, or `service`)

### Optional Fields

- **`description`**: Plugin description
- **`author`**: Plugin author name
- **`license`**: License type
- **`dependencies`**: Runtime dependencies

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
                "type": "api",
                "api_endpoint": "/api/web-services/{service_id}/data",
                "method": "GET",
                "component": "my_plugin/MyComponent.vue",  # Optional: custom frontend component
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
            "url": f"/api/web-services/{self.plugin_id}/data",
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

## Frontend Components

If your plugin provides frontend components, place them in the `frontend/` directory:

```
my-plugin/
├── plugin.json
├── plugin.py
└── frontend/
    └── MyComponent.vue
```

**Important**: The `frontend/` directory contents will be copied to `frontend/src/components/plugins/{plugin_id}/` during installation.

### Component Path in display_schema

The component path in `display_schema.component` should be relative to `frontend/src/components/plugins/`:

```python
"display_schema": {
    "type": "api",
    "api_endpoint": "/api/web-services/{service_id}/data",
    "method": "GET",
    "component": "my_plugin/MyComponent.vue",  # {plugin_id}/ComponentName.vue
}
```

**Example**: If your plugin ID is `my_plugin` and you have `frontend/MyComponent.vue`, the component path should be `my_plugin/MyComponent.vue`.

### Subdirectories

You can organize components in subdirectories:

```
my-plugin/
└── frontend/
    └── components/
        └── MyComponent.vue
```

Then use: `"component": "my_plugin/components/MyComponent.vue"`

### Frontend Component Installation

During installation:
1. The installer checks for a `frontend/` directory in your plugin package
2. If found, it copies the entire `frontend/` directory to `frontend/src/components/plugins/{plugin_id}/`
3. The component is then available via the path `{plugin_id}/...` in `display_schema.component`

**Note**: The frontend components are automatically loaded by the `ServiceViewer` component using the `usePluginComponent` composable. No additional frontend code changes are needed.

## Installing Plugins

### Via API

1. **Package your plugin** as a zip file containing the plugin directory structure
2. **Upload via API**:

```bash
curl -X POST "http://localhost:8000/api/plugins/install" \
  -F "file=@my-plugin.zip"
```

### Installation Process

1. Plugin package is validated (checks for `plugin.json` and `plugin.py`)
2. Plugin is extracted to `backend/data/plugins/{plugin_id}/`
3. Frontend components are copied to `frontend/src/components/plugins/{plugin_id}/`
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

