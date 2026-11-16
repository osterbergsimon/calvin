/**
 * The screen stack (utils/screenStack.js) keeps every dashboard screen mounted
 * and shows only the active one, so a page switch reuses the DOM instead of
 * unmounting and remounting every region.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";
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
// DashboardRegion's leaves are async components: give them tiny, prop-keeping
// stand-ins so the one test that mounts a real region stays light. The
// PhotoSlideshow stub exposes the prop the hidden-screen pause is asserted on.
vi.mock("../../../src/components/CalendarView.vue", () => ({
  __esModule: true,
  default: { name: "CalendarView", template: "<div class='calendar-view-stub' />" },
}));
vi.mock("../../../src/components/WebServiceViewer.vue", () => ({
  __esModule: true,
  default: { name: "WebServiceViewer", template: "<div class='service-view-stub' />" },
}));
vi.mock("../../../src/components/PhotoSlideshow.vue", () => ({
  __esModule: true,
  default: {
    name: "PhotoSlideshow",
    props: ["autoRotate", "rotationInterval", "regionId"],
    template: '<div class="photo-slideshow-stub" :data-auto-rotate="String(autoRotate)" />',
  },
}));

import Dashboard from "@/views/Dashboard.vue";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";

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
  CalendarView: true,
  PhotoSlideshow: true,
  WebServiceViewer: true,
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

// `keep` is this screen's Faster page switching setting (keepScreensReady).
function setup({ search = "", locked = true, keep = false } = {}) {
  setSearch(search);
  setActivePinia(createPinia());
  const store = useConfigStore();
  store.keepScreensReady = keep;
  store.setDashboardScreens(SCREENS);
  store.regionsLocked = locked;
  store.fetchConfig = vi.fn().mockResolvedValue({});
  vi.spyOn(store, "updateConfig").mockResolvedValue(undefined);
  return store;
}

describe("Dashboard screen stack", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
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

  it("stays off in a browser that is not a known kiosk, even with the setting on", async () => {
    setup({ keep: true });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);
    expect(wrapper.find(".screen-stack--stacked").exists()).toBe(false);
  });

  it("stays off on a kiosk whose setting is off", async () => {
    setup({ search: "?kiosk=k1" });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);
  });

  it("turns on when the setting arrives after the config loads", async () => {
    const store = setup({ search: "?kiosk=k1" });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);

    store.keepScreensReady = true;
    await flushPromises();
    expect(wrapper.findAll(".dashboard-view")).toHaveLength(2);
  });

  it("?screenStack=on turns it on for one load, off turns it off, nothing is remembered", async () => {
    setup({ search: "?screenStack=on" });
    let wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findAll(".dashboard-view")).toHaveLength(2);
    wrapper.unmount();

    setup({ search: "?kiosk=k1&screenStack=off", keep: true });
    wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);
    wrapper.unmount();

    // A later load without the parameter follows the setting again.
    setup({ search: "" });
    wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);
    expect(window.localStorage.length).toBe(0);
  });

  it("mounts every screen and shows only the active one", async () => {
    setup({ search: "?kiosk=k1", keep: true });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find(".screen-stack--stacked").exists()).toBe(true);
    const views = wrapper.findAll(".dashboard-view");
    expect(views).toHaveLength(2);
    expect(views[0].classes()).toContain("is-active-screen");
    expect(views[1].classes()).not.toContain("is-active-screen");
    expect(views[1].attributes("inert")).toBeDefined();
    expect(views[1].attributes("aria-hidden")).toBe("true");
    expect(views[0].attributes("inert")).toBeUndefined();
    expect(wrapper.findAll(".region-stub")).toHaveLength(3);
  });

  it("pauses photo rotation on the hidden screen only", async () => {
    setup({ search: "?screenStack=on" });
    // Real DashboardRegion here, so its ScreenScope wiring is what is asserted;
    // the region content itself stays stubbed.
    const realRegionStubs = { ...stubs };
    delete realRegionStubs.DashboardRegion;
    delete realRegionStubs.PhotoSlideshow;
    const wrapper = mount(Dashboard, { global: { stubs: realRegionStubs } });
    await flushPromises();
    // The hidden screen's async region content resolves a tick later.
    await vi.waitFor(() =>
      expect(wrapper.findAllComponents({ name: "PhotoSlideshow" })).toHaveLength(2)
    );

    const photos = wrapper.findAllComponents({ name: "PhotoSlideshow" });
    const autoRotate = Object.fromEntries(
      photos.map(photo => [photo.props("regionId"), photo.props("autoRotate")])
    );
    // r2 is on the visible screen-a; r3 is on the hidden screen-b.
    expect(autoRotate).toEqual({ r2: true, r3: false });
  });

  it("switches screens without remounting their regions", async () => {
    const store = setup({ search: "?kiosk=k1", keep: true });
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
    setup({ search: "?kiosk=k1", keep: true, locked: false });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    expect(wrapper.findAll(".dashboard-view")).toHaveLength(1);
    expect(wrapper.find(".region-resizer").exists()).toBe(true);
  });

  it("keeps every screen mounted while a fullscreen view is open", async () => {
    setup({ search: "?kiosk=k1", keep: true });
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();
    const before = wrapper.findAll(".region-stub").map(region => region.element);

    const mode = useModeStore();
    mode.enterFullscreen(mode.MODES.PHOTOS);
    await nextTick();

    expect(wrapper.find(".fullscreen-mode").exists()).toBe(true);
    expect(wrapper.find(".screen-stack--under-fullscreen").exists()).toBe(true);
    const during = wrapper.findAll(".region-stub").map(region => region.element);
    expect(during).toHaveLength(before.length);
    during.forEach((element, index) => expect(element).toBe(before[index]));
    // Behind the fullscreen view nothing on the stack takes input or is read.
    for (const view of wrapper.findAll(".dashboard-view")) {
      expect(view.attributes("inert")).toBeDefined();
      expect(view.attributes("aria-hidden")).toBe("true");
    }

    mode.exitFullscreen();
    await nextTick();

    expect(wrapper.find(".fullscreen-mode").exists()).toBe(false);
    const after = wrapper.findAll(".region-stub").map(region => region.element);
    expect(after).toHaveLength(before.length);
    after.forEach((element, index) => expect(element).toBe(before[index]));
  });

  it("still swaps the dashboard for a fullscreen view when the stack is off", async () => {
    setup();
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findAll(".region-stub")).toHaveLength(2);

    const mode = useModeStore();
    mode.enterFullscreen(mode.MODES.PHOTOS);
    await nextTick();

    expect(wrapper.find(".fullscreen-mode").exists()).toBe(true);
    expect(wrapper.find(".screen-stack").exists()).toBe(false);

    mode.exitFullscreen();
    await nextTick();

    expect(wrapper.findAll(".region-stub")).toHaveLength(2);
  });
});
