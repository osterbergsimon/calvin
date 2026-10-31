/**
 * The add-on catalog, and the one rule that keeps it safe.
 *
 * Installing a plugin runs third-party code on the server, so the Content
 * provider picker may install ONLY from the official Calvin catalog (design
 * 2026-10-30-content-and-plugins §3.7). Another GitHub repository or a local
 * path is a deliberate visit in Plugins, never a one-click add from a source
 * dialog. Anything else falls back to "Get more in Plugins ›".
 */

export const OFFICIAL_PLUGIN_CATALOG_REPO = "https://github.com/osterbergsimon/calvin-plugins";

const normalizeRepo = value =>
  String(value ?? "")
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();

/** True when `repo` is the official catalog (trailing slash / .git tolerated). */
export const isOfficialCatalogRepo = repo =>
  normalizeRepo(repo) === normalizeRepo(OFFICIAL_PLUGIN_CATALOG_REPO);

/**
 * A repo entry that opts out of the catalog (`"catalog": false` in
 * `plugins.json`). It stays installable from its repository, but never appears
 * in the Content picker or Plugins › catalog, in any mode.
 */
export const isCatalogEntry = plugin => plugin?.catalog !== false;

/** The repo's own test fixtures, hidden from end users (shown in dev mode). */
export const isTestPlugin = plugin =>
  (plugin?.keywords || plugin?.manifest?.keywords || []).includes("test");

/**
 * The repository the picker may enumerate and install from: the configured
 * catalog when it is the official one, otherwise "" (no catalog group).
 */
export const pickerCatalogRepo = configuredRepo =>
  isOfficialCatalogRepo(configuredRepo) ? OFFICIAL_PLUGIN_CATALOG_REPO : "";
