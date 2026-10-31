import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, enableAutoUnmount, flushPromises } from "@vue/test-utils";

const replace = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({ useRouter: () => ({ replace }) }));

import RegionInspector from "@/components/settings/shared/regions/RegionInspector.vue";
import { buildComponentOptions } from "@/utils/componentPicker";

enableAutoUnmount(afterEach);

const defaultMatchMedia = window.matchMedia;

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
    attachTo: document.body,
  });

const makeServices = count =>
  Array.from({ length: count }, (_, index) => ({
    id: `iframe-${index}`,
    name: `Service ${index}`,
    plugin_name: "Iframe",
  }));

const setCoarsePointer = () => {
  window.matchMedia = vi.fn(query => ({
    matches: /\(any-pointer:\s*coarse\)/.test(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const openPicker = async w => {
  await w.get(".picker-trigger").trigger("click");
  await flushPromises();
};

afterEach(() => {
  window.matchMedia = defaultMatchMedia;
  document.body.innerHTML = "";
});

describe("RegionInspector 'Shows' picker without services (F4)", () => {
  beforeEach(() => {
    replace.mockClear();
    localStorage.removeItem("calvin-touch-controls");
  });

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

  it("filters the menu from the search field when the list is long", async () => {
    const w = mountWith([
      ...makeServices(8),
      { id: "iframe-kitchen", name: "Kitchen", plugin_name: "Iframe" },
    ]);
    await openPicker(w);
    await w.get(".picker-search input").setValue("kitchen");
    expect(w.findAll('[role="menuitem"] .menu__label').map(item => item.text())).toEqual([
      "Kitchen",
    ]);
    expect(w.text()).not.toContain("No matches");
  });
});

describe("RegionInspector 'Shows' picker filter visibility", () => {
  beforeEach(() => {
    localStorage.removeItem("calvin-touch-controls");
  });

  it("hides the filter at 8 options", async () => {
    // Calendar + Photos + six services = eight rows.
    const w = mountWith(makeServices(6));
    await openPicker(w);
    expect(w.find(".picker-search").exists()).toBe(false);
    expect(w.findAll('[role="menuitem"]')).toHaveLength(8);
  });

  it("shows a field named Search once there are more than 8 options", async () => {
    const w = mountWith(makeServices(7));
    await openPicker(w);
    const field = w.find(".picker-search");
    expect(field.exists()).toBe(true);
    expect(field.find(".text-field__label").text()).toBe("Search");
    expect(w.findAll('[role="menuitem"]')).toHaveLength(9);
  });
});

describe("RegionInspector 'Shows' picker on touch", () => {
  beforeEach(() => {
    localStorage.removeItem("calvin-touch-controls");
  });

  it("focuses the first option instead of the filter on a touch screen", async () => {
    setCoarsePointer();
    const w = mountWith(makeServices(7));
    await openPicker(w);
    const options = w.findAll('[role="menuitem"]');
    const field = w.find(".picker-search input");
    expect(field.exists()).toBe(true);
    expect(document.activeElement).toBe(options[0].element);
    expect(document.activeElement).not.toBe(field.element);
  });

  it("still focuses the filter on a pointer screen", async () => {
    const w = mountWith(makeServices(7));
    await openPicker(w);
    expect(document.activeElement).toBe(w.find(".picker-search input").element);
  });
});
