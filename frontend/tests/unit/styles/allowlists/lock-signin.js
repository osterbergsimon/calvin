/**
 * Doctrine lint allowlists for Lock & sign-in (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: ["components/settings/auth/AuthLockScreen.vue"],
  baseline: [
    "components/auth/AdminSignInDialog.vue",
    "components/settings/auth/AuthLockScreen.vue",
  ],
};

export const controlLint = {
  allowlist: [],
  baseline: ["components/auth/AdminSignInDialog.vue"],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: [],
};
