import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import KeyBindingTile from "@/components/settings/tabs/layout/keyboard/KeyBindingTile.vue";

describe("KeyBindingTile", () => {
  it("renders the key label and action label", () => {
    const w = mount(KeyBindingTile, { props: { keyCode: "KEY_1", action: "generic_next" } });
    expect(w.text()).toContain("1");
    expect(w.text()).toContain("Next");
  });

  it("shows 'unassigned' when no action", () => {
    const w = mount(KeyBindingTile, { props: { keyCode: "KEY_1", action: null } });
    expect(w.text().toLowerCase()).toContain("unassigned");
  });

  it("emits edit and clear", async () => {
    const w = mount(KeyBindingTile, { props: { keyCode: "KEY_1", action: "generic_next" } });
    await w.find('[data-role="edit"]').trigger("click");
    await w.find('[data-role="clear"]').trigger("click");
    expect(w.emitted("edit")).toBeTruthy();
    expect(w.emitted("clear")).toBeTruthy();
  });

  it("flags a conflict", () => {
    const w = mount(KeyBindingTile, {
      props: { keyCode: "KEY_1", action: "generic_next", conflict: true },
    });
    expect(w.find(".kbt--conflict").exists()).toBe(true);
  });

  it("names the colliding key(s) in the conflict hint", () => {
    const w = mount(KeyBindingTile, {
      props: {
        keyCode: "KEY_0",
        action: "generic_next",
        conflict: true,
        conflictKeys: ["KEY_7"],
      },
    });
    expect(w.find(".kbt-hint").text()).toContain("7");
  });

  it("toggles the hint open when the badge is tapped", async () => {
    const w = mount(KeyBindingTile, {
      props: { keyCode: "KEY_0", action: "generic_next", conflict: true, conflictKeys: ["KEY_7"] },
    });
    expect(w.find(".kbt--hint-open").exists()).toBe(false);
    await w.find(".kbt-conflict-badge").trigger("click");
    expect(w.find(".kbt--hint-open").exists()).toBe(true);
    await w.find(".kbt-conflict-badge").trigger("click");
    expect(w.find(".kbt--hint-open").exists()).toBe(false);
  });
});
