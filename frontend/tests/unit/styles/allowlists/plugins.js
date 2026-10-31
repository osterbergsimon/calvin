/**
 * Doctrine lint allowlists for Plugins (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [
    "components/PluginActions.vue",
    "components/PluginFieldRenderer.vue",
    "components/PluginSections.vue",
    "components/plugins/SchemaRenderer.vue",
    "components/plugins/WebComponentHost.vue",
    "components/plugins/overlays/EmbedOverlay.vue",
    "components/plugins/overlays/HandoffOverlay.vue",
    "components/plugins/renderers/CardGrid.vue",
    "components/plugins/renderers/IframeRenderer.vue",
    "components/plugins/renderers/ImageWithCaption.vue",
    "components/plugins/renderers/ItemList.vue",
    "components/plugins/renderers/StatusRenderer.vue",
    "components/plugins/renderers/WeatherForecast.vue",
    "components/settings/specialized/OrderingManager.vue",
  ],
  baseline: [
    "components/PluginActions.vue",
    "components/PluginFieldRenderer.vue",
    "components/PluginSections.vue",
    "components/plugins/SchemaRenderer.vue",
    "components/plugins/WebComponentHost.vue",
    "components/plugins/overlays/EmbedOverlay.vue",
    "components/plugins/overlays/HandoffOverlay.vue",
    "components/plugins/renderers/CardGrid.vue",
    "components/plugins/renderers/IframeRenderer.vue",
    "components/plugins/renderers/ImageWithCaption.vue",
    "components/plugins/renderers/ItemList.vue",
    "components/plugins/renderers/StatusRenderer.vue",
    "components/plugins/renderers/WeatherForecast.vue",
    "components/settings/categories/PluginsCategory.vue",
    "components/settings/specialized/InstanceModal.vue",
    "components/settings/specialized/OrderingManager.vue",
    "components/settings/specialized/PluginCard.vue",
    "components/settings/specialized/PluginInstaller.vue",
    "components/settings/specialized/PluginInstances.vue",
    "components/settings/specialized/PluginManager.vue",
  ],
};

export const controlLint = {
  allowlist: [
    "components/PluginActions.vue",
    "components/PluginFieldRenderer.vue",
    "components/PluginSections.vue",
    "components/plugins/renderers/IframeRenderer.vue",
  ],
  baseline: [
    "components/PluginActions.vue",
    "components/PluginFieldRenderer.vue",
    "components/PluginSections.vue",
    "components/plugins/renderers/IframeRenderer.vue",
    "components/settings/categories/PluginsCategory.vue",
    "components/settings/specialized/PluginCard.vue",
    "components/settings/specialized/PluginInstaller.vue",
    "components/settings/specialized/PluginInstances.vue",
  ],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: ["components/settings/categories/PluginsCategory.vue"],
};
