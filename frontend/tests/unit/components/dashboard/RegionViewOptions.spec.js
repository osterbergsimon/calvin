import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RegionViewOptions from "@/components/dashboard/RegionViewOptions.vue";

function mountShell(props = {}) {
  return mount(RegionViewOptions, {
    attachTo: document.body,
    props,
    slots: { default: '<div class="probe">panel</div>' },
  });
}

describe("RegionViewOptions", () => {
  it("hides its panel until the trigger is clicked", async () => {
    const w = mountShell();
    expect(w.find(".probe").exists()).toBe(false);
    await w.find(".region-view-options__trigger").trigger("click");
    expect(w.find(".probe").exists()).toBe(true);
    w.unmount();
  });

  it("toggles closed on a second trigger click", async () => {
    const w = mountShell();
    const trigger = w.find(".region-view-options__trigger");
    await trigger.trigger("click");
    await trigger.trigger("click");
    expect(w.find(".probe").exists()).toBe(false);
    w.unmount();
  });

  it("closes when Escape is pressed", async () => {
    const w = mountShell();
    await w.find(".region-view-options__trigger").trigger("click");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await w.vm.$nextTick();
    expect(w.find(".probe").exists()).toBe(false);
    w.unmount();
  });

  it("closes when a pointer lands outside the control", async () => {
    const w = mountShell();
    await w.find(".region-view-options__trigger").trigger("click");
    document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find(".probe").exists()).toBe(false);
    w.unmount();
  });

  it("reflects the active modifier state on the trigger", () => {
    const w = mountShell({ active: true });
    // Trigger composes ui/IconButton, whose lit state is the icon-btn--active class.
    expect(w.find(".region-view-options__trigger").classes()).toContain("icon-btn--active");
    w.unmount();
  });

  it("uses the label prop for the accessible name", () => {
    const w = mountShell({ label: "Calendar view options" });
    expect(w.find(".region-view-options__trigger").attributes("aria-label")).toBe(
      "Calendar view options"
    );
    w.unmount();
  });
});
