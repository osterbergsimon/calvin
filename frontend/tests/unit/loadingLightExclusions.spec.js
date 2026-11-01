/**
 * Loading light never-drives list (CLV-115, docs/design/2026-11-01-loading-light.md §2):
 * the /health check and connection backoff, config polling, clock ticks, photo
 * rotation and prefetching never touch the progress store. ConnectionStatus
 * and the region's own state speak for those.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watch } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

// Every network call answers from here: config polls and photo rotation run
// their real store actions, and none of them reaches a real backend.
const IMAGES = [{ id: "1" }, { id: "2" }, { id: "3" }];
vi.mock("@/services/api", () => {
  const answer = url => {
    if (url.startsWith("/images/list")) return { data: { images: IMAGES } };
    if (url.startsWith("/images/")) return { data: { image: IMAGES[1] } };
    return { data: {} };
  };
  const api = {
    get: vi.fn(async url => answer(url)),
    post: vi.fn(async url => answer(url)),
    put: vi.fn(async url => answer(url)),
    delete: vi.fn(async () => ({ data: {} })),
  };
  return { default: api, LONG_REQUEST_TIMEOUT: 1, isServiceWorkerReplay: () => false };
});
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

import api from "@/services/api";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import Dashboard from "@/views/Dashboard.vue";
import { _resetFirstLoadLightForTests } from "@/composables/useFirstLoadLight";
import { useConnectionStore } from "@/stores/connection";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";
import { useProgressStore } from "@/stores/progress";
import { useWebServicesStore } from "@/stores/webServices";

describe("loading light: excluded sources never drive it (CLV-115)", () => {
  let progress;
  let calls;
  let mutations;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    _resetFirstLoadLightForTests();
    setActivePinia(createPinia());
    progress = useProgressStore();
    calls = [vi.spyOn(progress, "begin"), vi.spyOn(progress, "track")];
    mutations = 0;
    watch(
      () => progress.activeIds.join("|"),
      () => {
        mutations += 1;
      },
      { flush: "sync" }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Whatever a component legitimately lit while mounting (the first load, the
  // photo-source fetch) is over; from here on nothing may touch the store.
  const startWatching = () => {
    expect(progress.active).toBe(false);
    for (const spy of calls) spy.mockClear();
    mutations = 0;
  };

  const expectUntouched = () => {
    for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    expect(mutations).toBe(0);
    expect(progress.active).toBe(false);
  };

  it("the /health check and its backoff", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const connection = useConnectionStore();
    connection.initialize();
    // Several failed checks walk the backoff (5 s, 10 s, 30 s), then recovery.
    await vi.advanceTimersByTimeAsync(120_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await vi.advanceTimersByTimeAsync(60_000);
    connection.cleanup();
    expectUntouched();
  });

  it("config polling", async () => {
    const config = useConfigStore();
    const wrapper = mount(Dashboard, {
      global: {
        stubs: {
          DashboardRegion: true,
          ClockBarHorizontal: true,
          ClockBarVertical: true,
          MinimalUIOverlay: true,
          LoadingLight: true,
          SetupWelcomeCard: true,
          LayoutManager: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();
    // The first-load light settles once the dashboard has its config.
    await vi.advanceTimersByTimeAsync(2000);
    startWatching();

    const configCalls = () => api.get.mock.calls.filter(([url]) => url.includes("config")).length;
    const before = configCalls();
    await vi.advanceTimersByTimeAsync(config.configPollInterval * 1000 * 3);
    // The poll really ran (three ticks), and never lit the light.
    expect(configCalls() - before).toBeGreaterThanOrEqual(3);
    expectUntouched();
    wrapper.unmount();
  });

  it("photo rotation from cache and prefetching the next photo", async () => {
    const images = useImagesStore();
    const wrapper = mount(PhotoSlideshow, {
      props: { regionId: "r1", autoRotate: true, rotationInterval: 1000 },
    });
    await flushPromises();
    startWatching();

    const nextCalls = () => api.post.mock.calls.filter(([url]) => url === "/images/next").length;
    await vi.advanceTimersByTimeAsync(3000);
    // Auto-rotation really advanced three times, and never lit the light.
    expect(nextCalls()).toBe(3);
    expect(images.getCurrentImageForSource([])).toEqual(IMAGES[1]);
    expectUntouched();
    wrapper.unmount();
  });

  it("clock ticks in the clock bar", async () => {
    const config = useConfigStore();
    config.showUI = true;
    // Status plugins already loaded: nothing left for the bar to fetch.
    useWebServicesStore().services = [{ id: "w", statusbar_schema: { kind: "text" } }];
    mount(ClockBarHorizontal, {
      props: { position: "top", showInNonKiosk: true, showInKiosk: false, enabled: true },
      global: { stubs: { BarActionCluster: true, SchemaStatusbarItem: true } },
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expectUntouched();
  });
});
