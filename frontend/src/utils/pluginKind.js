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

/** A stable filter key: the plugin type, with clock-bar-only services split out. */
export const pluginKindKey = plugin => {
  if (!plugin) return "";
  if (plugin.type === "service" && plugin.statusbar_schema && !plugin.display_schema) {
    return "clock";
  }
  return plugin.type;
};

export const pluginKindLabel = plugin => {
  if (!plugin) return "";
  if (plugin.type === "service" && plugin.statusbar_schema && !plugin.display_schema) {
    return "Clock bar";
  }
  return KIND_LABELS[plugin.type] || "Plugin";
};

/** Filter chips, All first, in the order the Content sections appear. */
export const pluginKindFilters = plugins => {
  const order = ["calendar", "image", "service", "clock", "theme", "backend"];
  const present = new Set((plugins || []).map(pluginKindKey));
  const labels = { ...KIND_LABELS, clock: "Clock bar" };
  return [
    { id: "all", label: "All" },
    ...order.filter(key => present.has(key)).map(key => ({ id: key, label: labels[key] })),
  ];
};
