import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const replace = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({ useRouter: () => ({ replace }) }));

import RegionInspector from "@/components/settings/shared/regions/RegionInspector.vue";
import { buildComponentOptions } from "@/utils/componentPicker";

const mountWith = services =>
  mount(RegionInspector, {
    props: {
      region: { id: "r1", kind: "calendar", instanceIds: [] },
      screen: { name: "Home", layout: { regions: [{ id: "r1" }] } },
      layoutDir: "row",
      componentOptions: buildComponentOptions(services),
      sourceOptions: [],
      context: null,
    },
    global: { stubs: { SegmentedControl: true, ToggleSwitch: true, NumberStepper: true } },
  });

const openPicker = async w => w.get(".picker-trigger").trigger("click");

describe("RegionInspector 'Shows' picker without services (F4)", () => {
  beforeEach(() => replace.mockClear());

  it("offers 'Add a web service' when no service exists", async () => {
    const w = mountWith([]);
    await openPicker(w);
    expect(w.find('[data-test="picker-add-service"]').exists()).toBe(true);
  });

  it("the entry deep-links to the Service plugins tab", async () => {
    const w = mountWith([]);
    await openPicker(w);
    await w.get('[data-test="picker-add-service"]').trigger("click");
    expect(replace).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "plugins-services" },
    });
  });

  it("hides the entry once a service exists", async () => {
    const w = mountWith([{ id: "iframe-1", name: "Home Assistant", plugin_name: "Iframe" }]);
    await openPicker(w);
    expect(w.find('[data-test="picker-add-service"]').exists()).toBe(false);
    expect(w.text()).toContain("Home Assistant");
  });
});
