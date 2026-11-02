/**
 * Allowlist layout (docs/design/frontend-doctrine.md §7).
 *
 * The baselines are split one file per migration area so parallel doctrine PRs
 * edit different files. This guards the split itself: each area's entries stay
 * sorted and duplicate-free, and no file is owned by two areas (which would make
 * a migration PR collide with another area's).
 */
import { describe, it, expect } from "vitest";
import * as content from "./allowlists/content.js";
import * as dashboard from "./allowlists/dashboard.js";
import * as lockSignIn from "./allowlists/lock-signin.js";
import * as other from "./allowlists/other.js";
import * as pageEditor from "./allowlists/page-editor.js";
import * as plugins from "./allowlists/plugins.js";
import * as screens from "./allowlists/screens.js";
import * as securitySystem from "./allowlists/security-system.js";
import * as ui from "./allowlists/ui.js";

const AREAS = {
  content,
  plugins,
  "security-system": securitySystem,
  screens,
  "page-editor": pageEditor,
  "lock-signin": lockSignIn,
  dashboard,
  ui,
  other,
};

const LINTS = ["roleLint", "controlLint", "settingsNoStyle"];
const KINDS = ["allowlist", "baseline"];

describe("allowlist areas", () => {
  it("keeps every area's entries sorted and free of duplicates", () => {
    for (const [name, area] of Object.entries(AREAS)) {
      for (const lint of LINTS) {
        for (const kind of KINDS) {
          const entries = area[lint][kind];
          expect(entries, `${name}/${lint}/${kind}`).toEqual([...new Set(entries)].sort());
        }
      }
    }
  });

  it("assigns each allowlisted file to exactly one area", () => {
    for (const lint of LINTS) {
      for (const kind of KINDS) {
        const owners = new Map();
        for (const [name, area] of Object.entries(AREAS)) {
          for (const file of area[lint][kind]) {
            owners.set(file, [...(owners.get(file) ?? []), name]);
          }
        }
        const shared = [...owners].filter(([, areas]) => areas.length > 1);
        expect(shared, `${lint}/${kind}`).toEqual([]);
      }
    }
  });
});
