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
        actions: '<button class="ctl">Next</button>',
        default: '<div class="panel-body-stub">Body</div>',
      },
    });

    expect(wrapper.find(".dashboard-panel__header").exists()).toBe(true);
    expect(wrapper.find(".dashboard-panel__title").text()).toBe("Weather");
    expect(wrapper.find(".dashboard-panel__subtitle").text()).toBe("Service 1 of 2");
    expect(wrapper.find(".dashboard-panel__actions button").exists()).toBe(true);
    expect(wrapper.find(".panel-body-stub").text()).toBe("Body");
  });

  it("hides the title when show-title is false but still renders actions", () => {
    const configStore = useConfigStore();
    configStore.showUI = true;

    const wrapper = mount(DashboardPanel, {
      props: { title: "Calendar", showTitle: false },
      slots: { actions: '<button class="ctl">x</button>' },
    });

    expect(wrapper.find(".dashboard-panel__title-group").exists()).toBe(false);
    expect(wrapper.find(".dashboard-panel__title").exists()).toBe(false);
    expect(wrapper.find(".dashboard-panel__actions .ctl").exists()).toBe(true);
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

const mountPanel = props => {
  const store = useConfigStore();
  store.showUI = true;
  return mount(DashboardPanel, {
    props: { title: "Kalender", ...props },
    slots: { default: "<p>body</p>", actions: "<button>x</button>" },
  });
};

describe("DashboardPanel focus-light", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("is neutral by default (no focus, no dim)", () => {
    const w = mountPanel();
    const panel = w.find(".focus-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.classes()).not.toContain("is-focused");
    expect(panel.classes()).not.toContain("is-dim");
  });

  it("lights up when focused", () => {
    const w = mountPanel({ focused: true });
    expect(w.find(".focus-panel").classes()).toContain("is-focused");
  });

  it("dims when dim=true and not focused", () => {
    const w = mountPanel({ dim: true });
    expect(w.find(".focus-panel").classes()).toContain("is-dim");
  });

  it("still renders title and actions slot", () => {
    const w = mountPanel();
    expect(w.find(".dashboard-panel__title").text()).toBe("Kalender");
    expect(w.find(".dashboard-panel__actions").exists()).toBe(true);
  });
});
