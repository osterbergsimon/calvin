# Plugin Installation Flow Analysis

This document explains how the plugin installation flow works and identifies potential issues.

## Installation Flow Overview

There are two main installation paths:
1. **Zip File Upload** - Single plugin in a zip archive
2. **GitHub Repository** - One or more plugins from a GitHub repo

---

## Path 1: Zip File Installation

### Frontend Flow
1. User selects zip file → `handlePluginZipSelect(event)`
2. Calls `installPluginFromZip(file, fileInput)`
3. Creates FormData with file
4. POST to `/api/plugins/install` with multipart/form-data
5. On success: Reloads plugins list via `loadPlugins()`

### Backend Flow (`/api/plugins/install`)
1. Receives `UploadFile` and optional `plugin_id`
2. Saves uploaded file to temporary location (`tempfile.NamedTemporaryFile`)
3. Calls `plugin_installer.install_plugin(temp_path, plugin_id)`
4. Calls `plugin_loader.load_installed_plugins()` to reload
5. Returns success message with manifest
6. Cleans up temp file

### Plugin Installer Flow (`install_plugin`)
1. **Validation**: Calls `validate_plugin_package(source_path)`
   - If zip: Extracts to temp, finds all `plugin.json` files
   - **Validates**: Exactly one `plugin.json` must exist
   - Validates the plugin directory structure
2. **ID Resolution**: Uses `plugin_id` parameter or manifest `id`
3. **Conflict Check**: Verifies plugin not already installed
4. **Installation**:
   - If zip: Extracts all files to `plugins_dir/{plugin_id}/`
   - Handles root directory case (moves files up if needed)
   - If directory: Copies files (skips `__pycache__`, `.git`)
5. **Frontend Components**: Copies `frontend/` directory if exists
6. **Manifest**: Saves `plugin.json` to installed location
7. **Error Handling**: Cleans up on failure (removes plugin and frontend dirs)

### Plugin Loader Flow (`load_installed_plugins`)
1. Gets list of installed plugins from `plugin_installer.get_installed_plugins()`
2. For each plugin:
   - Adds plugin directory to `sys.path`
   - Loads `plugin.py` as module `installed_plugin_{plugin_id}`
   - Registers module with pluggy if it has hooks
3. **Note**: This only loads the module - doesn't register in database

---

## Path 2: GitHub Repository Installation

### Frontend Flow
1. **Enumeration**:
   - User enters repo URL → `enumeratePluginsFromGitHub()`
   - GET `/api/plugins/enumerate-from-github?repo_url=...&branch=...`
   - Displays list of available plugins
2. **Installation**:
   - User clicks "Install" on a plugin → `installPluginFromGitHub(pluginPath)`
   - POST `/api/plugins/install-from-github` with `{repo_url, plugin_path, branch}`
   - On success: Reloads plugins list

