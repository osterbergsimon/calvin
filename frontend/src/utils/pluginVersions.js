/**
 * Semver-aware version comparison for plugin updates.
 *
 * Plugins declare `version` in `plugin.json`; the catalog enumerate result
 * carries the same string. An Installed card offers Update only when the
 * catalog version is genuinely NEWER — the old `!==` compare offered a
 * downgrade as an "update" too (design 2026-10-30-content-and-plugins §3.3).
 */

// Accepts "1", "1.2", "1.2.3", an optional leading v, and a semver
// pre-release/build suffix ("1.2.3-rc.1", "1.2.3+build"). Anything else is
// treated as an opaque string.
const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+]([0-9A-Za-z][0-9A-Za-z.-]*))?$/i;

const parseVersion = value => {
  if (value === null || value === undefined) return null;
  const match = String(value).trim().match(VERSION_RE);
  if (!match) return null;
  const [, major, minor = "0", patch = "0", suffix = ""] = match;
  return {
    release: [Number(major), Number(minor), Number(patch)],
    prerelease: suffix ? suffix.split(".") : [],
  };
};

const compareIdentifiers = (a, b) => {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a.localeCompare(b);
};

const comparePrerelease = (a, b) => {
  // A release outranks any pre-release of the same version (1.0.0 > 1.0.0-rc).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const result = compareIdentifiers(a[i], b[i]);
    if (result !== 0) return Math.sign(result);
  }
  return 0;
};

/**
 * Compare two plugin versions: -1 when a < b, 0 when equal, 1 when a > b.
 * Non-semver strings fall back to a plain string compare so a legacy version
 * still behaves sanely instead of throwing.
 */
export const compareVersions = (a, b) => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    const leftText = String(a ?? "").trim();
    const rightText = String(b ?? "").trim();
    if (leftText === rightText) return 0;
    return leftText < rightText ? -1 : 1;
  }
  for (let i = 0; i < 3; i += 1) {
    const diff = left.release[i] - right.release[i];
    if (diff !== 0) return Math.sign(diff);
  }
  return comparePrerelease(left.prerelease, right.prerelease);
};

/** True only when `candidate` is a strict upgrade over `installed`. */
export const isNewerVersion = (candidate, installed) => {
  if (!candidate || !installed) return false;
  return compareVersions(candidate, installed) > 0;
};
