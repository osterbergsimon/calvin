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
});
