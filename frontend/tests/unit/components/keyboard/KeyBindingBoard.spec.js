import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import KeyBindingBoard from "@/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue";

describe("KeyBindingBoard", () => {
  it("renders one tile per bound key (no forced device slots)", () => {
    const w = mount(KeyBindingBoard, {
      props: {
        mappings: { KEY_1: "generic_prev", KEY_2: "generic_next", KEY_S: "mode_settings" },
        capturing: false,
      },
    });
    expect(w.findAll(".kbt").length).toBe(3);
  });

  it("shows no separate Your buttons / Other keys sections", () => {
    const w = mount(KeyBindingBoard, {
      props: { mappings: { KEY_S: "mode_settings" }, capturing: false },
    });
    expect(w.find(".kb-other").exists()).toBe(false);
    expect(w.text()).not.toContain("Other keys");
    expect(w.text()).not.toContain("Your buttons");
  });

  it("orders single-digit keys before letter keys", () => {
    const w = mount(KeyBindingBoard, {
      props: { mappings: { KEY_S: "mode_settings", KEY_1: "generic_prev" }, capturing: false },
    });
    const labels = w.findAll(".kbt-key").map(n => n.text());
    expect(labels).toEqual(["1", "S"]);
  });

  it("emits add when the capture button is clicked", async () => {
    const w = mount(KeyBindingBoard, { props: { mappings: {}, capturing: false } });
    await w.find('[data-role="add"]').trigger("click");
    expect(w.emitted("add")).toBeTruthy();
  });

  it("flags conflicts when an action is bound to two keys", () => {
    const w = mount(KeyBindingBoard, {
      props: { mappings: { KEY_1: "generic_next", KEY_2: "generic_next" }, capturing: false },
    });
    expect(w.findAll(".kbt--conflict").length).toBe(2);
  });
});
