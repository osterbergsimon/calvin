import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TabNavigation from "@/components/settings/shared/TabNavigation.vue";

const tabs = [
  { id: "display", label: "Display", icon: "D" },
  { id: "ui", label: "UI", icon: "U" },
  { id: "keyboard", label: "Keyboard", icon: "K", badge: 2 },
];

describe("TabNavigation", () => {
  it("renders accessible tabs", () => {
    const wrapper = mount(TabNavigation, {
      props: {
        tabs,
        activeTab: "ui",
      },
    });

    expect(wrapper.attributes("role")).toBe("tablist");

    const tabButtons = wrapper.findAll('[role="tab"]');
    expect(tabButtons).toHaveLength(3);
    expect(tabButtons[1].attributes("aria-selected")).toBe("true");
    expect(tabButtons[1].attributes("tabindex")).toBe("0");
    expect(tabButtons[0].attributes("aria-selected")).toBe("false");
    expect(tabButtons[0].attributes("tabindex")).toBe("-1");
    expect(wrapper.find(".tab-badge").text()).toBe("2");
  });

  it("emits tab-change when a different tab is clicked", async () => {
    const wrapper = mount(TabNavigation, {
      props: {
        tabs,
        activeTab: "display",
      },
    });

    await wrapper.findAll('[role="tab"]')[1].trigger("click");

    expect(wrapper.emitted("tab-change")).toEqual([["ui"]]);
  });

  it("emits next tab when using arrow navigation", async () => {
    const wrapper = mount(TabNavigation, {
      props: {
        tabs,
        activeTab: "display",
      },
      attachTo: document.body,
    });

    await wrapper.trigger("keydown", { key: "ArrowRight" });

    expect(wrapper.emitted("tab-change")).toEqual([["ui"]]);
    wrapper.unmount();
  });

  it("wraps keyboard navigation from first to last tab", async () => {
    const wrapper = mount(TabNavigation, {
      props: {
        tabs,
        activeTab: "display",
      },
    });

    await wrapper.trigger("keydown", { key: "ArrowLeft" });

    expect(wrapper.emitted("tab-change")).toEqual([["keyboard"]]);
  });
});
