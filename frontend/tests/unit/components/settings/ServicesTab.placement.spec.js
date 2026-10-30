import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const pluginsRef = ref([]);
const instancesRef = ref({});
const mockLoadPlugins = vi.fn().mockResolvedValue(undefined);
const mockPush = vi.fn();
const mockRequestPlacement = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    pluginInstances: instancesRef,
    loadingPlugins: ref(false),
    loadPlugins: mockLoadPlugins,
    updateInstanceOrder: vi.fn(),
  }),
}));

vi.mock("@/composables/usePlacementRequest", () => ({
  usePlacementRequest: () => ({ requestPlacement: mockRequestPlacement }),
}));

vi.mock("@/services/pluginsApi", () => ({
  updatePluginInstance: vi.fn(),
  deletePluginInstance: vi.fn(),
}));

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

const region = (over = {}) => ({ size: 100, instanceIds: [], ...over });

const page = (id, name, regions) => ({
  id,
  name,
  layout: { regions },
  activeRegionId: regions[0].id,
});

const configWith = screens => ({
  dashboardScreens: { version: 2, activeScreenId: screens[0].id, screens },
});

const mountTab = async config => {
  const w = mount(ServicesTab, {
    props: { config },
    global: { stubs: { AddSourceButton: true, InstanceModal: true } },
  });
  await flushPromises();
  return w;
};

describe("Service placement lines", () => {
  beforeEach(() => {
    pluginsRef.value = [service()];
    instancesRef.value = { mealie: [instance()] };
    vi.clearAllMocks();
  });

  it("names the pages a source is placed on", async () => {
    const config = configWith([
      page("home", "Home", [
        region({ id: "r1", kind: "service", serviceId: "mealie-1", instanceIds: ["mealie-1"] }),
      ]),
      page("week", "Week", [
        region({ id: "r2", kind: "service", serviceId: "mealie-1", instanceIds: ["mealie-1"] }),
      ]),
    ]);
    const w = await mountTab(config);

    expect(w.find(".sl-row").text()).toContain("On Home, Week");
  });

  it("offers Put it on a page for an unplaced source", async () => {
    const config = configWith([page("home", "Home", [region({ id: "r1", kind: "calendar" })])]);
    const w = await mountTab(config);

    expect(w.find(".svc-unplaced").text()).toBe("Not on any page yet");
    const put = w.findAll("button").find(b => b.text() === "Put it on a page");
    await put.trigger("click");

    expect(mockRequestPlacement).toHaveBeenCalledWith({ serviceId: "mealie-1", name: "Recipes" });
    expect(mockPush).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "dashboard-regions" },
    });
  });

  it("says a service with a tile is also in the clock bar", async () => {
    pluginsRef.value = [service({ statusbar_schema: { kind: "status" } })];
    const w = await mountTab(configWith([page("home", "Home", [region({ id: "r1" })])]));
    expect(w.find(".sl-row").text()).toContain("in the clock bar");
  });

  it("warns with the page names when removing a placed source", async () => {
    const config = configWith([
      page("home", "Home", [
        region({ id: "r1", kind: "service", serviceId: "mealie-1", instanceIds: ["mealie-1"] }),
      ]),
      page("week", "Week", [
        region({ id: "r2", kind: "service", serviceId: "mealie-1", instanceIds: ["mealie-1"] }),
      ]),
    ]);
    const w = await mountTab(config);

    await w.find(".sl-more-btn").trigger("click");
    await w.find(".sl-menu-item").trigger("click");
    await flushPromises();

    expect(w.findComponent({ name: "ConfirmModal" }).props("message")).toBe(
      "Remove Recipes? It's on Home, Week; those regions become empty."
    );
  });
});
