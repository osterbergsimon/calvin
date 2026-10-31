/**
 * Doctrine lint allowlists for Page editor (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [],
  baseline: [],
};

export const controlLint = {
  allowlist: [],
  baseline: [],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: [],
};
