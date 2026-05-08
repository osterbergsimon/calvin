import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DashboardPanel from "@/components/DashboardPanel.vue";
import { useConfigStore } from "@/stores/config";

describe("DashboardPanel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders header title, subtitle, actions, and body when UI is visible", () => {
    const configStore = useConfigStore();
    configStore.showUI = true;

    const wrapper = mount(DashboardPanel, {
      props: { title: "Weather", subtitle: "Service 1 of 2" },
      slots: {
        actions: '<button class="dashboard-panel__icon-button">Next</button>',
        default: '<div class="panel-body-stub">Body</div>',
      },
    });

    expect(wrapper.find(".dashboard-panel__header").exists()).toBe(true);
    expect(wrapper.find(".dashboard-panel__title").text()).toBe("Weather");
    expect(wrapper.find(".dashboard-panel__subtitle").text()).toBe("Service 1 of 2");
    expect(wrapper.find(".dashboard-panel__actions button").exists()).toBe(true);
    expect(wrapper.find(".panel-body-stub").text()).toBe("Body");
  });

  it("hides the shared header when dashboard UI is hidden", () => {
    const configStore = useConfigStore();
    configStore.showUI = false;

    const wrapper = mount(DashboardPanel, {
      props: { title: "Calendar" },
      slots: { default: "<div>Body remains</div>" },
    });

    expect(wrapper.find(".dashboard-panel__header").exists()).toBe(false);
    expect(wrapper.text()).toContain("Body remains");
  });

  it("applies panel variants to the root shell", () => {
    const configStore = useConfigStore();
    configStore.showUI = true;

    const wrapper = mount(DashboardPanel, {
      props: { title: "Photos", variant: "media" },
    });

    expect(wrapper.classes()).toContain("dashboard-panel--media");
  });
});
