import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import ServiceViewer from "@/components/service/ServiceViewer.vue";
import { useConfigStore } from "@/stores/config";

const schemaData = ref(null);

vi.mock("@/composables/useSchemaData", () => ({
  useSchemaData: () => ({ data: schemaData }),
}));

describe("ServiceViewer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    schemaData.value = null;
    useConfigStore().showUI = true;
  });

  const mountViewer = service =>
    mount(ServiceViewer, {
      props: { service },
      global: {
        stubs: {
          SchemaRenderer: {
            props: ["schema", "data", "pluginId"],
            template:
              '<div class="schema-renderer-stub" :data-plugin-id="pluginId">{{ schema.kind }}</div>',
          },
        },
      },
    });

  it("resolves panel title from title_path before literal title and service name", () => {
    schemaData.value = { location: "Stockholm" };

    const wrapper = mountViewer({
      id: "weather",
      name: "Fallback Service",
      display_schema: {
        kind: "weather-forecast",
        title_path: "$.location",
        title: "Literal Weather",
      },
    });

    expect(wrapper.find(".dashboard-panel__title").text()).toBe("Stockholm");
  });

  it("falls back to literal title before service name", () => {
    const wrapper = mountViewer({
      id: "service",
      name: "Service Name",
      display_schema: { kind: "status-tile", title: "Literal Title" },
    });

    expect(wrapper.find(".dashboard-panel__title").text()).toBe("Literal Title");
  });

  it("ignores object title_path values instead of rendering them", () => {
    schemaData.value = { location: { name: "Stockholm" } };

    const wrapper = mountViewer({
      id: "weather",
      name: "Fallback Service",
      display_schema: {
        kind: "weather-forecast",
        title_path: "$.location",
        title: "Literal Weather",
      },
    });

    expect(wrapper.find(".dashboard-panel__title").text()).toBe("Literal Weather");
  });

  it("falls back to service name when schema title fields are missing", () => {
    const wrapper = mountViewer({
      id: "service",
      name: "Service Name",
      display_schema: { kind: "status-tile" },
    });

    expect(wrapper.find(".dashboard-panel__title").text()).toBe("Service Name");
  });

  it("threads the focus state to the panel so a focused service region glows (calvin-ltx)", () => {
    const svc = { id: "s", name: "S", display_schema: { kind: "status-tile" } };
    expect(mountViewer(svc).find(".focus-panel.is-focused").exists()).toBe(false);

    const focused = mount(ServiceViewer, {
      props: { focused: true, service: svc },
      global: { stubs: { SchemaRenderer: { template: '<div class="schema-renderer-stub" />' } } },
    });
    expect(focused.find(".focus-panel.is-focused").exists()).toBe(true);
  });

  it("can hide the shared panel header for fullscreen service rendering", () => {
    const wrapper = mount(ServiceViewer, {
      props: {
        headerVisible: false,
        service: {
          id: "service",
          name: "Service Name",
          display_schema: { kind: "status-tile" },
        },
      },
      global: {
        stubs: {
          SchemaRenderer: {
            template: '<div class="schema-renderer-stub" />',
          },
        },
      },
    });

    expect(wrapper.find(".dashboard-panel__header").exists()).toBe(false);
  });
});
