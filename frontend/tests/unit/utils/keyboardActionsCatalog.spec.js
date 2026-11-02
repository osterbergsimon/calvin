import { describe, it, expect } from "vitest";
import { ACTION_GROUPS, actionLabel, ALL_ACTION_VALUES } from "@/utils/keyboardActionsCatalog";

describe("keyboardActionsCatalog", () => {
  it("puts the generic group first and marks it recommended", () => {
    expect(ACTION_GROUPS[0].id).toBe("generic");
    expect(ACTION_GROUPS[0].tier).toBe("recommended");
    const values = ACTION_GROUPS[0].actions.map(a => a.value);
    expect(values).toEqual([
      "generic_next",
      "generic_prev",
      "generic_expand_close",
      "generic_refresh",
    ]);
  });

  it("has no 'Modes' group; open-settings lives under navigation", () => {
    expect(ACTION_GROUPS.some(g => g.id === "modes")).toBe(false);
    const nav = ACTION_GROUPS.find(g => g.id === "navigation");
    expect(nav.actions.map(a => a.value)).toContain("mode_settings");
  });

  it("exposes the renamed screen-jump actions and no retired mode_* actions", () => {
    const jump = ACTION_GROUPS.find(g => g.id === "jump");
    expect(jump.actions.map(a => a.value)).toEqual([
      "screen_jump_calendar",
      "screen_jump_photos",
      "screen_jump_services",
    ]);
    // mode_cycle / mode_spare / mode_calendar et al. are gone (mode_settings stays)
    const retired = [
      "mode_cycle",
      "mode_spare",
      "mode_calendar",
      "mode_photos",
      "mode_web_services",
    ];
    for (const value of retired) {
      expect(ALL_ACTION_VALUES).not.toContain(value);
    }
    expect(ALL_ACTION_VALUES).toContain("mode_settings");
  });

  it("lists every value exactly once", () => {
    const set = new Set(ALL_ACTION_VALUES);
    expect(set.size).toBe(ALL_ACTION_VALUES.length);
  });

  it("resolves labels and falls back to the raw value", () => {
    expect(actionLabel("generic_next")).toBe("Next");
    expect(actionLabel("totally_unknown")).toBe("totally_unknown");
  });
});
