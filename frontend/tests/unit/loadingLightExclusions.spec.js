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
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
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
    for (let i = 0; i < 3; i += 1) await config.fetchConfig();
    expectUntouched();
  });

  it("photo rotation from cache and prefetching the next photo", async () => {
    const images = useImagesStore();
    images.images = [{ id: "1" }, { id: "2" }, { id: "3" }];
    images.currentImage = images.images[0];
    for (let i = 0; i < 3; i += 1) {
      await images.nextImage().catch(() => {});
      await images.previousImage().catch(() => {});
    }
    expectUntouched();
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
