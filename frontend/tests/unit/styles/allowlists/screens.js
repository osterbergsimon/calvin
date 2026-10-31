/**
 * Doctrine lint allowlists for Screens (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: ["components/settings/shared/DisplayScheduleGrid.vue"],
  baseline: [
    "components/settings/categories/DefaultScreenSettings.vue",
    "components/settings/categories/ScreensSettings.vue",
    "components/settings/shared/AddKioskPanel.vue",
    "components/settings/shared/DisplayScheduleGrid.vue",
    "components/settings/shared/KioskScope.vue",
    "components/settings/shared/KioskSoftwarePointer.vue",
    "components/settings/shared/KioskStatusHeader.vue",
    "components/settings/shared/PageThumbnail.vue",
  ],
};

export const controlLint = {
  allowlist: ["components/settings/shared/DisplayScheduleGrid.vue"],
  baseline: [
    "components/settings/categories/ScreensSettings.vue",
    "components/settings/shared/AddKioskPanel.vue",
    "components/settings/shared/DisplayScheduleGrid.vue",
    "components/settings/shared/KioskSoftwarePointer.vue",
  ],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: [
    "components/settings/categories/DefaultScreenSettings.vue",
    "components/settings/categories/ScreensSettings.vue",
  ],
};
