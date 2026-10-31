/**
 * Settings style lint (docs/design/frontend-doctrine.md §3.1 rule 1, §7 item 4).
 *
 * A settings category or tab is a layout: it composes SettingsSection,
 * SettingGroup, SettingRow and the ui/ controls and owns no visual CSS of its
 * own. The allowlist starts with today's files and may only shrink as each
 * category migrates.
 */
import { describe, it, expect } from "vitest";
import { SETTINGS_NO_STYLE_ALLOWLIST, SETTINGS_NO_STYLE_BASELINE } from "./allowlists.js";
import {
  VUE_FILES,
  addedToAllowlist,
  formatViolation,
  settingsStyleViolations,
  staleEntries,
  unallowed,
} from "./lint-helpers.js";

const violations = VUE_FILES.flatMap(settingsStyleViolations);

describe("settings lint: categories and tabs carry no style block", () => {
  it("has no unallowlisted settings style block", () => {
    expect(unallowed(violations, SETTINGS_NO_STYLE_ALLOWLIST).map(formatViolation)).toEqual([]);
  });

  it("keeps the allowlist honest: every entry still has a style block", () => {
    expect(staleEntries(SETTINGS_NO_STYLE_ALLOWLIST, settingsStyleViolations)).toEqual([]);
  });

  it("only shrinks: no file was added to the allowlist", () => {
    expect(addedToAllowlist(SETTINGS_NO_STYLE_ALLOWLIST, SETTINGS_NO_STYLE_BASELINE)).toEqual([]);
  });

  it("stays sorted and free of duplicates", () => {
    expect(SETTINGS_NO_STYLE_ALLOWLIST).toEqual([...new Set(SETTINGS_NO_STYLE_ALLOWLIST)].sort());
  });
});
