# Testing Plugin Hooks

This document explains how to test `handle_plugin_config_update` hooks for plugins.

## Overview

Plugin hooks that handle configuration updates require database access and backend test fixtures. These cannot be tested directly from the plugin directory, so we use a two-tier testing approach:

1. **Plugin class tests** (in plugin directories): Test plugin methods (metadata, init, validate_config, configure, etc.)
2. **Hook integration tests** (in backend): Test that hooks correctly integrate with the generic instance manager

## Test Files

### Plugin Test Files (`calvin-plugins/*/test_*.py`)

These test files:
- Test plugin class methods (can run independently)
- Skip `handle_plugin_config_update` tests with clear instructions (requires backend fixtures)
- Can be run from either plugin directory or backend directory

### Backend Hook Test File (`backend/tests/unit/test_plugin_hooks.py`)

This test file:
- Loads plugin hooks directly from plugin files
- Tests that `handle_plugin_config_update` hooks correctly call `handle_plugin_config_update_generic`
- Verifies database entries are created correctly
- Uses the `test_db` fixture for proper database isolation

### Generic Handler Test File (`backend/tests/unit/test_plugin_instance_manager.py`)

This comprehensive test suite:
- Tests `handle_plugin_config_update_generic` (which all plugin hooks now use)
- Covers single-instance and multi-instance plugins
- Tests instance creation, updates, validation, callbacks
- Provides the foundation for understanding hook behavior

## Running Tests

### Test Plugin Class Methods

From plugin directory:
```bash
cd calvin-plugins/picsum
pytest test_picsum.py -v
```

Or from backend directory:
```bash
cd backend
pytest ../calvin-plugins/picsum/test_picsum.py -v
```

### Test Plugin Hooks

From backend directory:
```bash
cd backend

# Test all plugin hooks
pytest tests/unit/test_plugin_hooks.py -v

# Test specific plugin hook
pytest tests/unit/test_plugin_hooks.py::TestPluginHooks::test_picsum_handle_plugin_config_update -v
```

### Test Generic Instance Manager

From backend directory:
```bash
cd backend
pytest tests/unit/test_plugin_instance_manager.py -v
```

## Adding Tests for New Plugins

To add hook tests for a new plugin:

1. **Update `test_plugin_hooks.py`** in the backend:
   ```python
   async def test_my_plugin_handle_plugin_config_update(self, test_db):
       """Test My Plugin handle_plugin_config_update hook."""
       # Find plugin directory
       backend_dir = Path(__file__).parent.parent.parent
       calvin_dir = backend_dir.parent
       plugin_dir = calvin_dir.parent / "calvin-plugins"
       plugin_path = plugin_dir / "my-plugin" / "plugin.py"
       
       # Load plugin module
       import importlib.util
       spec = importlib.util.spec_from_file_location("my_plugin", plugin_path)
       module = importlib.util.module_from_spec(spec)
       spec.loader.exec_module(module)
       handle_config_update = module.handle_plugin_config_update
       
       # Test the hook with mocked dependencies
       # ... (see existing tests for pattern)
   ```

2. **Ensure plugin test file** has a skipped test for `handle_plugin_config_update` with clear instructions pointing to this test file.

## Why This Approach?

- **Separation of concerns**: Plugin class logic can be tested independently
- **Database isolation**: Hook tests use proper database fixtures and cleanup
- **Comprehensive coverage**: Generic handler tests + plugin hook tests ensure correctness
- **Maintainability**: Changes to generic handler don't require updating every plugin test

## Test Structure

```
calvin/
├── backend/
│   └── tests/
│       └── unit/
│           ├── test_plugin_hooks.py          # Hook integration tests
│           └── test_plugin_instance_manager.py  # Generic handler tests
└── calvin-plugins/
    └── picsum/
        ├── plugin.py
        └── test_picsum.py                     # Plugin class tests
```

## See Also

- [Plugin Instance Simplification Plan](../../PLUGIN_INSTANCE_SIMPLIFICATION_PLAN.md) - Overview of the simplification approach
- [Creating Plugins](../../../calvin-plugins/CREATING_PLUGINS.md) - Plugin development guide with testing instructions
- [Generic Instance Manager](../../app/plugins/utils/instance_manager.py) - Implementation of `handle_plugin_config_update_generic`
