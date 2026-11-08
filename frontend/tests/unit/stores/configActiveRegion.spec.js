/**
 * Runtime region focus is session-local, but a persisted bookmark written by
 * the editor (or arriving from another device) must win (calvin-ex6w review).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";
import { useActiveRegionStore } from "@/stores/activeRegion";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const payload = activeRegionId => ({
  displaySettingsMigrated: true,
  dashboardScreens: {
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
  },
});

const home = store => store.dashboardScreens.screens[0];

describe("config region bookmark reconciliation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: payload("cal") });
  });

  it("adopts a new server activeRegionId over a stale session value", async () => {
    api.get.mockResolvedValueOnce({ data: payload("cal") });
    const store = useConfigStore();
    await store.fetchConfig();
    const activeRegion = useActiveRegionStore();
    activeRegion.setActiveRegionId(home(store), "pho");
    expect(activeRegion.getActiveRegionId(home(store))).toBe("pho");

    api.get.mockResolvedValueOnce({ data: payload("svc") });
    await store.fetchConfig();

    expect(activeRegion.getActiveRegionId(home(store))).toBe("svc");
  });

  it("adopts an editor save through setDashboardScreens", async () => {
    api.get.mockResolvedValueOnce({ data: payload("cal") });
    const store = useConfigStore();
    await store.fetchConfig();
    const activeRegion = useActiveRegionStore();
    activeRegion.setActiveRegionId(home(store), "pho");

    store.setDashboardScreens(payload("svc").dashboardScreens);

    expect(activeRegion.getActiveRegionId(home(store))).toBe("svc");
  });

  it("adopts an editor save through updateConfig", async () => {
    api.get.mockResolvedValueOnce({ data: payload("cal") });
    const store = useConfigStore();
    await store.fetchConfig();
    const activeRegion = useActiveRegionStore();
    activeRegion.setActiveRegionId(home(store), "pho");
    api.post.mockResolvedValue({ data: payload("svc") });

    await store.updateConfig({ dashboardScreens: payload("svc").dashboardScreens });

    expect(activeRegion.getActiveRegionId(home(store))).toBe("svc");
  });

  it("keeps the session value when a poll repeats the persisted bookmark", async () => {
    api.get.mockResolvedValue({ data: payload("cal") });
    const store = useConfigStore();
    await store.fetchConfig();
    const activeRegion = useActiveRegionStore();
    activeRegion.setActiveRegionId(home(store), "pho");

    await store.fetchConfig();

    expect(activeRegion.getActiveRegionId(home(store))).toBe("pho");
  });

  it("restores the session bookmark through a reload's config fetch", async () => {
    api.get.mockResolvedValueOnce({ data: payload("cal") });
    const store = useConfigStore();
    await store.fetchConfig();
    useActiveRegionStore().setActiveRegionId(home(store), "pho");

    // Reload: fresh stores, same tab/sessionStorage, config fetched again.
    setActivePinia(createPinia());
    const reloadedStore = useConfigStore();
    const reloadedRegion = useActiveRegionStore();
    api.get.mockResolvedValueOnce({ data: payload("cal") });
    await reloadedStore.fetchConfig();

    expect(reloadedRegion.getActiveRegionId(home(reloadedStore))).toBe("pho");
  });
});
