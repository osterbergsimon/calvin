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
    global: {
      stubs: { SegmentedControl: true, ToggleSwitch: true, NumberStepper: true, teleport: true },
    },
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

  it("shows the service's plugin name as the option's meta line", async () => {
    const w = mountWith([{ id: "iframe-1", name: "Home Assistant", plugin_name: "Iframe" }]);
    await openPicker(w);
    const option = w
      .findAll('[role="menuitem"]')
      .find(item => item.text().includes("Home Assistant"));
    expect(option.find(".menu__label").text()).toBe("Home Assistant");
    expect(option.find(".menu__meta").text()).toBe("Iframe");
  });

  it("chooses a component through the menu", async () => {
    const w = mountWith([{ id: "iframe-1", name: "Home Assistant", plugin_name: "Iframe" }]);
    await openPicker(w);
    const option = w
      .findAll('[role="menuitem"]')
      .find(item => item.text().includes("Home Assistant"));
    await option.trigger("click");
    expect(w.emitted("set-component")[0][0]).toMatchObject({ label: "Home Assistant" });
    expect(w.find(".popover__panel").exists()).toBe(false);
  });

  it("filters the menu from the search field", async () => {
    const w = mountWith([
      { id: "iframe-1", name: "Home Assistant", plugin_name: "Iframe" },
      { id: "iframe-2", name: "Kitchen", plugin_name: "Iframe" },
    ]);
    await openPicker(w);
    await w.get(".picker-search input").setValue("kitchen");
    expect(w.findAll('[role="menuitem"] .menu__label').map(item => item.text())).toEqual([
      "Kitchen",
    ]);
    expect(w.text()).not.toContain("No matches");
  });
});
