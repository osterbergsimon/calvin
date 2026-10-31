/**
 * Control lint (docs/design/frontend-doctrine.md §7 item 3, §3).
 *
 * Outside `components/ui/`, a selector that targets a button, input or select
 * (or a class named like one) may lay the control out — margin, gap, width,
 * flex — but may not restyle it: background, border, radius, font size/weight,
 * colour and padding belong to the shared control. The allowlist starts with
 * today's files and may only shrink.
 */
import { describe, it, expect } from "vitest";
import { CONTROL_LINT_ALLOWLIST, CONTROL_LINT_BASELINE } from "./allowlists.js";
import {
  VUE_FILES,
  addedToAllowlist,
  controlViolations,
  formatViolation,
  staleEntries,
  unallowed,
} from "./lint-helpers.js";

const violations = VUE_FILES.flatMap(controlViolations);

describe("control lint: controls are styled only in components/ui/", () => {
  it("has no unallowlisted control restyling", () => {
    expect(unallowed(violations, CONTROL_LINT_ALLOWLIST).map(formatViolation)).toEqual([]);
  });

  it("keeps the allowlist honest: every entry still violates", () => {
    expect(staleEntries(CONTROL_LINT_ALLOWLIST, controlViolations)).toEqual([]);
  });

  it("only shrinks: no file was added to the allowlist", () => {
    expect(addedToAllowlist(CONTROL_LINT_ALLOWLIST, CONTROL_LINT_BASELINE)).toEqual([]);
  });

  it("stays sorted and free of duplicates", () => {
    expect(CONTROL_LINT_ALLOWLIST).toEqual([...new Set(CONTROL_LINT_ALLOWLIST)].sort());
  });
});
