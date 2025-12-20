# Plugin Interface Specification

This document defines the well-defined interface between core and plugins.

## Design Principles

1. **MUST methods**: Abstract methods that plugins MUST implement
2. **CAN methods**: Non-abstract methods with default implementations that plugins CAN override
3. **No ad-hoc method checking**: Core code MUST NEVER use `hasattr()` or `getattr()` to access plugin functionality
4. **Type safety**: Core code MUST use `isinstance()` checks to ensure plugins conform to protocols
5. **Protocol-based**: All communication between core and plugins MUST go through defined protocol methods

## BasePlugin Interface

All plugins inherit from `BasePlugin` which defines the common interface:

### MUST Implement:
- `plugin_type` (property): Return the plugin type (CALENDAR, IMAGE, or SERVICE)
- `get_plugin_metadata()` (classmethod): Return plugin metadata for registration
- `initialize()`: Initialize the plugin (e.g., load configuration, connect to services)
- `cleanup()`: Cleanup plugin resources (e.g., close connections, save state)

### CAN Override:
- `configure(config)`: Configure the plugin with settings (default: stores config)
- `get_config()`: Get current plugin configuration (default: returns stored config)
- `enable()`: Enable the plugin
- `disable()`: Disable the plugin
- `start()`: Start the plugin (mark as running)
- `stop()`: Stop the plugin (mark as not running)
- `is_running()`: Check if plugin is running

## CalendarPlugin Interface

### MUST Implement:
- `fetch_events(start_date, end_date)`: Fetch calendar events for a date range
- `validate_config(config)`: Validate plugin configuration

## ImagePlugin Interface

### MUST Implement:
- `get_images()`: Get list of all available images
- `get_image(image_id)`: Get image metadata by ID
- `get_image_data(image_id)`: Get image file data by ID
- `scan_images()`: Scan for new/updated images
- `validate_config(config)`: Validate plugin configuration

### CAN Implement:
- `upload_image(file_data, filename)`: Upload an image (optional)
- `delete_image(image_id)`: Delete an image (optional)
- `get_thumbnail_path(image_id)`: Get thumbnail file path (optional)

## ServicePlugin Interface

### MUST Implement:
- `get_content()`: Get service content for display
- `validate_config(config)`: Validate plugin configuration

### CAN Implement:
- `handle_webhook(payload)`: Handle incoming webhook (optional)
- `handle_api_request(method, path, data)`: Handle API request (optional)
- `fetch_service_data(start_date, end_date)`: Fetch service data for display (optional)

## Hooks (Pluggy-based)

For operations that require plugin-specific logic beyond the standard protocol:

- `test_plugin_connection(type_id, config)`: Test plugin connection/configuration
- `fetch_plugin_data(type_id, instance_id)`: Manually trigger plugin fetch/check operation
- `fetch_service_data(instance_id, start_date, end_date)`: Fetch service data via hooks (alternative to protocol method)
- `handle_plugin_config_update(type_id, config, enabled, db_type, session)`: Handle plugin-specific configuration updates

## Core Code Rules

1. **NEVER use `hasattr()`** to check for plugin methods - use protocol methods only
2. **NEVER use `getattr()`** to access plugin attributes - use protocol methods only
3. **ALWAYS use `isinstance()`** to verify plugin type before calling protocol methods
4. **ALWAYS use protocol-defined methods** - never call private methods (methods starting with `_`)
5. **Check return values** - optional methods return `None` if not supported

## Example: Correct Usage

```python
# ✅ CORRECT: Use protocol methods
if isinstance(plugin, ServicePlugin):
    content = await plugin.get_content()
    data = await plugin.fetch_service_data()  # Returns None if not supported
    if data is not None:
        return data
```

## Example: Incorrect Usage

```python
# ❌ WRONG: Using hasattr()
if hasattr(plugin, "_fetch_meal_plan"):
    data = await plugin._fetch_meal_plan()

# ❌ WRONG: Using getattr()
url = getattr(plugin, "url", "")

# ❌ WRONG: Calling private methods
data = await plugin._fetch_weather()
```

