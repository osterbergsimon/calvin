import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ActionPicker from "@/components/settings/tabs/layout/keyboard/ActionPicker.vue";

describe("ActionPicker", () => {
  it("shows the captured key and generic actions first", () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    expect(w.text()).toContain("KEY_4");
    const first = w.find(".ap-group");
    expect(first.text()).toContain("Generic");
    expect(first.text()).toContain("Next");
  });

  it("emits select with the action value", async () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    await w.find('[data-action="generic_next"]').trigger("click");
    expect(w.emitted("select")[0]).toEqual(["generic_next"]);
  });

  it("filters actions by search text", async () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    await w.find("input.ap-search").setValue("refresh");
    expect(w.text().toLowerCase()).toContain("refresh");
    expect(w.find('[data-action="generic_next"]').exists()).toBe(false);
  });
});
