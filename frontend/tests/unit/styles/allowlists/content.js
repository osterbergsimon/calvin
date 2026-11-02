/**
 * Doctrine lint allowlists for Content (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [
    "components/BarLogo.vue",
    "components/CalendarEventItem.vue",
    "components/CalendarRibbon.vue",
    "components/CalendarTimedEvent.vue",
    "components/EventDetailPanel.vue",
    "components/WebServiceViewer.vue",
    "components/service/IframeViewer.vue",
    "components/settings/tabs/clock-bar/ClockBarItemsTab.vue",
  ],
  baseline: [
    "components/BarLogo.vue",
    "components/CalendarEventItem.vue",
    "components/CalendarRibbon.vue",
    "components/CalendarTimedEvent.vue",
    "components/EventDetailPanel.vue",
    "components/WebServiceViewer.vue",
    "components/service/IframeViewer.vue",
    "components/settings/specialized/ProviderPicker.vue",
    "components/settings/specialized/SourceList.vue",
    "components/settings/specialized/WhereItShows.vue",
    "components/settings/tabs/clock-bar/ClockBarItemsTab.vue",
    "components/settings/tabs/content/CalendarSourcesTab.vue",
    "components/settings/tabs/content/ClockBarSources.vue",
    "components/settings/tabs/content/PhotoUpload.vue",
    "components/settings/tabs/content/ServicesTab.vue",
  ],
};

export const controlLint = {
  allowlist: [
    "components/service/IframeViewer.vue",
    "components/settings/tabs/clock-bar/ClockBarItemsTab.vue",
  ],
  baseline: [
    "components/service/IframeViewer.vue",
    "components/settings/specialized/SourceList.vue",
    "components/settings/tabs/clock-bar/ClockBarItemsTab.vue",
    "components/settings/tabs/content/CalendarSourcesTab.vue",
    "components/settings/tabs/content/PhotoUpload.vue",
  ],
};

export const settingsNoStyle = {
  allowlist: ["components/settings/tabs/clock-bar/ClockBarItemsTab.vue"],
  baseline: [
    "components/settings/categories/ClockBarSections.vue",
    "components/settings/categories/ContentSettings.vue",
    "components/settings/tabs/clock-bar/ClockBarItemsTab.vue",
    "components/settings/tabs/content/CalendarSourcesTab.vue",
    "components/settings/tabs/content/ClockBarSources.vue",
    "components/settings/tabs/content/ImagesTab.vue",
    "components/settings/tabs/content/PhotoUpload.vue",
    "components/settings/tabs/content/ServicesTab.vue",
  ],
};
