/** useClockBarVisible (CLV-48): decides when the floating pill takes over. */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, h } from "vue";
import { useClockBarVisible } from "@/composables/useClockBarVisible";
import { useConfigStore } from "@/stores/config";

const Probe = defineComponent({
  setup() {
    const visible = useClockBarVisible();
    return () => h("div", visible.value ? "bar" : "floating");
  },
});

const makeRouter = async path => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "dashboard", component: { template: "<div />" } },
      { path: "/settings", name: "settings", component: { template: "<div />" } },
    ],
  });
  router.push(path);
  await router.isReady();
  return router;
};

const mountProbe = async (path, configure) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  configure(useConfigStore());
  const router = await makeRouter(path);
  return mount(Probe, { global: { plugins: [pinia, router] } });
};

describe("useClockBarVisible", () => {
  it("is true on the dashboard when the clock bar is showing", async () => {
    const wrapper = await mountProbe("/", () => {});
    expect(wrapper.text()).toBe("bar");
  });

  it("is false when the controls are hidden and the bar is not kept", async () => {
    const wrapper = await mountProbe("/", configStore => {
      configStore.showUI = false;
      configStore.clockBarShowInKiosk = false;
    });
    expect(wrapper.text()).toBe("floating");
  });

  it("is true in kiosk mode when the bar is kept", async () => {
    const wrapper = await mountProbe("/", configStore => {
      configStore.showUI = false;
      configStore.clockBarShowInKiosk = true;
    });
    expect(wrapper.text()).toBe("bar");
  });

  it("is false on a page without a clock bar", async () => {
    const wrapper = await mountProbe("/settings", () => {});
    expect(wrapper.text()).toBe("floating");
  });
});
