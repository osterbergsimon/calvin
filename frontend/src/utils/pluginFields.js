/**
 * Instance-config field helpers shared by the schema form renderer and the
 * instance modal.
 *
 * Contract 1.0 field shape (docs/plugins/PLUGIN_INTERFACE.md):
 * - `label` is the form label; absent means a humanised key.
 * - `description` is the one-line hint under the control.
 * - `hidden: true` keeps a field out of the form (its default is still saved).
 */

// Keys that are settings of the plugin type, never of one instance. They are
// also excluded from the instance payload, so showing them would be a lie.
const INTERNAL_FIELD_KEYS = new Set(["display_order"]);

// Sentence case, except for words people read as acronyms.
const ACRONYMS = {
  api: "API",
  cpu: "CPU",
  csv: "CSV",
  dns: "DNS",
  gpu: "GPU",
  http: "HTTP",
  https: "HTTPS",
  ical: "iCal",
  id: "ID",
  ics: "iCal",
  ip: "IP",
  json: "JSON",
  rtsp: "RTSP",
  ssl: "SSL",
  tls: "TLS",
  url: "URL",
  yaml: "YAML",
};

/** "feed_url" / "feedUrl" -> "Feed URL". */
export function humanizeFieldKey(key) {
  const words = String(key ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return String(key ?? "");

  return words
    .map(word => {
      const lower = word.toLowerCase();
      return ACRONYMS[lower] || lower;
    })
    .map((word, index) =>
      index === 0 && !ACRONYMS[word.toLowerCase()]
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word
    )
    .join(" ");
}

/** A declared label wins; otherwise the key becomes a sentence-case label. */
export function fieldLabel(key, schema) {
  const declared = schema && typeof schema === "object" ? schema.label : null;
  if (typeof declared === "string" && declared.trim()) return declared.trim();
  return humanizeFieldKey(key);
}

/** True for `hidden: true` and for keys the instance form must never show. */
export function isHiddenField(key, schema) {
  if (INTERNAL_FIELD_KEYS.has(key)) return true;
  return Boolean(schema && typeof schema === "object" && schema.hidden === true);
}
