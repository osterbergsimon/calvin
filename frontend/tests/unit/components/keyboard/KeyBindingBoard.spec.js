import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import KeyBindingBoard from "@/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue";

describe("KeyBindingBoard", () => {
  it("renders 7 device tiles for KEY_1..KEY_7", () => {
    const w = mount(KeyBindingBoard, { props: { mappings: { KEY_1: "generic_prev" }, capturing: false } });
    expect(w.findAll(".kb-board .kbt").length).toBe(7);
  });

  it("lists non-1..7 keys under Other keys", () => {
    const w = mount(KeyBindingBoard, { props: { mappings: { KEY_S: "mode_settings" }, capturing: false } });
    expect(w.find(".kb-other").text()).toContain("S");
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
