# Plugin Uninstall and Restart Functionality

## Current State

### Uninstall Functionality

**Backend**: ✅ Exists
- Endpoint: `DELETE /api/plugins/installed/{plugin_id}`
- Location: `backend/app/api/routes/plugins.py`
- Functionality: Removes plugin files and frontend components

**Frontend**: ❌ **NOT EXPOSED TO USER**
- No UI button to uninstall plugins
- Only `deletePluginInstance` exists (deletes plugin instances, not the plugin type itself)
- Users cannot currently uninstall plugins from the UI

### Restart Functionality

**Backend**: ❓ **UNCLEAR**
- No dedicated restart endpoint found
- System update triggers backend restart (`/api/system/update`)
- Reboot combo exists (keyboard shortcut) but no API endpoint

**Frontend**: ❌ **NO RESTART BUTTON**
- "Reload UI" button exists (reloads frontend, not backend)
- "Update from GitHub" button exists (triggers update which restarts backend)
- No direct "Restart Backend" button

## Implementation Status

### ✅ 1. Uninstall Button - IMPLEMENTED

**Location**: Plugin header actions (next to enable/disable toggle)

**Features**:
- Only shows for installed plugins (checks `_installed` flag)
- Confirmation dialog with clear explanation
- Removes plugin files and frontend components
- Reloads plugin list after uninstall

**Implementation**:
- Button: `🗑️ Uninstall` in plugin header
- Function: `uninstallPlugin(pluginId)`
- Endpoint: `DELETE /api/plugins/installed/{plugin_id}`

### ✅ 2. Restart Backend - IMPLEMENTED

**Location**: 
- Actions section (grouped with other system actions)
- Restart notice (after plugin installation)

**Features**:
- Confirmation dialog
- Uses systemctl or dbus to restart `calvin-backend` service
- Shows error if restart fails (with manual instructions)
- Auto-reloads page after restart

**Implementation**:
- Button: `🔄 Restart Backend` in Actions section
- Function: `restartBackend()`
- Endpoint: `POST /api/system/restart-backend`

### ✅ 3. Improved UX for System Actions - IMPLEMENTED

**New Structure**:
- **Settings Group**: Save All Settings, Reset to Defaults
- **System Group**: Restart Backend, Reload UI, Update from GitHub

**Features**:
- Grouped by function with clear titles
- Descriptions explaining what each button does
- Better visual organization
- Clear distinction between settings and system actions

## Branch Change Explanation

### Why We Need Branch Change Notification

**The Problem**:
1. Many older GitHub repositories use `master` as the default branch
2. Newer repositories use `main` as the default branch
3. When a user provides a repo URL without specifying a branch, we default to `main`
4. If `main` doesn't exist, we fall back to `master` to be helpful
5. **Without notification, the user doesn't know which branch was actually used**

**The Solution**:
- Detect when branch fallback occurs
- Notify the user which branch was actually used
- Only fall back if user didn't explicitly specify a branch

**Example Scenario**:
```
User enters: https://github.com/user/old-repo
We try: main (default)
Result: 404 (main doesn't exist)
We try: master (fallback)
Result: Success ✅
User sees: "Branch switched from 'main' to 'master'"
```

**Why It Matters**:
- User might expect `main` branch but get `master` (could be different code)
- User might want to know which branch was actually installed
- Transparency: user should know what happened

**Current Implementation**:
- ✅ Only falls back if user didn't specify branch
- ✅ Returns `branch_switched: true` flag
- ✅ Returns actual branch used
- ✅ Frontend shows notification

**Alternative**: We could just fail with an error instead of falling back, but the fallback is more user-friendly for older repositories.

