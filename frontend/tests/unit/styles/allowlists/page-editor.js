/**
 * Doctrine lint allowlists for Page editor (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [
    "components/settings/shared/ScreenRegionEditor.vue",
    "components/settings/shared/regions/RegionInspector.vue",
    "components/settings/shared/regions/RegionNode.vue",
    "components/settings/shared/regions/ScreenInspector.vue",
  ],
  baseline: [
    "components/settings/shared/ScreenRegionEditor.vue",
    "components/settings/shared/regions/RegionInspector.vue",
    "components/settings/shared/regions/RegionNode.vue",
    "components/settings/shared/regions/ScreenInspector.vue",
  ],
};

export const controlLint = {
  allowlist: [
    "components/settings/shared/ScreenRegionEditor.vue",
    "components/settings/shared/regions/RegionInspector.vue",
    "components/settings/shared/regions/ScreenInspector.vue",
  ],
  baseline: [
    "components/settings/shared/ScreenRegionEditor.vue",
    "components/settings/shared/regions/RegionInspector.vue",
    "components/settings/shared/regions/ScreenInspector.vue",
  ],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: [],
};
