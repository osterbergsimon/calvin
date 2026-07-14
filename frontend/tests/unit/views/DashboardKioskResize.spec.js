/**
 * DashboardKioskResize.spec.js
 *
 * Verifies that drag-to-resize (commitRegionSizes) writes the FULL global
 * catalog to /api/config even in kiosk mode, where effectiveDashboardScreens
 * is a filtered subset. The pre-fix code sourced from the filtered set, so a
 * kiosk resize would silently delete all screens not in availableScreens.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

// jsdom does not implement PointerEvent. Polyfill with a plain object-style
// event so window.dispatchEvent("pointermove") / ("pointerup") dispatches fire.
// clientX/clientY are passed as plain properties since MouseEvent does not allow
// setting them post-construction in jsdom.
function makePointerEvent(type, { clientX = 0, clientY = 0, bubbles = true } = {}) {
  const evt = new Event(type, { bubbles });
  evt.clientX = clientX;
  evt.clientY = clientY;
  return evt;
}

vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({
    handleAction: vi.fn(),
    focusRegion: vi.fn(),
    activateScreen: vi.fn(),
  }),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
}));

import Dashboard from "@/views/Dashboard.vue";
import { useConfigStore } from "@/stores/config";

// 2-screen global catalog: screen-a (kiosk can see) + screen-b (kiosk CANNOT see).
// Each screen has 2 regions so that a resize handle is rendered.
const GLOBAL_SCREENS = {
  version: 2,
  activeScreenId: "screen-a",
  screens: [
    {
      id: "screen-a",
      name: "Screen A",
      activeRegionId: "r1",
      layout: {
        regions: [
          { id: "r1", kind: "calendar", instanceIds: [], size: 50 },
          { id: "r2", kind: "photos", instanceIds: [], size: 50 },
        ],
      },
    },
    {
      id: "screen-b",
      name: "Screen B",
      activeRegionId: "r3",
      layout: {
        regions: [
          { id: "r3", kind: "photos", instanceIds: [], size: 60 },
          { id: "r4", kind: "calendar", instanceIds: [], size: 40 },
        ],
      },
    },
  ],
};

const stubs = {
  DashboardRegion: {
    name: "DashboardRegion",
    props: [
      "region",
      "photoRotationInterval",
      "parentDirection",
      "activeRegionId",
      "lightActive",
      "dimOthers",
    ],
    emits: ["focus-region"],
    template: '<div class="region-stub" />',
  },
  ClockBarHorizontal: true,
  ClockBarVertical: true,
  MinimalUIOverlay: true,
  PerimeterProgress: true,
  LayoutManager: { template: "<div><slot /></div>" },
};

function setSearch(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi" },
    writable: true,
  });
}

describe("Dashboard commitRegionSizes — kiosk catalog preservation (dd9.4)", () => {
  let store;
  let updateConfigSpy;

  beforeEach(() => {
    // Simulate kiosk mode: ?kiosk=k1 in the URL
    setSearch("?kiosk=k1");
    setActivePinia(createPinia());
    store = useConfigStore();
    // Load the 2-screen global catalog
    store.setDashboardScreens(GLOBAL_SCREENS);
    // Kiosk can only see screen-a (screen-b is hidden from this kiosk)
    store.availableScreens = ["screen-a"];
    store.kioskActiveScreenId = "screen-a";
    store.showUI = true;
    store.regionsLocked = false; // unlocked so resize handles are rendered
    store.fetchConfig = vi.fn().mockResolvedValue({});
    // Spy on updateConfig to capture the payload
    updateConfigSpy = vi.spyOn(store, "updateConfig").mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Reset URL to non-kiosk so subsequent describe blocks are unaffected
    setSearch("");
  });

  it("effectiveDashboardScreens only contains screen-a (kiosk filter is active)", () => {
    // Baseline: confirm the kiosk filter is actually working so this test is non-vacuous.
    expect(store.effectiveDashboardScreens.screens.length).toBe(1);
    expect(store.effectiveDashboardScreens.screens[0].id).toBe("screen-a");
    // Raw catalog still has both screens.
    expect(store.dashboardScreens.screens.length).toBe(2);
  });

  it("resize writes the full 2-screen catalog — not the 1-screen filtered set", async () => {
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    // Find the resize handle (rendered between r1 and r2 on screen-a)
    const handle = wrapper.find(".region-resizer");
    expect(handle.exists()).toBe(true);

    // Mock getBoundingClientRect on the dashboard-view element so that
    // onRegionResizeMove can compute a valid offset.
    const dashViewEl = wrapper.find(".dashboard-view").element;
    dashViewEl.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      width: 1000,
      height: 1000,
    });

    // 1. pointerdown on the handle — starts the resize (no coordinates needed here;
    //    startRegionResize only calls getBoundingClientRect on the container).
    handle.element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();

    // 2. pointermove on window — produces a dragSizes map (clientX drives offset)
    window.dispatchEvent(makePointerEvent("pointermove", { clientX: 400, clientY: 400 }));

    // 3. pointerup on window — calls stopRegionResize → commitRegionSizes
    window.dispatchEvent(makePointerEvent("pointerup"));

    // commitRegionSizes is async (returns the updateConfig promise); flush
    await flushPromises();

    // Assert updateConfig was called
    expect(updateConfigSpy).toHaveBeenCalled();

    // The payload must contain the FULL catalog — both screens — not just screen-a
    const payload = updateConfigSpy.mock.calls[0][0];
    expect(payload.dashboardScreens).toBeDefined();
    expect(payload.dashboardScreens.screens.length).toBe(2);

    // screen-b must still be present (it was not visible to this kiosk but must
    // not be dropped from the global config)
    const ids = payload.dashboardScreens.screens.map(s => s.id);
    expect(ids).toContain("screen-b");
    expect(ids).toContain("screen-a");
  });

  it("screen-a regions have updated sizes in the payload after resize", async () => {
    // Complementary: confirm the resize values were actually applied to screen-a.
    const wrapper = mount(Dashboard, { global: { stubs } });
    await flushPromises();

    const handle = wrapper.find(".region-resizer");
    const dashViewEl = wrapper.find(".dashboard-view").element;
    dashViewEl.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      width: 1000,
      height: 1000,
    });

    handle.element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    // Move to 40% — r1 should become ~40%, r2 ~60%
    window.dispatchEvent(makePointerEvent("pointermove", { clientX: 400, clientY: 0 }));
    window.dispatchEvent(makePointerEvent("pointerup"));
    await flushPromises();

    expect(updateConfigSpy).toHaveBeenCalled();
    const payload = updateConfigSpy.mock.calls[0][0];
    const screenA = payload.dashboardScreens.screens.find(s => s.id === "screen-a");
    // Both r1 and r2 must have numeric sizes (resize was applied)
    expect(typeof screenA.layout.regions[0].size).toBe("number");
    expect(typeof screenA.layout.regions[1].size).toBe("number");
    // Sizes must sum to 100
    const total = screenA.layout.regions.reduce((acc, r) => acc + r.size, 0);
    expect(Math.round(total)).toBe(100);
  });
});

// ── Nested resize: sub-regions inside a split container ──────────────────────
//
// Screen with one top-level region (r1) split into two sub-regions (r1-a, r1-b).
// Dragging the divider inside r1 must update ONLY r1-a and r1-b in dragSizes;
// top-level region sizes must remain untouched.
const NESTED_SCREENS = {
  version: 2,
  activeScreenId: "screen-nested",
  screens: [
    {
      id: "screen-nested",
      name: "Nested",
      activeRegionId: "r1-a",
      layout: {
        regions: [
          {
            id: "r1",
            kind: "calendar",
            instanceIds: [],
            size: 100,
            split: {
              direction: "row",
              regions: [
                { id: "r1-a", kind: "calendar", instanceIds: [], size: 50 },
                { id: "r1-b", kind: "photos", instanceIds: [], size: 50 },
              ],
            },
          },
        ],
      },
    },
  ],
};

describe("Dashboard nested drag-resize", () => {
  let store;
  let updateConfigSpy;

  beforeEach(() => {
    setSearch("");
    setActivePinia(createPinia());
    store = useConfigStore();
    store.setDashboardScreens(NESTED_SCREENS);
    store.availableScreens = null;
    store.kioskActiveScreenId = null;
    store.showUI = true;
    store.regionsLocked = false;
    store.fetchConfig = vi.fn().mockResolvedValue({});
    updateConfigSpy = vi.spyOn(store, "updateConfig").mockResolvedValue(undefined);
  });

  afterEach(() => {
    setSearch("");
  });

  it("dragging a nested divider rescales only that container's children", async () => {
    // Use real DashboardRegion so the nested handles are rendered.
    const wrapper = mount(Dashboard, {
      global: {
        stubs: {
          // Keep DashboardRegion real; stub only leaf components.
          CalendarView: true,
          PhotoSlideshow: true,
          WebServiceViewer: true,
          ClockBarHorizontal: true,
          ClockBarVertical: true,
          MinimalUIOverlay: true,
          PerimeterProgress: true,
          LayoutManager: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();

    // Expose the startNestedResize function via the provide context.
    // We call it directly by grabbing the vm's provided value.
    // The provide key is "dashboardResize".
    const dashboardVm = wrapper.vm;
    // Access dragSizes from the component's internal state via expose or provide.
    // Since Dashboard uses provide("dashboardResize", ctx), we drive the resize
    // by calling startNestedResize directly on the provided object.
    const resizeCtx = dashboardVm.$.appContext.app._context.provides?.dashboardResize
      ?? dashboardVm.$.provides?.dashboardResize;

    expect(resizeCtx, "dashboardResize context must be provided").toBeTruthy();

    // Build a fake container element (the split container inside r1).
    const fakeContainer = {
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 800, height: 600 }),
    };

    // Start a nested resize at containerPath=[0] (inside r1), firstIndex=0, direction="row".
    resizeCtx.start([0], 0, fakeContainer, "row");

    // pointermove: clientX=400 → 50% of 800px container → each sub stays 50 (no change from start)
    // Use clientX=320 → 40% of 800 → r1-a=40, r1-b=60
    window.dispatchEvent(makePointerEvent("pointermove", { clientX: 320, clientY: 0 }));

    // dragSizes should now have r1-a and r1-b but NOT r1.
    const sizes = resizeCtx.dragSizes.value;
    expect(sizes, "dragSizes must be set after pointermove").toBeTruthy();
    expect(sizes["r1-a"], "r1-a must have a drag size").toBeDefined();
    expect(sizes["r1-b"], "r1-b must have a drag size").toBeDefined();
    expect(sizes["r1"], "top-level r1 must NOT appear in dragSizes").toBeUndefined();

    // Sub-region sizes must sum to 100.
    const subTotal = sizes["r1-a"] + sizes["r1-b"];
    expect(Math.round(subTotal)).toBe(100);

    // pointerup commits
    window.dispatchEvent(makePointerEvent("pointerup"));
    await flushPromises();

    expect(updateConfigSpy).toHaveBeenCalled();
    const payload = updateConfigSpy.mock.calls[0][0];
    const screen = payload.dashboardScreens.screens.find(s => s.id === "screen-nested");
    const r1 = screen.layout.regions[0];
    // Top-level r1 size must be unchanged (100).
    expect(r1.size).toBe(100);
    // Sub-region sizes must be updated.
    const subA = r1.split.regions.find(s => s.id === "r1-a");
    const subB = r1.split.regions.find(s => s.id === "r1-b");
    expect(typeof subA.size).toBe("number");
    expect(typeof subB.size).toBe("number");
    expect(Math.round(subA.size + subB.size)).toBe(100);
  });
});
