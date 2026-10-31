/**
 * Doctrine lint allowlists for Other (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [
    "components/PerimeterProgress.vue",
    "components/StatusRail.vue",
    "components/settings/categories/ThisBrowserSettings.vue",
    "components/settings/shared/CollapsibleSection.vue",
    "components/settings/shared/DefaultEditNote.vue",
    "components/settings/shared/DefaultOnlyNote.vue",
    "components/settings/shared/TabNavigation.vue",
    "components/settings/shell/CategoryRail.vue",
    "components/settings/shell/CollapsibleSettingsSection.vue",
    "components/settings/shell/ScopeChip.vue",
    "components/settings/shell/SettingRow.vue",
    "components/settings/shell/SettingsSearch.vue",
    "components/settings/shell/SettingsSection.vue",
    "components/settings/shell/SettingsTopBar.vue",
    "components/settings/specialized/ThemeSelector.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingBoard.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingTile.vue",
    "components/settings/tabs/layout/keyboard/RebootCombo.vue",
    "views/Settings.vue",
  ],
  baseline: [
    "components/PerimeterProgress.vue",
    "components/StatusRail.vue",
    "components/settings/categories/ThisBrowserSettings.vue",
    "components/settings/shared/CollapsibleSection.vue",
    "components/settings/shared/ConfirmModal.vue",
    "components/settings/shared/DefaultEditNote.vue",
    "components/settings/shared/DefaultOnlyNote.vue",
    "components/settings/shared/TabNavigation.vue",
    "components/settings/shell/CategoryRail.vue",
    "components/settings/shell/CollapsibleSettingsSection.vue",
    "components/settings/shell/ScopeChip.vue",
    "components/settings/shell/SettingRow.vue",
    "components/settings/shell/SettingsSearch.vue",
    "components/settings/shell/SettingsSection.vue",
    "components/settings/shell/SettingsTopBar.vue",
    "components/settings/shell/ThemePicker.vue",
    "components/settings/specialized/ThemeSelector.vue",
    "components/settings/tabs/layout/KeyboardTab.vue",
    "components/settings/tabs/layout/keyboard/ActionPicker.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingBoard.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingTile.vue",
    "components/settings/tabs/layout/keyboard/RebootCombo.vue",
    "views/Settings.vue",
  ],
};

export const controlLint = {
  allowlist: [
    "components/settings/shared/TabNavigation.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingTile.vue",
  ],
  baseline: [
    "components/settings/shared/ConfirmModal.vue",
    "components/settings/shared/TabNavigation.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingTile.vue",
  ],
};

export const settingsNoStyle = {
  allowlist: [
    "components/settings/categories/ThisBrowserSettings.vue",
    "components/settings/tabs/layout/keyboard/ActionPicker.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingBoard.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingTile.vue",
    "components/settings/tabs/layout/keyboard/RebootCombo.vue",
  ],
  baseline: [
    "components/settings/categories/ThisBrowserSettings.vue",
    "components/settings/tabs/layout/KeyboardTab.vue",
    "components/settings/tabs/layout/keyboard/ActionPicker.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingBoard.vue",
    "components/settings/tabs/layout/keyboard/KeyBindingTile.vue",
    "components/settings/tabs/layout/keyboard/RebootCombo.vue",
  ],
};
