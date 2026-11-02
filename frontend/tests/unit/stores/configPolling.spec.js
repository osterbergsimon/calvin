/**
 * The 30 s config poll must not replace reactive config when the backend
 * returns the same payload: every write re-renders all dashboard regions
 * (calvin-ex6w, kiosk performance fix 10).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const payload = () => ({
  displaySettingsMigrated: true,
  orientation: "landscape",
  calendarSplit: 70,
  showUI: true,
  dashboardScreens: {
    version: 2,
    activeScreenId: "s1",
    screens: [
      {
        id: "s1",
        name: "Home",
        activeRegionId: "cal",
        layout: {
          regions: [
            { id: "cal", kind: "calendar", instanceIds: [], size: 50 },
            { id: "pho", kind: "photos", instanceIds: [], size: 50 },
          ],
        },
      },
    ],
  },
});

describe("config poll skips an unchanged payload", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
    api.post.mockResolvedValue({ data: payload() });
  });

  it("keeps the same reactive objects when the payload did not change", async () => {
    api.get.mockResolvedValue({ data: payload() });
    const store = useConfigStore();

    await store.fetchConfig();
    const firstScreens = store.dashboardScreens;

    await store.fetchConfig();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(store.dashboardScreens).toBe(firstScreens);
  });

  it("applies a changed payload", async () => {
    api.get.mockResolvedValueOnce({ data: payload() }).mockResolvedValueOnce({
      data: { ...payload(), calendarSplit: 55 },
    });
    const store = useConfigStore();

    await store.fetchConfig();
    const firstScreens = store.dashboardScreens;
    await store.fetchConfig();

    expect(store.calendarSplit).toBe(55);
    expect(store.dashboardScreens).not.toBe(firstScreens);
  });
});
