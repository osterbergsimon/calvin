# Plugin Installation Improvements Summary

## Issues Addressed

### 1. ✅ Database Registration Notice
**Problem**: Newly installed plugins don't appear until server restart.

**Solution**: 
- Added `requires_restart: true` flag in API responses
- Frontend will show notice and restart button (to be implemented)
- Documented in `PLUGIN_PERSISTENCE_AND_RESTART.md`

**Status**: Documentation complete, UI notice pending

### 2. ✅ Fixed Double Zip Extraction
**Problem**: Zip files were extracted twice (once for validation, once for installation).

**Solution**: 
- Modified `validate_plugin_package()` to validate zip structure without extracting
- Reads `plugin.json` directly from zip file
- Validates structure in-memory
- Only extracts once during `install_plugin()`

**Status**: ✅ Fixed

### 3. ✅ Improved Zip Extraction Logic
**Problem**: Extraction logic could fail with complex zip structures.

**Solution**:
- Determines plugin root directory from `plugin.json` location
- Extracts only files from plugin directory (not entire zip)
- Handles both flat and nested structures correctly
- Prevents extracting unrelated files

**Status**: ✅ Fixed

### 4. ✅ Version Checking
**Problem**: Could overwrite newer plugins with older versions.

**Solution**:
- Added `check_version` parameter to `install_plugin()`
- Compares versions using `packaging` library (semantic versioning)
- Raises error if trying to install older version
- User must uninstall existing plugin first

**Status**: ✅ Implemented

### 5. ✅ Branch Fallback Notification
**Problem**: Silently switched from `main` to `master` without notification.

**Solution**:
- Only falls back to `master` if user didn't explicitly specify a branch
- Returns `branch_switched: true` flag in API response
- Returns actual branch used in response
- Frontend can display notification (to be implemented)

**Explanation**: When user provides a GitHub repo URL without specifying a branch, we default to `main`. If `main` doesn't exist, we try `master` as a fallback. This only happens when the branch wasn't explicitly specified by the user.

**Status**: ✅ Fixed (backend), UI notification pending

## Plugin Persistence

Plugins are persisted in two database tables:

1. **`plugin_types`**: Plugin type definitions (metadata, schema, enabled status)
2. **`plugins`**: Plugin instances (individual configured instances)

See `PLUGIN_PERSISTENCE_AND_RESTART.md` for details.

## Manifest Requirements

Based on analysis, we should require a clear manifest structure. Current requirements:

### Single Plugin Zip
- Must contain exactly one `plugin.json`
- Must contain exactly one `plugin.py` in same directory
- Optional: `frontend/` directory for Vue components

### Multi-Plugin Repository
- Should have `plugins.json` manifest at root (optional but recommended)
- Each plugin directory must have `plugin.json` and `plugin.py`
- Auto-discovery works if no manifest, but manifest is preferred

### Existing Standards
While there's no universal standard, common patterns include:
- **npm/package.json**: Similar structure but Node.js specific
- **Python wheels**: Use `METADATA` files
- **VS Code extensions**: Use `package.json` with specific fields
- **Our approach**: Custom `plugin.json` format optimized for our use case

**Recommendation**: Continue with current `plugin.json` format but:
1. Document it clearly (✅ Done in `PLUGIN_PACKAGE_FORMAT.md`)
2. Add JSON schema validation (future enhancement)
3. Require manifest for all plugins (enforce in validation)

## Remaining Work

1. **Frontend UI Updates**:
   - Add restart notice after plugin installation
   - Show branch switch notification
   - Add version conflict confirmation dialog

2. **Documentation**:
   - Update `PLUGIN_INSTALLATION.md` with new requirements
   - Add troubleshooting guide

3. **Future Enhancements**:
   - Automatic database registration (eliminate restart requirement)
   - JSON schema validation for `plugin.json`
   - Plugin update mechanism
   - Dependency management

