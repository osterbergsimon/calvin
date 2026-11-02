/**
 * Dashboard › Clock bar items (§3.5, decision C).
 *
 * The list stays the show/hide and order control; its empty state gained an
 * "Add clock bar info" button that opens the Content provider picker for that
 * kind. The global "Show plugin info" row moved out of Clock in the same phase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const services = ref([]);
const fetchServices = vi.fn().mockResolvedValue(undefined);
const routerPush = vi.fn();

vi.mock("@/stores/webServices", () => ({
  useWebServicesStore: () => ({
    get services() {
      return services.value;
    },
    fetchServices,
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/services/pluginsApi", () => ({
  updatePluginInstance: vi.fn(),
}));

import ClockBarItemsTab from "@/components/settings/tabs/clock-bar/ClockBarItemsTab.vue";

const mountTab = async () => {
  const w = mount(ClockBarItemsTab, {
    global: { stubs: { SchemaStatusbarItem: true } },
  });
  await flushPromises();
  return w;
};

describe("Clock bar items empty state", () => {
  beforeEach(() => {
    services.value = [];
    fetchServices.mockClear();
    routerPush.mockClear();
  });

  it("says there is no clock bar info yet and offers to add it", async () => {
    const w = await mountTab();

    const empty = w.find(".empty-state");
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain("No clock bar info yet.");
    expect(empty.text()).not.toContain("No installed plugins expose a clock bar tile.");
    expect(empty.find("button").text()).toBe("Add clock bar info");
  });

  it("opens the Content clock bar picker when Add clock bar info is clicked", async () => {
    const w = await mountTab();

    await w.find(".empty-state button").trigger("click");

    expect(routerPush).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "content-clock-bar", add: "clock" },
    });
  });

  it("still lists tiles once a clock-capable service exists", async () => {
    services.value = [
      { id: "w1", name: "Outside", plugin_name: "Weather", statusbar_schema: { kind: "status" } },
    ];
    const w = await mountTab();

    expect(w.find(".empty-state").exists()).toBe(false);
    expect(w.text()).toContain("Outside");
  });
});
