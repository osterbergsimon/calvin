import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useActiveRegionStore } from "@/stores/activeRegion";
import { normalizeDashboardScreens } from "@/utils/layout";

const screen = (activeRegionId = "cal") =>
  normalizeDashboardScreens({
    version: 2,
    activeScreenId: "s1",
    screens: [
      {
        id: "s1",
        name: "Home",
        activeRegionId,
        layout: {
          regions: [
            { id: "cal", kind: "calendar", instanceIds: [], size: 34 },
            { id: "pho", kind: "photos", instanceIds: [], size: 33 },
            { id: "svc", kind: "service", instanceIds: [], size: 33 },
          ],
        },
      },
    ],
  }).screens[0];

describe("activeRegion store", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => sessionStorage.clear());

  it("starts from the screen's persisted activeRegionId", () => {
    const store = useActiveRegionStore();
    expect(store.getActiveRegionId(screen())).toBe("cal");
  });

  it("keeps a session-only region without touching the screen config", () => {
    const store = useActiveRegionStore();
    const home = screen();
    store.syncScreens([home]);

    store.setActiveRegionId(home, "pho");

    expect(store.getActiveRegionId(home)).toBe("pho");
    expect(home.activeRegionId).toBe("cal");
  });

  it("ignores a region that is not a leaf on that screen", () => {
    const store = useActiveRegionStore();
    const home = screen();

    store.setActiveRegionId(home, "nope");

    expect(store.getActiveRegionId(home)).toBe("cal");
  });

  it("restores the last region after a reload", () => {
    const first = useActiveRegionStore();
    first.syncScreens([screen()]);
    first.setActiveRegionId(screen(), "pho");

    // A reload creates a fresh store; sessionStorage survives it.
    setActivePinia(createPinia());
    const reloaded = useActiveRegionStore();
    reloaded.syncScreens([screen()]);

    expect(reloaded.getActiveRegionId(screen())).toBe("pho");
  });

  it("adopts a server bookmark that changed while the kiosk was away", () => {
    const first = useActiveRegionStore();
    first.syncScreens([screen("cal")]);
    first.setActiveRegionId(screen("cal"), "pho");

    setActivePinia(createPinia());
    const reloaded = useActiveRegionStore();
    reloaded.syncScreens([screen("svc")]);

    expect(reloaded.getActiveRegionId(screen("svc"))).toBe("svc");
  });

  it("keeps the local tap when the persisted value did not change", () => {
    const store = useActiveRegionStore();
    store.syncScreens([screen("cal")]);
    store.setActiveRegionId(screen("cal"), "pho");

    store.syncScreens([screen("cal")]);

    expect(store.getActiveRegionId(screen("cal"))).toBe("pho");
  });

  it("adopts a deliberate persisted change from the editor", () => {
    const store = useActiveRegionStore();
    store.syncScreens([screen("cal")]);
    store.setActiveRegionId(screen("cal"), "pho");

    store.syncScreens([screen("svc")]);

    expect(store.getActiveRegionId(screen("svc"))).toBe("svc");
  });

  it("lets a new server bookmark win over a stale session value", () => {
    const store = useActiveRegionStore();
    store.syncScreens([screen("cal")]);
    store.setActiveRegionId(screen("cal"), "pho");

    store.syncScreens([screen("svc")]);

    expect(store.getActiveRegionId(screen("svc"))).toBe("svc");
  });

  it("keys persisted regions by kiosk and screen", () => {
    sessionStorage.setItem("calvin_kiosk_id", "kiosk-a");
    const store = useActiveRegionStore();
    store.syncScreens([screen()]);
    store.setActiveRegionId(screen(), "pho");

    sessionStorage.setItem("calvin_kiosk_id", "kiosk-b");
    setActivePinia(createPinia());
    const otherKiosk = useActiveRegionStore();
    otherKiosk.syncScreens([screen()]);

    expect(otherKiosk.getActiveRegionId(screen())).toBe("cal");
  });
});
