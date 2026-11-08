// Plugin and feed data can carry any string as a link. Only http(s) is ever
// opened, embedded or turned into an href: `javascript:`, `data:` and the rest
// are dropped (calvin-eugy review S4).
export function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
