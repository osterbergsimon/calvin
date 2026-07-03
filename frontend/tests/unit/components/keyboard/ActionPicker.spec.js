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

  it("collapses non-recommended tiers by default", () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    // Generic (recommended) is always open
    expect(w.find('[data-action="generic_next"]').exists()).toBe(true);
    // A collapsed-tier action (Calendar group) is hidden until expanded...
    expect(w.find('[data-action="calendar_next"]').exists()).toBe(false);
    // ...but its collapsible header is present
    expect(w.find('[data-group-toggle="calendar"]').exists()).toBe(true);
  });

  it("expands a collapsed group when its header is clicked", async () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    expect(w.find('[data-action="calendar_next"]').exists()).toBe(false);
    await w.find('[data-group-toggle="calendar"]').trigger("click");
    expect(w.find('[data-action="calendar_next"]').exists()).toBe(true);
    // toggles back closed
    await w.find('[data-group-toggle="calendar"]').trigger("click");
    expect(w.find('[data-action="calendar_next"]').exists()).toBe(false);
  });

  it("reveals matches inside collapsed groups while searching", async () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    // calendar_next lives in a collapsed group; search should surface it without a manual click
    await w.find("input.ap-search").setValue("calendar: next");
    expect(w.find('[data-action="calendar_next"]').exists()).toBe(true);
  });
});
