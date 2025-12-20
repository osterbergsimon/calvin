# Settings Save Behavior

## How Settings Are Saved

### Automatic Save on Change
**Most settings save immediately** when changed:
- Inputs have `@change="saveConfig"` which calls `saveConfig()` immediately
- This sends a POST request to `/api/config` with all current settings
- Examples: orientation, keyboard type, display settings, etc.

### Manual Save Button
**"Save All Settings" button** exists for:
- Batch saving (saves config + keyboard mappings together)
- Ensuring everything is saved at once
- User peace of mind

### What Gets Saved When

1. **Individual Settings** (via `@change`):
   - Orientation, keyboard type, display settings
   - Calendar view mode, time format
   - Theme settings, display schedule
   - **Saves immediately** when changed

2. **Keyboard Mappings**:
   - Saved separately via `saveKeyboardMappings()`
   - Called by "Save All Settings" button
   - Can also be saved individually (if needed)

3. **Plugin Settings**:
   - Each plugin has its own "Save" button
   - Saves plugin-specific configuration
   - Independent of main settings

4. **Plugin Instances**:
   - Saved when "Save" is clicked in instance modal
   - Creates or updates plugin instances

## Summary

- ✅ **Settings save automatically** when changed (no need to click save)
- ✅ **"Save All Settings" button** ensures everything is saved together
- ✅ **Plugin settings** have their own save buttons
- ✅ **No data loss** - changes are persisted immediately

## User Experience

Users can:
1. Change settings and they save automatically
2. Use "Save All Settings" to ensure everything is saved
3. See immediate feedback when settings are applied

