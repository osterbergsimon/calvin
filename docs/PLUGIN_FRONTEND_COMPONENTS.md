# Plugin Frontend Components

## Overview

Yes, the plugin installation process **does handle frontend components** provided by plugins. When a plugin includes a `frontend/` directory, it is automatically copied to the frontend during installation.

## How It Works

### Installation Process

When installing a plugin (from zip or GitHub), the installer:

1. **Checks for `frontend/` directory** in the plugin package
2. **Copies the entire `frontend/` directory** to `frontend/src/components/plugins/{plugin_id}/`
3. **Makes components available** via the path `{plugin_id}/ComponentName.vue`

### Code Location

The frontend component installation logic is in `backend/app/services/plugin_installer.py`:

```python
# Install frontend components if they exist
frontend_source = plugin_path / "frontend"
if frontend_source.exists():
    frontend_dest = self.get_frontend_plugin_path(install_id)
    if frontend_dest.exists():
        shutil.rmtree(frontend_dest)
    shutil.copytree(frontend_source, frontend_dest)
```

This works for:
- ✅ **Zip file installations** - extracts plugin, then copies frontend/
- ✅ **GitHub installations** - downloads repo, extracts plugin, then copies frontend/
- ✅ **Directory installations** - copies plugin directory, then copies frontend/

### Example: Mealie Plugin

The Mealie plugin demonstrates this:

**Backend** (`backend/app/plugins/service/mealie.py`):
```python
"display_schema": {
    "type": "api",
    "api_endpoint": "/api/web-services/{service_id}/data",
    "method": "GET",
    "component": "mealie/MealPlanViewer.vue",  # Plugin-provided frontend component
}
```

**Frontend Component** (`frontend/src/components/plugins/mealie/MealPlanViewer.vue`):
- This component is loaded dynamically by the `ServiceViewer` component
- Uses the `usePluginComponent` composable to load plugin-provided components

## Plugin Package Structure

For a plugin to include frontend components, it should have this structure:

```
my-plugin/
├── plugin.json
├── plugin.py
└── frontend/
    └── MyComponent.vue
    └── (or subdirectories)
        └── components/
            └── MyComponent.vue
```

## Installation Result

After installation, the frontend component will be at:
```
frontend/src/components/plugins/{plugin_id}/MyComponent.vue
```

And referenced in `display_schema.component` as:
```python
"component": "{plugin_id}/MyComponent.vue"
```

## Component Loading

Frontend components are automatically loaded by:
- `frontend/src/composables/usePluginComponent.js` - Dynamically imports plugin components
- `frontend/src/components/service/ServiceViewer.vue` - Uses the composable to render plugin components

The system uses Vite's `import.meta.glob()` to discover all plugin components at build time.

## Uninstallation

When uninstalling a plugin, frontend components are also removed:

```python
# Remove frontend components
frontend_path = self.get_frontend_plugin_path(plugin_id)
if frontend_path.exists():
    shutil.rmtree(frontend_path)
```

## Important Notes

1. **Frontend rebuild required**: After installing a plugin with frontend components, the frontend needs to be rebuilt for the components to be available (Vite's glob needs to pick them up)

2. **Component path**: The component path in `display_schema.component` should be relative to `frontend/src/components/plugins/`, e.g., `mealie/MealPlanViewer.vue`

3. **Subdirectories**: You can organize components in subdirectories within the `frontend/` directory, and the full path will be preserved

4. **No manual registration**: Plugin components don't need to be manually registered - they're discovered automatically via the glob pattern

## Testing

To verify frontend components are installed correctly:

1. Check that `frontend/src/components/plugins/{plugin_id}/` exists after installation
2. Verify the component files are present
3. Check that the plugin's `display_schema.component` path matches the installed location
4. Rebuild the frontend and test the plugin

