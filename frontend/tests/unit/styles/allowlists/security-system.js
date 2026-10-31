/**
 * Doctrine lint allowlists for Security & system (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [],
  baseline: [
    "components/settings/categories/BackupSettings.vue",
    "components/settings/categories/MaintenanceSettings.vue",
    "components/settings/categories/SecuritySettings.vue",
    "components/settings/categories/security/AdminAccessSection.vue",
    "components/settings/categories/security/ApiKeysSection.vue",
    "components/settings/tabs/system/UpdateSourceRows.vue",
    "components/settings/tabs/system/UpdatesTab.vue",
  ],
};

export const controlLint = {
  allowlist: [],
  baseline: [
    "components/settings/categories/BackupSettings.vue",
    "components/settings/categories/MaintenanceSettings.vue",
    "components/settings/tabs/system/UpdatesTab.vue",
  ],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: [
    "components/settings/categories/BackupSettings.vue",
    "components/settings/categories/MaintenanceSettings.vue",
    "components/settings/categories/SecuritySettings.vue",
    "components/settings/categories/security/AdminAccessSection.vue",
    "components/settings/categories/security/ApiKeysSection.vue",
    "components/settings/tabs/system/UpdateSourceRows.vue",
    "components/settings/tabs/system/UpdatesTab.vue",
  ],
};
