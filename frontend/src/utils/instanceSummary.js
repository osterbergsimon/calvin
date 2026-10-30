/**
 * One-line summaries and row shapes for a source (a plugin instance).
 *
 * Content lists every source once (§3.1 of 2026-10-30-content-and-plugins.md):
 * a row carries the source name, and under it its provider plus a short,
 * config-derived summary ("Immich · 2 albums"). The summary is never invented:
 * it comes from the plugin's own declared instance config, so a plugin that
 * declares no short text simply shows its provider name.
 */

const MAX_SUMMARY_LENGTH = 60;

const truncate = value =>
  value.length > MAX_SUMMARY_LENGTH ? value.slice(0, MAX_SUMMARY_LENGTH - 3) + "..." : value;

/**
 * The first meaningful string in an instance's declared config. Skips internal
 * (_-prefixed) and hidden fields so a credential or a machine key never leaks
 * into a list row.
 */
export const getInstanceSummary = (plugin, instance) => {
  const schema = plugin?.instance_config_schema || {};
  const config = instance?.config || {};
  for (const [key, field] of Object.entries(schema)) {
    if (key.startsWith("_") || field?.type !== "string" || field?.ui?.hidden) continue;
    const value = config[key];
    if (typeof value === "string" && value.trim()) return truncate(value.trim());
  }
  return null;
};

/** The provider · summary line under a row's name. */
export const providerLine = row => {
  if (!row) return "";
  if (!row.summary || row.summary === row.name) return row.providerName || "";
  return [row.providerName, row.summary].filter(Boolean).join(" · ");
};

/**
 * Normalize one plugin instance into a SourceList row. `error` prefers the
 * plugin's own load error (instances do not carry one) so a broken plugin shows
 * its reason on every source it provides.
 */
export const buildSourceRow = (plugin, instance, extra = {}) => ({
  id: instance.id,
  providerId: plugin.id,
  providerName: plugin.name || plugin.id,
  name: instance.name || plugin.name || plugin.id,
  enabled: instance.enabled !== false,
  running: instance.running,
  error: plugin.error_message || instance.error_message || null,
  summary: getInstanceSummary(plugin, instance),
  instance,
  plugin,
  ...extra,
});
