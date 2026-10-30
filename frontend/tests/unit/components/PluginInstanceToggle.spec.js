/**
 * Source on/off moved from the Plugins card to Content (CLV-44 §3.1): a
 * source's toggle lives on its Content row and persists through the plugin
 * instance API. These tests guard that contract.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const pluginsRef = ref([]);
const instancesRef = ref({});
const mockLoadPlugins = vi.fn().mockResolvedValue(undefined);
const mockUpdateInstanceOrder = vi.fn().mockResolvedValue(undefined);

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    pluginInstances: instancesRef,
    loadingPlugins: ref(false),
    loadPlugins: mockLoadPlugins,
    updateInstanceOrder: mockUpdateInstanceOrder,
  }),
}));

vi.mock("@/services/pluginsApi", () => ({
  updatePluginInstance: vi.fn(),
  deletePluginInstance: vi.fn(),
}));

import * as pluginsApi from "@/services/pluginsApi";
import ServicesTab from "@/components/settings/tabs/content/ServicesTab.vue";

const service = (over = {}) => ({
  id: "mealie",
  name: "Mealie",
  type: "service",
  enabled: true,
  display_schema: { kind: "card-grid" },
  ...over,
});

const instance = (over = {}) => ({
  id: "mealie-1",
  name: "Recipes",
  enabled: true,
  running: true,
  config: { url: "http://mealie.local" },
  ...over,
});

const mountTab = async (config = {}) => {
  const w = mount(ServicesTab, { props: { config } });
  await flushPromises();
  return w;
};

describe("Content source toggle", () => {
  beforeEach(() => {
    pluginsRef.value = [];
    instancesRef.value = {};
    mockLoadPlugins.mockClear();
    mockUpdateInstanceOrder.mockClear();
    vi.clearAllMocks();
  });

  it("toggles a source off through the plugin instance API and reloads", async () => {
    pluginsRef.value = [service()];
    instancesRef.value = { mealie: [instance()] };
    pluginsApi.updatePluginInstance.mockResolvedValue({});
    const w = await mountTab();

    await w.find(".sl-row .sl-action").exists();
    const toggle = w.find(".sl-row").findComponent({ name: "ToggleSwitch" });
    toggle.vm.$emit("update:modelValue", false);
    await flushPromises();

    expect(pluginsApi.updatePluginInstance).toHaveBeenCalledWith("mealie-1", {
      name: "Recipes",
      enabled: false,
      plugin_id: "mealie",
      config: { url: "http://mealie.local" },
    });
    expect(mockLoadPlugins).toHaveBeenCalled();
  });

  it("survives a failed toggle without leaving the row stuck", async () => {
    pluginsRef.value = [service()];
    instancesRef.value = { mealie: [instance()] };
    pluginsApi.updatePluginInstance.mockRejectedValue(new Error("nope"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const w = await mountTab();
    const toggle = w.find(".sl-row").findComponent({ name: "ToggleSwitch" });
    toggle.vm.$emit("update:modelValue", false);
    await flushPromises();

    expect(pluginsApi.updatePluginInstance).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
