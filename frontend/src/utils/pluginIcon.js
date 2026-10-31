/**
 * Plugin tile icons (§6).
 *
 * `PluginMetadata.icon` is an `mdi:<name>` icon, a file in the plugin's own
 * `frontend/` dir (served from its static route), or an emoji. Only a curated
 * set of MDI glyphs is imported by name, so the bundle grows by a few KB rather
 * than by the whole `@mdi/js` set. Anything unknown, and every emoji, falls
 * back to the name's first letter, so every tile renders something.
 */

import {
  mdiAccount,
  mdiAlertCircle,
  mdiBusClock,
  mdiCalendar,
  mdiCameraOutline,
  mdiCast,
  mdiChartLine,
  mdiCheck,
  mdiClockOutline,
  mdiCog,
  mdiEmailOutline,
  mdiFlaskOutline,
  mdiFolderImage,
  mdiGauge,
  mdiImage,
  mdiImageAutoAdjust,
  mdiImageMultiple,
  mdiLightbulbOutline,
  mdiMapMarker,
  mdiMusic,
  mdiPalette,
  mdiPlayCircle,
  mdiPuzzle,
  mdiRss,
  mdiServer,
  mdiShuffleVariant,
  mdiSilverwareForkKnife,
  mdiStar,
  mdiTelescope,
  mdiThermometer,
  mdiVideoOutline,
  mdiWeatherPartlyCloudy,
  mdiWeb,
  mdiWifi,
} from "@mdi/js";

/**
 * The curated MDI names a plugin may use. Keep in sync with the list mirrored
 * by the calvin-plugins validator; an unknown name is not an error, it just
 * falls back to the first letter.
 */
export const PLUGIN_ICON_PATHS = Object.freeze({
  "image-auto-adjust": mdiImageAutoAdjust,
  "email-outline": mdiEmailOutline,
  "image-multiple": mdiImageMultiple,
  "folder-image": mdiFolderImage,
  "silverware-fork-knife": mdiSilverwareForkKnife,
  "shuffle-variant": mdiShuffleVariant,
  "weather-partly-cloudy": mdiWeatherPartlyCloudy,
  "camera-outline": mdiCameraOutline,
  "flask-outline": mdiFlaskOutline,
  "bus-clock": mdiBusClock,
  telescope: mdiTelescope,
  gauge: mdiGauge,
  cast: mdiCast,
  calendar: mdiCalendar,
  "clock-outline": mdiClockOutline,
  "alert-circle": mdiAlertCircle,
  "lightbulb-outline": mdiLightbulbOutline,
  "video-outline": mdiVideoOutline,
  "play-circle": mdiPlayCircle,
  "chart-line": mdiChartLine,
  "map-marker": mdiMapMarker,
  account: mdiAccount,
  palette: mdiPalette,
  thermometer: mdiThermometer,
  puzzle: mdiPuzzle,
  server: mdiServer,
  image: mdiImage,
  music: mdiMusic,
  wifi: mdiWifi,
  star: mdiStar,
  check: mdiCheck,
  cog: mdiCog,
  rss: mdiRss,
  web: mdiWeb,
});

/** True when `icon` asks for an MDI glyph (`mdi:<name>`, any case). */
export const isMdiIcon = icon => /^mdi:/i.test(String(icon ?? "").trim());

/** The curated SVG path for an `mdi:<name>` icon, or "" when unknown. */
export const pluginIconPath = plugin => {
  const icon = String(plugin?.icon ?? "").trim();
  if (!isMdiIcon(icon)) return "";
  return PLUGIN_ICON_PATHS[icon.slice(4).trim().toLowerCase()] || "";
};

/** A file (or URL) rather than an emoji or an MDI name: it has a separator or a dot. */
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
