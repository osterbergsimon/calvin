/**
 * Plugin tile icons (§6).
 *
 * `PluginMetadata.icon` is an emoji string or a file in the plugin's own
 * `frontend/` dir (served from its static route). Absent → the name's first
 * letter, so every tile renders something.
 */

/** A file (or URL) rather than an emoji: it has a path separator or a dot. */
export const isIconFile = icon =>
  typeof icon === "string" && icon.trim() !== "" && /[/.]/.test(icon) && icon.length > 2;

/** Where a file icon is served from; absolute URLs pass through. */
export const pluginIconUrl = plugin => {
  const icon = String(plugin?.icon || "");
  if (/^https?:\/\//i.test(icon)) return icon;
  return `/api/plugins/${plugin.id}/static/${icon.replace(/^\/+/, "")}`;
};

/** The first letter of the plugin's name, upper-cased. */
export const pluginIconLetter = plugin =>
  (plugin?.name || plugin?.label || plugin?.id || "?").charAt(0).toUpperCase();
