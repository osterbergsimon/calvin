import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const pluginsRef = ref([]);
const instancesRef = ref({});
const mockLoadPlugins = vi.fn().mockResolvedValue(undefined);

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    pluginInstances: instancesRef,
    loadingPlugins: ref(false),
    loadPlugins: mockLoadPlugins,
  }),
}));

vi.mock("@/services/pluginsApi", () => ({
  updatePluginInstance: vi.fn(),
  deletePluginInstance: vi.fn(),
}));

import * as pluginsApi from "@/services/pluginsApi";
import ClockBarSources from "@/components/settings/tabs/content/ClockBarSources.vue";

const weather = {
  id: "weather",
  name: "Weather",
  type: "service",
  enabled: true,
  display_schema: null,
  statusbar_schema: { kind: "status" },
};

const addStub = {
  name: "AddSourceButton",
  emits: ["saved"],
  template: "<div />",
};

const mountSection = async () => {
  const w = mount(ClockBarSources, {
    global: { stubs: { AddSourceButton: addStub, InstanceModal: true } },
  });
  await flushPromises();
  return w;
};

describe("Clock bar info section", () => {
  beforeEach(() => {
    pluginsRef.value = [weather];
    instancesRef.value = {};
    vi.clearAllMocks();
  });

  it("lists only sources whose plugin has a clock-bar tile and no page", async () => {
    instancesRef.value = { weather: [{ id: "w1", name: "Outside", config: {} }] };
    const w = await mountSection();

    expect(w.find(".sl-row").text()).toContain("Outside");
    expect(w.find(".sl-row").text()).toContain("In the clock bar");
  });

  it("switches the new source's tile on when it is added", async () => {
    instancesRef.value = {
      weather: [
        {
          id: "w2",
          name: "Outside",
          enabled: true,
          config: { location: "Malmo" },
        },
      ],
    };
    pluginsApi.updatePluginInstance.mockResolvedValue({});
    const w = await mountSection();

    w.findComponent({ name: "AddSourceButton" }).vm.$emit("saved", {
      pluginId: "weather",
      instanceName: "Outside",
    });
    await flushPromises();

    expect(pluginsApi.updatePluginInstance).toHaveBeenCalledWith("w2", {
      name: "Outside",
      enabled: true,
      plugin_id: "weather",
      config: { location: "Malmo", show_in_statusbar: true },
    });
  });
});
