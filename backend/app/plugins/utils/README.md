# Plugin Utilities

This module provides utilities to simplify plugin development by eliminating boilerplate code.

## Config Utilities

### `extract_config_value()`

Extract and normalize a config value, handling schema objects and type conversion.

```python
from app.plugins.utils import extract_config_value, to_int, to_bool

# In create_plugin_instance hook:
count = extract_config_value(config, "count", default=30, converter=to_int)
enabled = extract_config_value(config, "enabled", default=False, converter=to_bool)
```

### `normalize_config_value()`

Normalize a single config value, extracting from schema objects if needed.

```python
from app.plugins.utils import normalize_config_value

# Handles schema objects: {"value": "actual_value"} or {"default": "default_value"}
value = normalize_config_value(config.get("my_field"), default="default")
```

### `normalize_config_dict()`

Normalize an entire config dictionary.

```python
from app.plugins.utils import normalize_config_dict

normalized = normalize_config_dict(config, schema={
    "count": {"default": 30, "type": int},
    "enabled": {"default": False, "converter": to_bool},
})
```

## Instance Management Utilities

### `handle_plugin_config_update_generic()`

Generic implementation of `handle_plugin_config_update` hook that eliminates 200-300+ lines of boilerplate.

**Before (200+ lines):**
```python
@hookimpl
async def handle_plugin_config_update(type_id, config, enabled, db_type, session):
    if type_id != "my_plugin":
        return None
    
    # 200+ lines of database queries, plugin registration, lifecycle management...
```

**After (20-30 lines):**
```python
from app.plugins.utils import InstanceManagerConfig, handle_plugin_config_update_generic
from app.plugins.utils.config import extract_config_value, to_int

@hookimpl
async def handle_plugin_config_update(type_id, config, enabled, db_type, session):
    manager_config = InstanceManagerConfig(
        type_id="my_plugin",
        single_instance=False,  # or True for single-instance plugins
        validate_config=lambda c: bool(extract_config_value(c, "required_field")),
        generate_instance_id=lambda c, t: f"{t}-{hash(str(c))}",
        normalize_config=lambda c: {
            "count": extract_config_value(c, "count", default=30, converter=to_int),
            "enabled": extract_config_value(c, "enabled", default=False, converter=to_bool),
        },
        default_instance_name="My Plugin Instance",
    )
    
    return await handle_plugin_config_update_generic(
        type_id, config, enabled, db_type, session, manager_config
    )
```

### Configuration Options

- `single_instance`: If True, only one instance allowed (uses fixed `instance_id`)
- `instance_id`: Fixed instance ID for single-instance plugins
- `validate_config`: Function to validate config before creating instance
- `generate_instance_id`: Function to generate instance ID from config
- `normalize_config`: Function to normalize config values
- `prepare_instance_config`: Function to prepare final config for instance creation
- `on_instance_created`: Callback after instance is created
- `on_instance_updated`: Callback after instance is updated
- `default_instance_name`: Default name for instances

## Migration Examples

### Simple Plugin (Single Instance)

```python
from app.plugins.utils import InstanceManagerConfig, handle_plugin_config_update_generic

@hookimpl
async def handle_plugin_config_update(type_id, config, enabled, db_type, session):
    if type_id != "simple_plugin":
        return None
    
    manager_config = InstanceManagerConfig(
        type_id="simple_plugin",
        single_instance=True,
        instance_id="simple-plugin-instance",
        default_instance_name="Simple Plugin",
    )
    
    return await handle_plugin_config_update_generic(
        type_id, config, enabled, db_type, session, manager_config
    )
```

### Multi-Instance Plugin with Validation

```python
from app.plugins.utils import InstanceManagerConfig, handle_plugin_config_update_generic
from app.plugins.utils.config import extract_config_value

@hookimpl
async def handle_plugin_config_update(type_id, config, enabled, db_type, session):
    if type_id != "multi_plugin":
        return None
    
    def validate_config(c):
        required = extract_config_value(c, "required_field")
        return bool(required)
    
    def generate_id(c, t):
        key = extract_config_value(c, "unique_key", default="")
        return f"{t}-{hash(key) % 10000}"
    
    def normalize(c):
        return {
            "field1": extract_config_value(c, "field1", default="default"),
            "field2": extract_config_value(c, "field2", default=0, converter=int),
        }
    
    manager_config = InstanceManagerConfig(
        type_id="multi_plugin",
        single_instance=False,
        validate_config=validate_config,
        generate_instance_id=generate_id,
        normalize_config=normalize,
        default_instance_name="Multi Plugin Instance",
    )
    
    return await handle_plugin_config_update_generic(
        type_id, config, enabled, db_type, session, manager_config
    )
```

## Benefits

- **70-80% code reduction** in `handle_plugin_config_update` hooks
- **30-50% code reduction** in `create_plugin_instance` hooks
- **40-60% code reduction** in `configure` methods
- Consistent patterns across all plugins
- Easier to maintain and test
- Less boilerplate for plugin developers
