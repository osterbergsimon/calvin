/**
 * Plain words for a plugin's kind.
 *
 * Settings never shows the raw plugin type ("image", "service", …): people add
 * a calendar, photos, a web page or clock-bar info, not an "image plugin". A
 * service plugin whose metadata declares only a clock-bar tile is "Clock bar".
 */

const KIND_LABELS = {
  calendar: "Calendar",
  image: "Photos",
  service: "Web page & app",
  theme: "Theme",
  backend: "Background",
};

export const pluginKindLabel = plugin => {
  if (!plugin) return "";
  if (plugin.type === "service" && plugin.statusbar_schema && !plugin.display_schema) {
    return "Clock bar";
  }
  return KIND_LABELS[plugin.type] || "Plugin";
};
