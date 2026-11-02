/**
 * Option-building and search for the dashboard region "component picker".
 *
 * Service options are labelled by their *instance* name (e.g. "Hem"), but users
 * look for them by the service *type* (e.g. "Yr.no Weather" / "weather"). Both
 * strings are therefore carried on the option and matched by the filter, so a
 * service can't hide behind an unrelated instance name.
 */

/**
 * Build the picker's component options: the two built-in components followed by
 * one option per service instance.
 *
 * @param {Array<{id: string, name: string, plugin_name?: string}>} services
 * @returns {Array<{value: string, label: string, kind: string, instanceIds: string[], pluginName?: string}>}
 */
export function buildComponentOptions(services = []) {
  return [
    { value: "calendar", label: "Calendar", kind: "calendar", instanceIds: [] },
    { value: "photos", label: "Photos", kind: "photos", instanceIds: [] },
    ...services.map(service => ({
      value: `service:${service.id}`,
      label: service.name,
      pluginName: service.plugin_name || "",
      kind: "service",
      instanceIds: [service.id],
    })),
  ];
}

/**
 * Filter component options by a free-text query, matching both the instance
 * label and the service type name.
 *
 * @param {ReturnType<typeof buildComponentOptions>} options
 * @param {string} query
 */
export function filterComponentOptions(options = [], query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    option =>
      option.label.toLowerCase().includes(q) || (option.pluginName || "").toLowerCase().includes(q)
  );
}
