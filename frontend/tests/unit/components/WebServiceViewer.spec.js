import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WebServiceViewer from "@/components/WebServiceViewer.vue";
import { useConfigStore } from "@/stores/config";
import { useWebServicesStore } from "@/stores/webServices";

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
            props: ["service"],
            template: '<div class="service-viewer-stub">{{ service.name }}</div>',
          },
        },
      },
    });
  };

  it("renders the global current service when no service id is provided", () => {
    const wrapper = mountViewer({ isFullscreen: false });

    expect(wrapper.find(".viewer-header h2").text()).toBe("Weather");
    expect(wrapper.find(".service-viewer-stub").text()).toBe("Weather");
    expect(wrapper.find(".service-selector").exists()).toBe(true);
  });

  it("renders a specific service and disables local navigation when service id is provided", () => {
    const wrapper = mountViewer({ isFullscreen: false, serviceId: "meals" });

    expect(wrapper.find(".viewer-header h2").text()).toBe("Meals");
    expect(wrapper.find(".service-viewer-stub").text()).toBe("Meals");
    expect(wrapper.find(".service-selector").exists()).toBe(false);
    expect(wrapper.findAll(".btn-nav")).toHaveLength(0);
  });

  it("shows an unavailable state for a missing explicit service id", () => {
    const wrapper = mountViewer({ isFullscreen: false, serviceId: "deleted-service" });

    expect(wrapper.text()).toContain("Selected service is unavailable");
    expect(wrapper.text()).toContain("Choose another service in Settings");
    expect(wrapper.find(".service-viewer-stub").exists()).toBe(false);
  });
});
