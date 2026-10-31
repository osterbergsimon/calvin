/**
 * Role lint (docs/design/frontend-doctrine.md §7 item 2, §2).
 *
 * Components use the semantic roles — `--text-*`, `--gap-*`, `--radius-control
 * |card|panel|round` — never the primitive scales. The doctrine also fixes the
 * other token families to one short set: five z-index layers, the elevation
 * roles, the weight roles and the motion durations. The allowlist starts with
 * today's files and may only shrink.
 */
import { describe, it, expect } from "vitest";
import { ROLE_LINT_ALLOWLIST, ROLE_LINT_BASELINE } from "./allowlists.js";
import {
  VUE_FILES,
  addedToAllowlist,
  formatViolation,
  roleViolations,
  staleEntries,
  unallowed,
} from "./lint-helpers.js";

const violations = VUE_FILES.flatMap(roleViolations);

describe("role lint: semantic roles, not primitives", () => {
  it("scans the component tree", () => {
    expect(VUE_FILES.length).toBeGreaterThan(100);
    expect(VUE_FILES).toContain("components/ui/Button.vue");
  });

  it("has no unallowlisted file using a primitive or a literal", () => {
    expect(unallowed(violations, ROLE_LINT_ALLOWLIST).map(formatViolation)).toEqual([]);
  });

  it("keeps the allowlist honest: every entry still violates", () => {
    expect(staleEntries(ROLE_LINT_ALLOWLIST, roleViolations)).toEqual([]);
  });

  it("only shrinks: no file was added to the allowlist", () => {
    expect(addedToAllowlist(ROLE_LINT_ALLOWLIST, ROLE_LINT_BASELINE)).toEqual([]);
  });

  it("stays sorted and free of duplicates", () => {
    expect(ROLE_LINT_ALLOWLIST).toEqual([...new Set(ROLE_LINT_ALLOWLIST)].sort());
  });
});
