import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import WebServiceViewer from "@/components/WebServiceViewer.vue";
import { useConfigStore } from "@/stores/config";
import { useWebServicesStore } from "@/stores/webServices";
import { useModeStore } from "@/stores/mode";
import { _resetSetupPromptForTests } from "@/composables/useSetupPrompt";

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(() => Promise.resolve("http://192.168.1.20:8000")),
  settingsLink: (base, id) => `${base}/settings?setting=${id}`,
}));

const mountViewer = async props => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      { path: "/settings", component: { template: "<div/>" } },
    ],
  });
  router.push("/");
  await router.isReady();
  const wrapper = mount(WebServiceViewer, {
    props,
    global: { plugins: [router] },
  });
  await flushPromises();
  return { wrapper, router };
};

describe("WebServiceViewer empty state (CLV-20)", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetSetupPromptForTests();
    useConfigStore().touchControls = "off";
    const store = useWebServicesStore();
    store.services = [];
    store.loading = false;
    store.error = null;
    store.stale = false;
    vi.spyOn(store, "fetchServices").mockResolvedValue();
  });

  it("uses the CLV-17 names and deep-links to Web pages & services", async () => {
    const { wrapper, router } = await mountViewer({ regionId: "region-1" });

    expect(wrapper.text()).toContain("No web pages yet");
    const action = wrapper.find('[data-test="empty-state-action"]');
    expect(action.text()).toBe("Add a web page");

    await action.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/settings");
    expect(router.currentRoute.value.query.setting).toBe("content-services");
    expect(useModeStore().currentMode).toBe(useModeStore().MODES.SETTINGS);
  });

  it("does not report setup-empty when the services fetch failed", async () => {
    const store = useWebServicesStore();
    store.error = "Network Error";
    const { wrapper } = await mountViewer({ regionId: "region-1" });

    expect(wrapper.text()).toContain("No web pages yet");
    // No QR on this screen: the gap is an outage, not missing setup.
    expect(wrapper.find('[data-test="phone-setup"]').exists()).toBe(false);
  });
});
