# Plugin Development Guide

This guide explains how to create plugins for Calvin. The plugin system uses `pluggy` for automatic discovery and registration, making it easy to add new functionality without modifying core code.

## Table of Contents

1. [Plugin Architecture](#plugin-architecture)
2. [Plugin Types](#plugin-types)
3. [Creating a Plugin](#creating-a-plugin)
4. [Plugin Metadata](#plugin-metadata)
5. [UI Schema](#ui-schema)
6. [Example Plugins](#example-plugins)
7. [Best Practices](#best-practices)

## Plugin Architecture

Calvin uses a self-contained plugin architecture where each plugin:

- **Registers itself** via `pluggy` hooks
- **Provides its own metadata** including configuration schema and UI definitions
- **Is automatically discovered** when the module is imported
- **Requires no code changes** to core files when adding new plugins

### Key Components

- **`BasePlugin`**: Abstract base class all plugins inherit from
- **`PluginType`**: Enum defining plugin categories (CALENDAR, IMAGE, SERVICE)
- **Protocol Classes**: Specific interfaces for each plugin type (`CalendarPlugin`, `ImagePlugin`, `ServicePlugin`)
- **Pluggy Hooks**: `register_plugin_types()` and `create_plugin_instance()` for auto-discovery

## Plugin Types

### Calendar Plugins

Provide calendar events from external sources (Google Calendar, iCal, etc.).

**Required Methods:**
- `fetch_events(start_date, end_date)` - Fetch events for a date range
- `validate_config(config)` - Validate configuration

**Example Use Cases:**
- Google Calendar integration
- iCal/ICS feed parsing
- CalDAV servers

### Image Plugins

Provide images from various sources (local filesystem, APIs, etc.).

**Required Methods:**
- `get_images()` - Get all available images
- `get_image(image_id)` - Get image metadata by ID
- `get_image_data(image_id)` - Get image file data
- `scan_images()` - Scan for new/updated images
- `upload_image(file_data, filename)` - Optional: upload support
- `delete_image(image_id)` - Optional: deletion support

**Example Use Cases:**
- Local filesystem image directory
- Unsplash API
- IMAP email attachments
- Cloud storage (S3, etc.)

### Service Plugins

Display web services, APIs, or custom content (iframes, meal plans, etc.).

**Required Methods:**
- `get_content()` - Get service content for display
- `validate_config(config)` - Validate configuration

**Optional Methods:**
- `handle_webhook(payload)` - Handle incoming webhooks
- `handle_api_request(method, path, data)` - Handle API requests

**Example Use Cases:**
- Iframe embeds
- API-driven displays (Mealie meal plans, etc.)
- Webhook receivers

## Creating a Plugin

### Step 1: Choose Plugin Type and Location

Create your plugin file in the appropriate directory:

```
backend/app/plugins/
├── calendar/     # Calendar plugins
│   └── my_calendar.py
├── image/        # Image plugins
│   └── my_image.py
└── service/      # Service plugins
    └── my_service.py
```

### Step 2: Create Plugin Class

Inherit from the appropriate protocol class:

```python
from app.plugins.base import PluginType
from app.plugins.protocols import ServicePlugin
from app.plugins.hooks import hookimpl

class MyServicePlugin(ServicePlugin):
    """My custom service plugin."""
    
    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Return plugin metadata for registration."""
        return {
            "type_id": "my_service",
            "plugin_type": PluginType.SERVICE,
            "name": "My Service",
            "description": "Description of my service",
            "version": "1.0.0",
            "common_config_schema": {
                # Configuration schema (see below)
            },
        }
    
    def __init__(self, plugin_id: str, name: str, ...):
        super().__init__(plugin_id, name)
        # Initialize your plugin
    
    async def initialize(self) -> None:
        """Initialize the plugin."""
        pass
    
    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        pass
    
    async def get_content(self) -> dict[str, Any]:
        """Get service content."""
        return {
            "type": "iframe",
            "url": "https://example.com",
        }
    
    async def validate_config(self, config: dict[str, Any]) -> bool:
        """Validate configuration."""
        return True
```

### Step 3: Register Plugin Hooks

Add hook implementations at the module level:

```python
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register this plugin type."""
    return [MyServicePlugin.get_plugin_metadata()]

@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> MyServicePlugin | None:
    """Create a plugin instance."""
    if type_id != "my_service":
        return None
    
    return MyServicePlugin(
        plugin_id=plugin_id,
        name=name,
        # ... extract config values
    )
```

### Step 4: Import Plugin Module

Add an import in `backend/app/plugins/__init__.py` to trigger auto-discovery:

```python
from app.plugins.service import my_service  # noqa: F401
```

## Plugin Metadata

The `get_plugin_metadata()` method returns a dictionary with:

### Required Fields

- **`type_id`**: Unique identifier (e.g., `"mealie"`, `"local"`, `"google"`)
- **`plugin_type`**: Plugin category (`PluginType.CALENDAR`, `PluginType.IMAGE`, or `PluginType.SERVICE`)
- **`name`**: Human-readable name
- **`description`**: Plugin description

### Optional Fields

- **`version`**: Plugin version (default: `"1.0.0"`)
- **`common_config_schema`**: Configuration schema (see [UI Schema](#ui-schema))
- **`ui_actions`**: List of action buttons (Save, Test, Fetch, etc.)
- **`ui_sections`**: List of UI sections for file uploads, etc.
- **`display_schema`**: Schema for displaying service content (Service plugins only)
- **`plugin_class`**: Plugin class reference

## UI Schema

The `common_config_schema` defines configuration fields and their UI representation.

### Basic Field Schema

```python
"common_config_schema": {
    "field_name": {
        "type": "string",  # string, integer, boolean, password, etc.
        "description": "Field description",
        "default": "default_value",
        "ui": {
            "component": "input",  # input, password, number, textarea, select, etc.
            "placeholder": "Enter value...",
            "help_text": "Additional help text",
            "validation": {
                "required": True,
                "type": "url",  # url, email, etc.
                "min": 1,
                "max": 100,
            },
        },
    },
}
```

### Field Types

- **`string`**: Text input
- **`password`**: Password input (masked)
- **`integer`**: Number input
- **`boolean`**: Checkbox
- **`textarea`**: Multi-line text

### UI Components

- **`input`**: Standard text input
- **`password`**: Password input
- **`number`**: Number input
- **`textarea`**: Multi-line textarea
- **`select`**: Dropdown (requires `options` in UI)

### Special Features

#### Browse Button

For directory/file selection:

```python
"ui": {
    "component": "input",
    "browse_button": True,  # Shows browse button
    "browse_type": "directory",  # or "file"
}
```

#### Help Text

```python
"ui": {
    "help_text": "This field does something important",
}
```

### UI Actions

Define action buttons (Save, Test, Fetch, etc.):

```python
"ui_actions": [
    {
        "id": "save",
        "type": "save",
        "label": "Save Settings",
        "style": "primary",
    },
    {
        "id": "test",
        "type": "test",
        "label": "Test Connection",
        "style": "secondary",
    },
]
```

### UI Sections

For file uploads or complex inputs:

```python
"ui_sections": [
    {
        "id": "file_upload",
        "title": "Upload Files",
        "type": "file_upload",
        "fields": ["file_path"],
        "accept": ".jpg,.png",
    },
]
```

## Display Schema (Service Plugins)

Service plugins can define how their content is displayed:

```python
"display_schema": {
    "type": "api",  # "iframe" or "api"
    "api_endpoint": "/api/web-services/{service_id}/endpoint",
    "method": "GET",
    "render_template": "custom_template",  # Custom frontend template
    "data_schema": {
        # Schema for the API response
    },
}
```

## Example Plugins

### Example 1: Simple Service Plugin (Iframe)

```python
"""Simple iframe service plugin."""

from typing import Any
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import ServicePlugin

class IframeServicePlugin(ServicePlugin):
    """Iframe service plugin."""
    
    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        return {
            "type_id": "iframe",
            "plugin_type": PluginType.SERVICE,
            "name": "Iframe Service",
            "description": "Display external websites in an iframe",
            "version": "1.0.0",
            "common_config_schema": {
                "url": {
                    "type": "string",
                    "description": "Website URL",
                    "default": "",
                    "ui": {
                        "component": "input",
                        "placeholder": "https://example.com",
                        "validation": {
                            "required": True,
                            "type": "url",
                        },
                    },
                },
            },
            "display_schema": {
                "type": "iframe",
                "render_template": "iframe",
            },
        }
    
    def __init__(self, plugin_id: str, name: str, url: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self.url = url
    
    async def initialize(self) -> None:
        """Initialize plugin."""
        pass
    
    async def cleanup(self) -> None:
        """Cleanup plugin."""
        pass
    
    async def get_content(self) -> dict[str, Any]:
        return {
            "type": "iframe",
            "url": self.url,
        }
    
    async def validate_config(self, config: dict[str, Any]) -> bool:
        url = config.get("url", "")
        return bool(url and (url.startswith("http://") or url.startswith("https://")))

@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    return [IframeServicePlugin.get_plugin_metadata()]

@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> IframeServicePlugin | None:
    if type_id != "iframe":
        return None
    
    url = config.get("url", "")
    enabled = config.get("enabled", True)
    
    return IframeServicePlugin(
        plugin_id=plugin_id,
        name=name,
        url=url,
        enabled=enabled,
    )
```

### Example 2: Image Plugin with File Upload

```python
"""Local image plugin with directory selection."""

from pathlib import Path
from typing import Any
from app.plugins.base import PluginType
from app.plugins.hooks import hookimpl
from app.plugins.protocols import ImagePlugin

class LocalImagePlugin(ImagePlugin):
    """Local filesystem image plugin."""
    
    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        return {
            "type_id": "local",
            "plugin_type": PluginType.IMAGE,
            "name": "Local Images",
            "description": "Load images from local directory",
            "version": "1.0.0",
            "common_config_schema": {
                "image_dir": {
                    "type": "string",
                    "description": "Image directory path",
                    "default": "./data/images",
                    "ui": {
                        "component": "input",
                        "placeholder": "./data/images",
                        "browse_button": True,
                        "browse_type": "directory",
                        "help_text": "Select directory containing images",
                    },
                },
            },
            "ui_actions": [
                {
                    "id": "save",
                    "type": "save",
                    "label": "Save Settings",
                    "style": "primary",
                },
            ],
        }
    
    def __init__(self, plugin_id: str, name: str, image_dir: str, enabled: bool = True):
        super().__init__(plugin_id, name, enabled)
        self.image_dir = Path(image_dir)
        self.thumbnail_dir = self.image_dir / "thumbnails"
    
    async def initialize(self) -> None:
        """Initialize plugin - create directories if needed."""
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnail_dir.mkdir(parents=True, exist_ok=True)
    
    async def cleanup(self) -> None:
        """Cleanup plugin."""
        pass
    
    async def get_images(self) -> list[dict[str, Any]]:
        """Get all images."""
        images = []
        for img_file in self.image_dir.glob("*.jpg"):
            images.append({
                "id": img_file.stem,
                "filename": img_file.name,
                "path": str(img_file),
                "source": self.plugin_id,
            })
        return images
    
    # ... implement other required methods
    
    async def validate_config(self, config: dict[str, Any]) -> bool:
        image_dir = config.get("image_dir", "")
        return bool(image_dir and Path(image_dir).exists())

@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    return [LocalImagePlugin.get_plugin_metadata()]

@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> LocalImagePlugin | None:
    if type_id != "local":
        return None
    
    image_dir = config.get("image_dir", "./data/images")
    enabled = config.get("enabled", True)
    
    return LocalImagePlugin(
        plugin_id=plugin_id,
        name=name,
        image_dir=image_dir,
        enabled=enabled,
    )
```

### Example 3: API-Driven Service Plugin

See `backend/app/plugins/service/mealie.py` for a complete example of:
- API authentication
- Backend proxy endpoints
- Custom frontend rendering
- Date range configuration
- Clickable recipe links

## Best Practices

### 1. Self-Contained Plugins

- All plugin code should be in one module
- No dependencies on other plugins
- Register yourself via hooks

### 2. Configuration Handling

- Always validate configuration in `validate_config()`
- Handle missing/optional fields gracefully
- Store configuration in `_config` or instance variables

### 3. Error Handling

- Use try/except for external API calls
- Return `None` or empty lists on errors
- Log errors appropriately

### 4. Resource Management

- Clean up resources in `cleanup()`
- Close connections, files, etc.
- Handle async operations properly

### 5. UI Schema

- Provide helpful placeholders and help text
- Use appropriate validation rules
- Make required fields clear

### 6. Testing

- Test plugin initialization
- Test configuration validation
- Test core functionality
- Test error cases

### 7. Documentation

- Document your plugin's purpose
- Explain configuration options
- Provide usage examples

## Plugin Lifecycle

1. **Discovery**: Plugin module is imported, hooks are registered
2. **Registration**: `register_plugin_types()` is called, metadata is stored
3. **Instance Creation**: `create_plugin_instance()` is called when plugin is configured
4. **Initialization**: `initialize()` is called after instance creation
5. **Configuration**: `configure()` is called when settings change
6. **Runtime**: Plugin methods are called as needed
7. **Cleanup**: `cleanup()` is called when plugin is disabled/removed

## Troubleshooting

### Plugin Not Appearing

- Check that module is imported in `__init__.py`
- Verify `register_plugin_types()` hook is implemented
- Check for import errors in logs

### Configuration Not Saving

- Ensure `common_config_schema` is defined correctly
- Check that field names match in `configure()`
- Verify `validate_config()` returns `True`

### UI Not Rendering

- Check `ui` metadata in schema
- Verify component types are supported
- Check browser console for errors

## Additional Resources

- See existing plugins in `backend/app/plugins/` for examples
- Check `backend/app/plugins/base.py` for base classes
- Review `backend/app/plugins/protocols.py` for interfaces
- Look at `backend/app/plugins/hooks.py` for hook specifications

