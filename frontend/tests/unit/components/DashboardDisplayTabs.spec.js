import { beforeEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DashboardRegionsEditor from "@/components/settings/shared/DashboardRegionsEditor.vue";
import { useWebServicesStore } from "@/stores/webServices";

describe("DashboardRegionsEditor (screens & regions logic)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const webServicesStore = useWebServicesStore();
    vi.spyOn(webServicesStore, "fetchServices").mockResolvedValue({ services: [] });
  });

  it("exposes dashboard layout controls with stable ids", () => {
    const wrapper = mount(DashboardRegionsEditor, {
      props: { config: {} },
    });

    // orientation controls moved to DisplaySettings rows; not part of this editor
    expect(wrapper.find("#display-orientation").exists()).toBe(false);
    expect(wrapper.find("#add-region-screen-home").exists()).toBe(true);
    // Size is a read-only readout now — resizing is done via the preview drag handles.
    expect(wrapper.find(".preview-size-value").exists()).toBe(true);
    expect(wrapper.find("#region-component-region-1").exists()).toBe(true);
    expect(wrapper.find(".screen-stack").exists()).toBe(true);
    expect(wrapper.find(".screen-card").exists()).toBe(true);
    expect(wrapper.find(".screen-preview").exists()).toBe(true);
    expect(wrapper.find("#side-view-position").exists()).toBe(false);
  });

  it("orients rendered screen cards with the configured display layout", () => {
    const landscapeWrapper = mount(DashboardRegionsEditor, {
      props: { config: { orientation: "landscape" } },
    });
    const portraitWrapper = mount(DashboardRegionsEditor, {
      props: { config: { orientation: "portrait" } },
    });

    expect(landscapeWrapper.find(".screen-stack-landscape").exists()).toBe(true);
    expect(portraitWrapper.find(".screen-stack-portrait").exists()).toBe(true);
  });

  it("renders read-only region size readouts", () => {
    const wrapper = mount(DashboardRegionsEditor, {
      props: { config: { calendarSplit: 70 } },
    });

    // Region sizing is done by dragging the resize handles in the preview; the
    // cards show the resulting split as a read-only readout. (The resize math
    // itself is covered by resizeAdjacentRegions in layout.spec.)
    const sizes = wrapper.findAll(".preview-size-value").map(n => n.text());
    expect(sizes).toContain("70%");
    expect(sizes).toContain("30%");
  });

  it("renders region delete as a danger IconButton", () => {
    const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
    const del = wrapper.find('[aria-label="Delete Region 2"]');
    expect(del.exists()).toBe(true);
    expect(del.classes()).toContain("icon-btn");
    expect(del.classes()).toContain("icon-btn--danger");
  });

  it("removes a region and renormalizes the layout", async () => {
    const wrapper = mount(DashboardRegionsEditor, {
      props: { config: {} },
    });

    await wrapper.find('[aria-label="Delete Region 2"]').trigger("click");

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    const screen = emitted.dashboardScreens.screens[0];
    expect(screen.layout.regions).toEqual([
      {
        id: "region-1",
        kind: "calendar",
        serviceId: null,
        instanceIds: [],
        size: 100,
        split: null,
        view: { mode: "month", rolling: false, weeks: 4, days: 7, extraWeeks: 0 },
      },
    ]);
  });

  it("adds a region via the + Region button", async () => {
    const wrapper = mount(DashboardRegionsEditor, {
      props: { config: {} },
    });

    await wrapper.find("#add-region-screen-home").trigger("click");

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    const screen = emitted.dashboardScreens.screens[0];
    expect(screen.layout.regions).toHaveLength(3);
  });

  it("emits selected service ids for service regions", async () => {
    const webServicesStore = useWebServicesStore();
    webServicesStore.services = [
      { id: "weather", name: "Weather" },
      { id: "meals", name: "Meals" },
    ];
    const wrapper = mount(DashboardRegionsEditor, {
      props: {
        config: {
          dashboardScreens: {
            version: 2,
            activeScreenId: "services",
            screens: [
              {
                id: "services",
                name: "Services",
                layout: {
                  version: 1,
                  preset: "split_two",
                  regions: [
                    { id: "region-1", kind: "service", serviceId: null, size: 50 },
                    { id: "region-2", kind: "service", serviceId: null, size: 50 },
                  ],
                },
                activeRegionId: "region-1",
              },
            ],
          },
        },
      },
    });

    await wrapper.find("#region-component-region-1").trigger("click");
    await wrapper
      .findAll(".component-option")
      .find(option => option.text() === "Weather")
      .trigger("click");

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    expect(emitted.dashboardScreens.screens[0].layout.regions[0]).toMatchObject({
      kind: "service",
      serviceId: "weather",
    });
  });

  it("adds and activates a new dashboard screen", async () => {
    const wrapper = mount(DashboardRegionsEditor, {
      props: { config: {} },
    });

    await wrapper.find(".screen-add").trigger("click");

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    expect(emitted.dashboardScreens.screens).toHaveLength(2);
    expect(emitted.dashboardScreens.activeScreenId).toBe(emitted.dashboardScreens.screens[1].id);
  });

  it("renders draggable preview handles between regions", () => {
    const wrapper = mount(DashboardRegionsEditor, {
      props: { config: {} },
    });

    expect(wrapper.find(".preview-resizer").exists()).toBe(true);
  });

  it("sets the primary region from the preview radio", async () => {
    const wrapper = mount(DashboardRegionsEditor, {
      props: { config: {} },
    });

    await wrapper.find("#region-primary-region-2").setValue(true);

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    expect(emitted.dashboardScreens.screens[0].activeRegionId).toBe("region-2");
  });

  it("toggles a screen's expanded state via its collapse control", async () => {
    const wrapper = mount(DashboardRegionsEditor, { props: { config: {} } });
    const toggle = wrapper.find(".screen-collapse-toggle");
    const before = toggle.attributes("aria-expanded");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).not.toBe(before);
  });
});
