/**
 * Doctrine lint allowlists for Dashboard (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [],
  baseline: [
    "components/DashboardPanel.vue",
    "components/DashboardRegion.vue",
    "components/MinimalUIOverlay.vue",
    "components/dashboard/AdminOverflow.vue",
    "components/dashboard/CalendarViewOptions.vue",
    "components/dashboard/RegionViewOptions.vue",
    "components/dashboard/ServiceRegionViewOptions.vue",
    "components/dashboard/SetupWelcomeCard.vue",
    "components/settings/categories/DashboardSettings.vue",
    "views/Dashboard.vue",
  ],
};

export const controlLint = {
  allowlist: [],
  baseline: [
    "components/dashboard/CalendarViewOptions.vue",
    "components/dashboard/ServiceRegionViewOptions.vue",
    "components/settings/categories/DashboardSettings.vue",
  ],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: ["components/settings/categories/DashboardSettings.vue"],
};
