import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WebServiceViewer from "@/components/WebServiceViewer.vue";
import { useConfigStore } from "@/stores/config";
import { useWebServicesStore } from "@/stores/webServices";
import { useModeStore } from "@/stores/mode";

// ---------------------------------------------------------------------------
// Helpers for the link-wiring tests (Task 8)
// ---------------------------------------------------------------------------
function setupLinkWiring(kind) {
  setActivePinia(createPinia());
  const store = useWebServicesStore();
  store.fetchServices = vi.fn().mockResolvedValue();
  store.services = [{ id: "mealie-1", name: "Mealie", display_schema: { kind }, config: {} }];
  return store;
}

describe("WebServiceViewer link wiring", () => {

  it("shows the tune control for a link-capable service region when focused", async () => {
    setupLinkWiring("card-grid");
    const w = mount(WebServiceViewer, {
      props: { serviceId: "mealie-1", regionId: "svc-1", view: { linkAction: "embed" }, focused: true },
      global: { stubs: { ServiceViewer: { template: "<div><slot name='actions' /></div>" } } },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "ServiceRegionViewOptions" }).exists()).toBe(true);
    w.unmount();
  });

  it("hides the tune control for a non-link-capable service (iframe)", async () => {
    setupLinkWiring("iframe");
    const w = mount(WebServiceViewer, {
      props: { serviceId: "mealie-1", regionId: "svc-1", view: {}, focused: true },
      global: { stubs: { ServiceViewer: { template: "<div><slot name='actions' /></div>" } } },
      attachTo: document.body,
    });
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "ServiceRegionViewOptions" }).exists()).toBe(false);
    w.unmount();
  });
});

describe("WebServiceViewer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  const mountViewer = props => {
    const configStore = useConfigStore();
    configStore.showUI = true;

    const webServicesStore = useWebServicesStore();
    webServicesStore.services = [
      {
        id: "weather",
        name: "Weather",
        enabled: true,
        display_schema: { kind: "status-tile", value: "Weather" },
      },
      {
        id: "meals",
        name: "Meals",
        enabled: true,
        display_schema: { kind: "status-tile", value: "Meals" },
      },
    ];
    webServicesStore.currentServiceIndex = 0;
    vi.spyOn(webServicesStore, "fetchServices").mockResolvedValue({
      services: webServicesStore.services,
    });

    return mount(WebServiceViewer, {
      props,
      global: {
        stubs: {
          ServiceViewer: {
            props: ["service", "subtitle"],
            template:
              '<div class="service-viewer-stub"><h2>{{ service.name }}</h2><p>{{ subtitle }}</p><slot name="actions" /></div>',
          },
        },
      },
    });
  };

  it("renders the cycling current service in fullscreen when no service id is provided", () => {
    const wrapper = mountViewer({ isFullscreen: true });

    expect(wrapper.find(".service-viewer-stub h2").text()).toBe("Weather");
  });

  it("shows an unavailable state for an embedded region without a service id", () => {
    const wrapper = mountViewer({ isFullscreen: false });

    expect(wrapper.text()).toContain("Selected service is unavailable");
    expect(wrapper.find(".service-viewer-stub").exists()).toBe(false);
  });

  it("renders a specific service and disables local navigation when service id is provided", () => {
    const wrapper = mountViewer({ isFullscreen: false, serviceId: "meals" });

    expect(wrapper.find(".service-viewer-stub h2").text()).toBe("Meals");
    expect(wrapper.find(".service-viewer-stub").text()).toContain("Meals");
    expect(wrapper.findAll(".dashboard-panel__icon-button")).toHaveLength(2);
  });

  it("passes service count and local navigation actions in fullscreen cycling mode", () => {
    const wrapper = mountViewer({ isFullscreen: true });

    expect(wrapper.find(".service-viewer-stub").text()).toContain("Service 1 of 2");
    expect(wrapper.findAll(".dashboard-panel__icon-button")).toHaveLength(2);
  });

  it("enters fullscreen carrying its own pinned service, not the globally current one", async () => {
    const modeStore = useModeStore();
    const enterSpy = vi.spyOn(modeStore, "enterFullscreen");
    // currentServiceIndex is 0 ("Weather") — the buggy path would fullscreen
    // that instead of the region's own "meals" service.
    const wrapper = mountViewer({ isFullscreen: false, serviceId: "meals" });

    await wrapper.get('[title="Enter Fullscreen"]').trigger("click");

    expect(enterSpy).toHaveBeenCalledWith(modeStore.MODES.WEB_SERVICES, { serviceId: "meals" });
  });

  it("shows an unavailable state for a missing explicit service id", () => {
    const wrapper = mountViewer({ isFullscreen: false, serviceId: "deleted-service" });

    expect(wrapper.text()).toContain("Selected service is unavailable");
    expect(wrapper.text()).toContain("Choose another service in Settings");
    expect(wrapper.find(".service-viewer-stub").exists()).toBe(false);
  });
});