### Backend Enumeration Flow (`/api/plugins/enumerate-from-github`)
1. Parses GitHub URL (owner/repo)
2. Downloads repo zip from GitHub (`/archive/refs/heads/{branch}.zip`)
3. Extracts to temporary directory
4. Finds repo root (handles GitHub's `repo-name-branch/` structure)
5. Calls `plugin_installer.enumerate_plugins_from_repo(repo_root)`
6. Returns list of available plugins
7. Cleans up temp files

### Backend Installation Flow (`/api/plugins/install-from-github`)
1. Parses GitHub URL and downloads repo (same as enumeration)
2. Extracts to temporary directory
3. Calls `plugin_installer.install_plugin_from_repo(repo_root, plugin_path, plugin_id)`
4. Calls `plugin_loader.load_installed_plugins()`
5. Returns success message
6. Cleans up temp files

### Plugin Installer Repo Flow (`install_plugin_from_repo`)
1. **Security Check**: Validates `plugin_path` (no `..` or absolute paths)
2. **Path Resolution**: Resolves plugin directory within repo
3. **Validation**: Calls `_validate_plugin_directory(plugin_dir)`
4. **Installation**: Calls `install_plugin(plugin_dir, install_id)` (same as zip flow)

### Plugin Installer Enumeration Flow (`enumerate_plugins_from_repo`)
1. **Manifest Check**: Looks for `plugins.json` at repo root
2. **If Manifest Exists**:
   - Validates manifest structure
   - For each plugin in manifest:
     - Validates path (security check)
     - Validates plugin directory
     - Returns plugin metadata
3. **If No Manifest** (Auto-discovery):
   - Scans repo root for directories
   - Skips common dirs (`.git`, `__pycache__`, etc.)
   - Checks each dir for `plugin.json` and `plugin.py`
   - Validates and returns plugin metadata

---

## Database Registration

**Important**: After installation, plugins are loaded into memory but **not automatically registered in the database**.

### How Plugin Types Get Into Database
1. Plugin types are registered in the database during **startup** via `PluginRegistry.load_plugins_from_db()`
2. This calls `_load_plugin_types()` which:
   - Gets all plugin types from pluggy hooks (`plugin_loader.get_plugin_types()`)
   - For each type, creates/updates `PluginTypeDB` entry
   - **Defaults to `enabled=False`** - user must enable manually

### The Problem
After installing a new plugin:
- ✅ Plugin files are installed
- ✅ Plugin module is loaded into memory
- ✅ Plugin is registered with pluggy
- ❌ **Plugin type is NOT automatically added to database**
- ❌ Plugin won't appear in UI until **server restart** or manual database entry

---

## Identified Issues

### 🔴 Critical Issues

#### 1. **Missing Database Registration After Installation**
**Problem**: After installing a plugin, it's loaded but not registered in the database. The plugin won't appear in the UI until server restart.

**Location**: `backend/app/api/routes/plugins.py` lines 1062, 1273

**Current Code**:
```python
plugin_loader.load_installed_plugins()
```

**Should Also Call**:
```python
# Need to trigger database registration
# This requires async context - might need to refactor
```

**Impact**: High - Users won't see newly installed plugins until restart

#### 2. **Zip Extraction Logic Can Fail**
**Problem**: In `install_plugin()`, when extracting a zip:
- It finds `plugin.json` path
- Extracts **all files** to `plugin_path`
- Then tries to move files up if there's a subdirectory

**Issues**:
- If zip has multiple top-level items (not just one directory), the move-up logic fails
- If zip is flat but has other files, they all get extracted (could be messy)
- The logic assumes: "if one subdir and no plugin.json at root, move up" - but this can be wrong

**Location**: `backend/app/services/plugin_installer.py` lines 169-192

**Example Failure Case**:
```
my-plugin.zip
├── plugin/
│   ├── plugin.json
│   └── plugin.py
└── README.md  # Top-level file
```
This would extract to:
```
plugins_dir/{plugin_id}/
├── plugin/
│   ├── plugin.json
│   └── plugin.py
└── README.md
```
Then it checks: "one subdir? yes. plugin.json at root? no. Move up!"
But `README.md` is also there, so the structure is wrong.

#### 3. **Double Validation**
**Problem**: `install_plugin()` calls `validate_plugin_package()` which:
- For zips: Extracts to temp, validates, returns manifest
- Then `install_plugin()` extracts again to final location

**Impact**: Low - Inefficient but not broken. The temp extraction in validation is cleaned up.

### 🟡 Medium Issues

#### 4. **Plugin ID Override Confusion**
**Problem**: If `plugin_id` parameter is provided, it overrides manifest ID. But:
- Manifest is still saved with original ID in `plugin.json`
- Only the directory name uses the override ID
- This could cause confusion if IDs don't match

**Location**: `backend/app/services/plugin_installer.py` lines 151, 157

#### 5. **No Error Recovery for Partial Installs**
**Problem**: If installation fails partway through:
- Plugin directory might be partially created
- Frontend components might be partially copied
- Cleanup tries to remove, but if it fails, partial install remains

**Location**: `backend/app/services/plugin_installer.py` lines 222-229

#### 6. **Temp File Cleanup on Windows**
**Problem**: Temp files might not be deleted immediately on Windows due to file locking. The code handles this with try/except, but it's a known issue.

**Location**: `backend/app/api/routes/plugins.py` lines 1074-1080, 1171-1182

### 🟢 Minor Issues

#### 7. **No Size Limits**
**Problem**: No limits on:
- Zip file size
- Repository download size
- Plugin directory size

**Impact**: Could cause memory/disk issues with large plugins

#### 8. **No Rate Limiting**
**Problem**: GitHub API calls have no rate limiting. Multiple users installing from same repo could hit GitHub rate limits.

#### 9. **Branch Fallback Logic**
**Problem**: If `main` branch doesn't exist, tries `master`. But if user explicitly requested `main`, this silently changes to `master` without notification.

**Location**: `backend/app/api/routes/plugins.py` lines 1125-1134, 1236-1245

#### 10. **No Plugin Version Checking**
**Problem**: Installing a plugin doesn't check if a newer version is already installed. Could overwrite newer with older.

---

## Recommended Fixes

### Priority 1: Database Registration
After `plugin_loader.load_installed_plugins()`, trigger database registration:
- Option A: Call `PluginRegistry._load_plugin_types()` (requires async context)
- Option B: Create a sync method that registers a single plugin type
- Option C: Add endpoint to trigger full plugin reload (including DB registration)

### Priority 2: Fix Zip Extraction
Improve zip extraction logic:
1. Find plugin directory during validation
2. Extract only the plugin directory, not everything
3. Handle both flat and nested structures correctly

### Priority 3: Add Size Limits
- Max zip file size: 50MB
- Max repo download: 100MB
- Max plugin directory: 200MB

### Priority 4: Improve Error Messages
- More specific error messages for each failure case
- Better frontend error display

---

## Flow Diagram

```
Zip Installation:
User → Frontend → API → Installer.validate() → Installer.install() → Loader.load() → ❌ DB Registration Missing

GitHub Installation:
User → Frontend → API.enumerate() → Installer.enumerate() → Show List
User → Frontend → API.install() → Installer.install_from_repo() → Installer.install() → Loader.load() → ❌ DB Registration Missing
```

---

## Testing Recommendations

1. **Test zip with multiple top-level items** - Should fail gracefully
2. **Test zip with nested plugin** - Should extract correctly
3. **Test zip with flat structure** - Should work
4. **Test GitHub repo with manifest** - Should enumerate correctly
5. **Test GitHub repo without manifest** - Should auto-discover
6. **Test plugin appears after install** - Currently fails (needs DB registration)
7. **Test plugin appears after restart** - Should work
8. **Test installing same plugin twice** - Should fail with clear error
9. **Test installing plugin with invalid structure** - Should fail with clear error
10. **Test cleanup on failure** - Should remove partial installs

