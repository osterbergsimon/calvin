import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DashboardLayoutTab from "@/components/settings/tabs/dashboard/DashboardLayoutTab.vue";
import CalendarDisplayTab from "@/components/settings/tabs/dashboard/CalendarDisplayTab.vue";
import PluginDisplayTab from "@/components/settings/tabs/dashboard/PluginDisplayTab.vue";

describe("dashboard display settings tabs", () => {
  it("exposes dashboard layout controls with stable ids", () => {
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: {} },
    });

    expect(wrapper.find("#display-orientation").exists()).toBe(true);
    expect(wrapper.find("#calendar-split").exists()).toBe(true);
    expect(wrapper.find("#side-view-position").exists()).toBe(true);
  });

  it("emits clamped calendar split updates from the layout tab", async () => {
    const wrapper = mount(DashboardLayoutTab, {
      props: { config: { calendarSplit: 70 } },
    });

    await wrapper.find("#calendar-split").setValue("95");
    await wrapper.find("#calendar-split").trigger("change");

    expect(wrapper.emitted("update:config").at(-1)[0]).toEqual({
      calendarSplit: 90,
    });
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
