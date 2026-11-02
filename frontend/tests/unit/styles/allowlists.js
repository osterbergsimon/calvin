/**
 * Shrinking allowlists for the doctrine lints (docs/design/frontend-doctrine.md
 * §7). Seeded from the violations present when the lint landed; a migration PR
 * removes its files, and nothing may add one back.
 *
 * One file per area so parallel PRs don't conflict: each module under
 * ./allowlists/ exports `roleLint`, `controlLint` and `settingsNoStyle`, each
 * with an `allowlist` (live) and a `baseline` (seed) array. This index
 * concatenates them and sorts, so the lints get exactly the arrays they had
 * before the split.
 *
 * The baseline arrays are the seed, copied by hand: a test fails when the live
 * allowlist contains a file the baseline does not, so "make CI green" can never
 * mean "allowlist the new thing".
 */
import * as content from "./allowlists/content.js";
import * as dashboard from "./allowlists/dashboard.js";
import * as lockSignIn from "./allowlists/lock-signin.js";
import * as other from "./allowlists/other.js";
import * as pageEditor from "./allowlists/page-editor.js";
import * as plugins from "./allowlists/plugins.js";
import * as screens from "./allowlists/screens.js";
import * as securitySystem from "./allowlists/security-system.js";
import * as ui from "./allowlists/ui.js";

const AREAS = [
  content,
  plugins,
  securitySystem,
  screens,
  pageEditor,
  lockSignIn,
  dashboard,
  ui,
  other,
];

const collect = (lint, kind) => AREAS.flatMap(area => area[lint][kind]).sort();

export const ROLE_LINT_ALLOWLIST = collect("roleLint", "allowlist");
export const ROLE_LINT_BASELINE = collect("roleLint", "baseline");

export const CONTROL_LINT_ALLOWLIST = collect("controlLint", "allowlist");
export const CONTROL_LINT_BASELINE = collect("controlLint", "baseline");

export const SETTINGS_NO_STYLE_ALLOWLIST = collect("settingsNoStyle", "allowlist");
export const SETTINGS_NO_STYLE_BASELINE = collect("settingsNoStyle", "baseline");
