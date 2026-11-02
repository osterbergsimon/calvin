/**
 * The clock bar loads plugin statusbar renderers only when a plugin actually
 * declares one (calvin-0fm6). The wrapper itself stays in the initial graph:
 * it owns the services fetch and the progress light, but the schema renderer
 * set is a separate async chunk.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";
import PluginStatusbarItems from "@/components/PluginStatusbarItems.vue";
import { useWebServicesStore } from "@/stores/webServices";

vi.mock("@/composables/useSchemaData", () => ({
  useSchemaData: () => ({ data: ref(null) }),
}));

let pinia;

const mountItems = () =>
  mount(PluginStatusbarItems, {
    global: { plugins: [pinia] },
  });

const settle = async () => {
  await nextTick();
  await vi.dynamicImportSettled();
  await flushPromises();
  await nextTick();
};

describe("PluginStatusbarItems lazy renderer", () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const store = useWebServicesStore();
    vi.spyOn(store, "fetchServices").mockResolvedValue();
  });

  it("renders nothing when no service declares a statusbar schema", async () => {
    const store = useWebServicesStore();
    store.services = [{ id: "plain", name: "Plain", statusbar_schema: null }];

    const wrapper = mountItems();
    await settle();

    expect(wrapper.find(".schema-renderer__body").exists()).toBe(false);
    wrapper.unmount();
  });

  it("loads the plugin renderer once a statusbar plugin exists", async () => {
    const store = useWebServicesStore();
    store.services = [
      {
        id: "weather",
        name: "Weather",
        statusbar_schema: { kind: "status" },
        config: {},
      },
    ];

    const wrapper = mountItems();
    await settle();

    expect(wrapper.find(".schema-renderer__body").exists()).toBe(true);
    wrapper.unmount();
  });

  it("honours a plugin that hides itself from the statusbar", async () => {
    const store = useWebServicesStore();
    store.services = [
      {
        id: "weather",
        name: "Weather",
        statusbar_schema: { kind: "status" },
        config: { show_in_statusbar: "false" },
      },
    ];

    const wrapper = mountItems();
    await settle();

    expect(wrapper.find(".schema-renderer__body").exists()).toBe(false);
    wrapper.unmount();
  });
});
