/**
 * Resolve a JSONPath-lite expression against a data object.
 *
 * Supported syntax:
 *   "$"               root object
 *   "$.foo"           property access
 *   "$.foo.bar"       nested property
 *   "$.foo[0]"        array index
 *   "$.items[0].name" combined
 *
 * Returns undefined for missing paths. Returns the data itself for "$" or empty path.
 * Plugins use this to bind schema fields to data without shipping JS.
 */
export function resolvePath(data, path) {
  if (data == null) return undefined;
  if (!path || path === "$") return data;

  const expr = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  if (!expr) return data;

  const segments = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(expr)) !== null) {
    segments.push(m[1] !== undefined ? m[1] : Number(m[2]));
  }

  let cursor = data;
  for (const seg of segments) {
    if (cursor == null) return undefined;
    cursor = cursor[seg];
  }
  return cursor;
}
