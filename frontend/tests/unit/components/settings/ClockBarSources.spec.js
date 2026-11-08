import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const pluginsRef = ref([]);
const instancesRef = ref({});
const mockLoadPlugins = vi.fn().mockResolvedValue(undefined);
const route = { query: {} };
const openAddButton = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => route,
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
  methods: { open: openAddButton },
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
    route.query = {};
    vi.clearAllMocks();
  });

  it("lists only sources whose plugin has a clock-bar tile and no page", async () => {
    instancesRef.value = { weather: [{ id: "w1", name: "Outside", config: {} }] };
    const w = await mountSection();

    expect(w.find(".sl-row").text()).toContain("Outside");
    expect(w.find(".sl-row").text()).toContain("In the clock bar");
  });

  it("also lists sources of a plugin that has both a page and a clock-bar tile (calvin-shsj)", async () => {
    pluginsRef.value = [
      weather,
      {
        id: "sl_departures",
        name: "SL departures",
        type: "service",
        enabled: true,
        display_schema: { kind: "item-list" },
        statusbar_schema: { kind: "status" },
      },
      { id: "mealie", name: "Mealie", type: "service", enabled: true, display_schema: {} },
    ];
    instancesRef.value = {
      sl_departures: [{ id: "sl1", name: "Home stop", config: {} }],
      mealie: [{ id: "m1", name: "Menu", config: {} }],
    };
    const w = await mountSection();

    const text = w.findAll(".sl-row").map(r => r.text());
    expect(text).toHaveLength(1);
    expect(text[0]).toContain("Home stop");
  });

  describe("Remove on a source that also has a page (calvin-shsj)", () => {
    const departures = {
      id: "sl_departures",
      name: "SL departures",
      type: "service",
      enabled: true,
      display_schema: { kind: "item-list" },
      statusbar_schema: { kind: "status" },
    };
    const firstRow = w => w.findComponent({ name: "SourceList" }).props("rows")[0];

    beforeEach(() => {
      pluginsRef.value = [weather, departures];
      pluginsApi.updatePluginInstance.mockResolvedValue({});
    });

    it("only takes the tile off the clock bar; the instance and its page stay", async () => {
      instancesRef.value = {
        sl_departures: [{ id: "sl1", name: "Home stop", enabled: true, config: { stop: "A" } }],
      };
      const w = await mountSection();
      const list = w.findComponent({ name: "SourceList" });

      expect(list.props("removeMessage")(firstRow(w))).toContain("page stays");
      list.vm.$emit("remove", firstRow(w));
      await flushPromises();

      expect(pluginsApi.deletePluginInstance).not.toHaveBeenCalled();
      expect(pluginsApi.updatePluginInstance).toHaveBeenCalledWith("sl1", {
        name: "Home stop",
        enabled: true,
        plugin_id: "sl_departures",
        config: { stop: "A", show_in_statusbar: false },
      });
    });

    it("still deletes a clock-bar-only source", async () => {
      instancesRef.value = { weather: [{ id: "w1", name: "Outside", config: {} }] };
      const w = await mountSection();
      const list = w.findComponent({ name: "SourceList" });

      expect(list.props("removeMessage")(firstRow(w))).toContain("Its tile leaves");
      list.vm.$emit("remove", firstRow(w));
      await flushPromises();

      expect(pluginsApi.deletePluginInstance).toHaveBeenCalledWith("w1");
    });
  });

  it("opens the add flow when Clock bar items links here to add the first tile", async () => {
    route.query = { setting: "content-clock-bar", add: "clock" };
    await mountSection();

    expect(openAddButton).toHaveBeenCalled();
  });

  it("does not open the add flow on a normal visit", async () => {
    await mountSection();

    expect(openAddButton).not.toHaveBeenCalled();
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
