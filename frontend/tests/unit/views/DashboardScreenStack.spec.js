/**
 * The screen stack (utils/screenStack.js) keeps every dashboard screen mounted
 * and shows only the active one, so a page switch reuses the DOM instead of
 * unmounting and remounting every region.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({
    handleAction: vi.fn(),
    focusRegion: vi.fn(),
    activateScreen: vi.fn(),
  }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

import Dashboard from "@/views/Dashboard.vue";
import { useConfigStore } from "@/stores/config";

const screen = (id, regions) => ({
  id,
  name: id,
  activeRegionId: regions[0].id,
  layout: { regions },
});

const SCREENS = {
  version: 2,
  activeScreenId: "screen-a",
  screens: [
    screen("screen-a", [
      { id: "r1", kind: "calendar", instanceIds: [], size: 50 },
      { id: "r2", kind: "photos", instanceIds: [], size: 50 },
    ]),
    screen("screen-b", [{ id: "r3", kind: "photos", instanceIds: [], size: 100 }]),
  ],
};

const stubs = {
  DashboardRegion: {
    name: "DashboardRegion",
    props: ["region", "activeRegionId", "lightActive", "parentDirection"],
    emits: ["focus-region"],
    template: '<div class="region-stub" :data-region="region.id" />',
  },
  ClockBarHorizontal: true,
  ClockBarVertical: true,
  MinimalUIOverlay: true,
  LoadingLight: true,
  SetupWelcomeCard: true,
  LayoutManager: { template: "<div><slot /></div>" },
};

const realLocation = window.location;
function setSearch(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi" },
    writable: true,
    configurable: true,
  });
}

function setup({ search = "", locked = true } = {}) {
  setSearch(search);
  setActivePinia(createPinia());
  const store = useConfigStore();
  store.setDashboardScreens(SCREENS);
  store.regionsLocked = locked;
  store.fetchConfig = vi.fn().mockResolvedValue({});
  vi.spyOn(store, "updateConfig").mockResolvedValue(undefined);
  return store;
}

describe("Dashboard screen stack", () => {
  beforeEach(() => {
    window.localStorage.removeItem("calvin.screenStack");
  });

  afterEach(() => {
    window.localStorage.removeItem("calvin.screenStack");
    Object.defineProperty(window, "location", {
      value: realLocation,
      writable: true,
      configurable: true,
    });
  });

  it("renders only the active screen when the stack is off", async () => {
    setup();
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);
    expect(wrapper.find(".screen-stack--stacked").exists()).toBe(false);
    expect(wrapper.findAll(".region-stub").map(r => r.attributes("data-region"))).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("mounts every screen and shows only the active one", async () => {
    setup({ search: "?screenStack=opacity" });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find(".screen-stack--opacity").exists()).toBe(true);
    const views = wrapper.findAll(".dashboard-view");
    expect(views).toHaveLength(2);
    expect(views[0].classes()).toContain("is-active-screen");
    expect(views[1].classes()).not.toContain("is-active-screen");
    expect(views[1].attributes("inert")).toBeDefined();
    expect(views[1].attributes("aria-hidden")).toBe("true");
    expect(views[0].attributes("inert")).toBeUndefined();
    expect(wrapper.findAll(".region-stub")).toHaveLength(3);
  });

  it("switches screens without remounting their regions", async () => {
    const store = setup({ search: "?screenStack=opacity" });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();
    const before = wrapper.findAll(".region-stub").map(r => r.element);

    store.setDashboardScreens({ ...SCREENS, activeScreenId: "screen-b" });
    await flushPromises();

    const views = wrapper.findAll(".dashboard-view");
    expect(views[0].classes()).not.toContain("is-active-screen");
    expect(views[1].classes()).toContain("is-active-screen");
    const after = wrapper.findAll(".region-stub").map(r => r.element);
    expect(after).toHaveLength(before.length);
    after.forEach((el, i) => expect(el).toBe(before[i]));
  });

  it("falls back to the single active screen while the layout is unlocked", async () => {
    setup({ search: "?screenStack=opacity", locked: false });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);
    expect(wrapper.find(".region-resizer").exists()).toBe(true);
  });
});
