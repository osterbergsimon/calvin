import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ClockBarEditor from "@/components/settings/shared/ClockBarEditor.vue";
import { useWebServicesStore } from "@/stores/webServices";
import { useKiosksStore } from "@/stores/kiosks";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const baseConfig = () => ({
  orientation: "landscape",
  clockBarDesign: null,
  clockShowDate: true,
  clockShowSeconds: false,
  clockBarShowLogo: true,
  clockBarLayout: "two-lines",
  clockBarVerticalLayout: "upright",
  clockBarFontSize: 16,
  clockBarDateFontSize: 14,
  clockBarPadding: 8,
  clockBarPluginItemSize: 16,
  clockBarVerticalFontSize: 18,
  clockBarVerticalDateFontSize: 11,
  clockBarVerticalPadding: 8,
  clockBarVerticalPluginItemSize: 16,
});

const stubs = {
  BarActionCluster: true,
  PluginStatusbarItems: {
    props: ["ids", "orientation", "size"],
    template: '<span class="plugin-statusbar-stub" />',
  },
};

function mountEditor(config = baseConfig()) {
  return mount(ClockBarEditor, {
    props: { open: true, config },
    global: { stubs },
    attachTo: document.body,
  });
}

const lastDesign = wrapper => {
  const events = wrapper.emitted("update:config");
  return events?.[events.length - 1]?.[0]?.clockBarDesign;
};

async function selectPart(wrapper, id) {
  const chip = wrapper.find(`[data-part-id="${id}"] .clock-bar-chip__hit`);
  expect(chip.exists(), id).toBe(true);
  await chip.trigger("click");
}

describe("ClockBarEditor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const services = useWebServicesStore();
    services.services = [
      { id: "weather", name: "Weather", config: {}, statusbar_schema: { kind: "status" } },
      { id: "energy", name: "Energy", config: {}, statusbar_schema: { kind: "status" } },
    ];
    const kiosks = useKiosksStore();
    kiosks.kiosks = [];
    kiosks.loadKiosks = vi.fn(async () => {});
  });

  it("draws the real bar with a chip for every part", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    for (const id of ["logo", "room", "pageDots", "time", "date", "tile:weather", "status"]) {
      expect(wrapper.find(`[data-part-id="${id}"]`).exists(), id).toBe(true);
    }
    // The old-hidden tile starts on the shelf but is still a chip there.
    expect(wrapper.find('[data-part-id="tile:energy"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("shows the selected part's settings and hides it to the shelf", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await selectPart(wrapper, "time");
    expect(wrapper.find("[data-test='part-panel']").text()).toContain("Time");
    expect(wrapper.find('[aria-label="Show Time"]').exists()).toBe(true);

    await wrapper.find('[aria-label="Show Time"]').trigger("click");
    expect(lastDesign(wrapper).horizontal.hidden).toContain("time");
    // Time left its zone and now sits on the shelf.
    expect(lastDesign(wrapper).horizontal.zones.center).not.toContain("time");
    wrapper.unmount();
  });

  it("moves a part with Move later, so keyboard use needs no drag", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await selectPart(wrapper, "time");
    await wrapper.find("[data-test='move-later']").trigger("click");

    expect(lastDesign(wrapper).horizontal.zones.center).toEqual(["date", "time"]);
    wrapper.unmount();
  });

  it("moves a focused chip with the arrow keys", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await selectPart(wrapper, "time");
    await wrapper
      .find('[data-part-id="time"] .clock-bar-chip__hit')
      .trigger("keydown", { key: "ArrowRight" });

    expect(lastDesign(wrapper).horizontal.zones.center).toEqual(["date", "time"]);
    wrapper.unmount();
  });

  it("offers a zone select and keeps Status & menu out of the shelf", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await selectPart(wrapper, "date");
    expect(wrapper.find('[aria-label^="Zone for Date"]').exists()).toBe(true);

    await selectPart(wrapper, "status");
    expect(wrapper.find('[aria-label="Show Status & menu"]').exists()).toBe(false);
    expect(wrapper.find("[data-shelf]").text()).not.toContain("Status & menu");
    wrapper.unmount();
  });

  it("resets to the design the old keys describe, and undoes it", async () => {
    const wrapper = mountEditor({ ...baseConfig(), clockShowDate: false });
    await flushPromises();

    await wrapper.find("[data-test='reset-clock-bar']").trigger("click");
    await wrapper.find("[data-test='confirm-accept']").trigger("click");

    const reset = lastDesign(wrapper);
    expect(reset.horizontal.hidden).toContain("date");
    expect(wrapper.find("[data-test='reset-undo']").exists()).toBe(true);

    await wrapper
      .find("[data-test='reset-undo'] .btn, [data-test='reset-undo'] button")
      .trigger("click");
    wrapper.unmount();
  });
});
