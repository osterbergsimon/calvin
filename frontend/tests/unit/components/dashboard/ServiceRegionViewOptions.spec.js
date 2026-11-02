import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ServiceRegionViewOptions from "@/components/dashboard/ServiceRegionViewOptions.vue";
import { useConfigStore } from "@/stores/config";

describe("ServiceRegionViewOptions — card size", () => {
  beforeEach(() => setActivePinia(createPinia()));

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function openPopover(view = {}) {
    const wrapper = mount(ServiceRegionViewOptions, {
      attachTo: document.body,
      props: { regionId: "region-1", view },
    });
    // RegionViewOptions renders the popover slot only when open; click the trigger.
    wrapper.find(".region-view-options__trigger").trigger("click");
    return wrapper;
  }

  it("reflects the region's current card size (default medium when absent)", async () => {
    const wrapper = openPopover({});
    await wrapper.vm.$nextTick();
    // The panel is teleported to <body>.
    const pill = document.querySelectorAll('[aria-label^="Card size"]');
    expect(pill.length).toBe(1);
    // default surfaced as medium
    expect(document.body.textContent).toContain("Medium");
    wrapper.unmount();
  });

  it("persists a card-size change via updateRegionView", async () => {
    const wrapper = openPopover({ cardSize: "medium" });
    await wrapper.vm.$nextTick();
    const store = useConfigStore();
    const spy = vi.spyOn(store, "updateRegionView").mockResolvedValue();

    // SelectPill options are <li role="option"> teleported to document.body, not buttons.
    // First open the SelectPill dropdown by clicking its trigger (the pill button).
    const pillTrigger = document.querySelector('[aria-label^="Card size"]');
    pillTrigger.click();
    await wrapper.vm.$nextTick();

    // Find the "Large" option among the teleported <li role="option"> elements.
    const options = Array.from(document.body.querySelectorAll('[role="option"]'));
    const large = options.find(el => el.textContent.trim() === "Large");
    large.click();
    await wrapper.vm.$nextTick();

    expect(spy).toHaveBeenCalledWith("region-1", { cardSize: "large" });
    wrapper.unmount();
  });
});
