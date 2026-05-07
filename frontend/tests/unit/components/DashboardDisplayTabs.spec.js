import { beforeEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DashboardLayoutTab from "@/components/settings/tabs/dashboard/DashboardLayoutTab.vue";
import CalendarDisplayTab from "@/components/settings/tabs/dashboard/CalendarDisplayTab.vue";
import PluginDisplayTab from "@/components/settings/tabs/dashboard/PluginDisplayTab.vue";
import { useWebServicesStore } from "@/stores/webServices";

describe("dashboard display settings tabs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const webServicesStore = useWebServicesStore();
    vi.spyOn(webServicesStore, "fetchServices").mockResolvedValue({ services: [] });
  });

  it("exposes dashboard layout controls with stable ids", () => {
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: {} },
    });

    expect(wrapper.find("#display-orientation").exists()).toBe(true);
    expect(wrapper.find("#add-region-screen-home").exists()).toBe(true);
    expect(wrapper.find("#region-size-region-1").exists()).toBe(true);
    expect(wrapper.find("#region-component-region-1").exists()).toBe(true);
    expect(wrapper.find(".screen-stack").exists()).toBe(true);
    expect(wrapper.find(".screen-card").exists()).toBe(true);
    expect(wrapper.find(".screen-preview").exists()).toBe(true);
    expect(wrapper.find("#side-view-position").exists()).toBe(false);
  });

  it("orients rendered screen cards with the configured display layout", () => {
    const landscapeWrapper = mount(DashboardLayoutTab, {
      props: { config: { orientation: "landscape" } },
    });
    const portraitWrapper = mount(DashboardLayoutTab, {
      props: { config: { orientation: "portrait" } },
    });

    expect(landscapeWrapper.find(".screen-stack-landscape").exists()).toBe(true);
    expect(portraitWrapper.find(".screen-stack-portrait").exists()).toBe(true);
  });

  it("emits clamped region size updates from the layout tab", async () => {
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: { calendarSplit: 70 } },
    });

    await wrapper.find("#region-size-region-1").setValue("95");
    await wrapper.find("#region-size-region-1").trigger("change");

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    const screen = emitted.dashboardScreens.screens[0];
    expect(screen.layout.regions).toEqual([
      { id: "region-1", kind: "calendar", serviceId: null, size: 90, split: null },
      { id: "region-2", kind: "photos", serviceId: null, size: 10, split: null },
    ]);
  });

  it("removes a region and renormalizes the layout", async () => {
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: {} },
    });

    await wrapper.find('[aria-label="Delete Region 2"]').trigger("click");

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    const screen = emitted.dashboardScreens.screens[0];
    expect(screen.layout.regions).toEqual([
      { id: "region-1", kind: "calendar", serviceId: null, size: 100, split: null },
    ]);
  });

  it("adds a region via the + Region button", async () => {
    const wrapper = mount(DashboardLayoutTab, {
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
    const wrapper = mount(DashboardLayoutTab, {
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
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: {} },
    });

    await wrapper.find(".screen-add").trigger("click");

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    expect(emitted.dashboardScreens.screens).toHaveLength(2);
    expect(emitted.dashboardScreens.activeScreenId).toBe(emitted.dashboardScreens.screens[1].id);
  });

  it("renders draggable preview handles between regions", () => {
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: {} },
    });

    expect(wrapper.find(".preview-resizer").exists()).toBe(true);
  });

  it("sets the primary region from the preview radio", async () => {
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: {} },
    });

    await wrapper.find("#region-primary-region-2").setValue(true);

    const emitted = wrapper.emitted("update:config").at(-1)[0];
    expect(emitted.dashboardScreens.screens[0].activeRegionId).toBe("region-2");
  });

  it("renders week start options in the calendar display tab", () => {
    const wrapper = mount(CalendarDisplayTab, {
      props: { config: {} },
    });

    const options = wrapper
      .find("#week-start-day")
      .findAll("option")
      .map(option => option.text());

    expect(wrapper.find("#week-start-day").element.value).toBe("1");
    expect(options).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });

  it("emits week start day updates from the calendar display tab", async () => {
    const wrapper = mount(CalendarDisplayTab, {
      props: { config: { weekStartDay: 1 } },
    });

    await wrapper.find("#week-start-day").setValue("6");
    await wrapper.find("#week-start-day").trigger("change");

    expect(wrapper.emitted("update:config").at(-1)[0]).toEqual({
      weekStartDay: 6,
    });
  });

  it("exposes plugin display controls with stable ids", () => {
    const wrapper = mount(PluginDisplayTab, {
      props: { config: {} },
    });

    expect(wrapper.find("#meal-plan-card-size").exists()).toBe(true);
  });
});
