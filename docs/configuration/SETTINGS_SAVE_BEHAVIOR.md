# Settings Save Behavior

## How Settings Are Saved

Calvin saves settings **per field**. There is no "Save All Settings" button;
changing a control writes the changed keys immediately.

### Per-field saves

The settings form (`useConfigForm.js`) exposes `updateConfigValue(key, value)`,
which sends the changed key to `POST /api/config` as soon as the control
changes. `updateConfig(updates)` does the same for a group of keys (for
example a segmented control that edits several related values together).

What this means in practice:

- Orientation, theme, display schedule, clock-bar options, calendar view,
  time format, refresh intervals, and similar settings are persisted as you
  change them.
- A short "saved" indicator appears, and errors are shown in the settings
  header if the request fails.
- Navigating away without pressing anything cannot lose a change that was
  already sent.

### Keyboard mappings

Keyboard bindings are saved through their own endpoint when you apply them in
**Settings → Keyboard**; they are independent of the general config form.

### Plugin settings

Plugin **type** settings and plugin **instance** settings each have their own
save action in their respective settings panels. They are not part of the
general config POST.

### Plugin instances

Creating or editing an instance in the instance modal saves that instance
when you press **Save**. Instance data is stored separately from the global
config.

## Summary

- ✅ Settings save automatically, per field, when changed
- ✅ There is no "Save All Settings" button
- ✅ Keyboard mappings, plugin settings, and instances have their own save
  actions
- ✅ Errors surface in the settings UI; a failed save does not silently
  succeed

## User Experience

Users can change a setting and see it applied immediately. The repository's
config store is updated alongside the backend so a reload shows the same
values. If a save fails, the settings header reports the error instead of
pretending the change was stored.
