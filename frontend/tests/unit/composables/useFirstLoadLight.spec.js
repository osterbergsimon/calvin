import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import {
  _resetFirstLoadLightForTests,
  expectFirstLoadRegion,
  firstLoadRegionMounted,
  forgetFirstLoadRegion,
  useFirstLoadLight,
} from "@/composables/useFirstLoadLight";
import { FIRST_LOAD_SOURCE_ID, useProgressStore } from "@/stores/progress";

const Host = defineComponent({
  setup(_, { expose }) {
    expose(useFirstLoadLight());
    return () => h("div");
  },
});

describe("useFirstLoadLight (CLV-115)", () => {
  let progress;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    _resetFirstLoadLightForTests();
    progress = useProgressStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lights the app frame from the first dashboard mount", async () => {
    mount(Host);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(progress.appVisible).toBe(true);
  });

  it("ends once content is in and the regions' first fetches are done", async () => {
    const wrapper = mount(Host);
    expectFirstLoadRegion("r1");
    wrapper.vm.contentReady();
    firstLoadRegionMounted("r1");
    progress.begin("calendar:r1", { regionId: "r1" });
    await vi.advanceTimersByTimeAsync(600);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(true);

    progress.end("calendar:r1");
    await vi.advanceTimersByTimeAsync(0);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
  });

  it("with no regions to wait for, ends as soon as content is in", async () => {
    const wrapper = mount(Host);
    wrapper.vm.contentReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
  });

  it("waits for a slow region chunk to mount, not a fixed timer", async () => {
    const wrapper = mount(Host);
    expectFirstLoadRegion("r1");
    expectFirstLoadRegion("r2");
    wrapper.vm.contentReady();
    firstLoadRegionMounted("r1");
    // A slow Pi: r2's chunk is still loading well past any short settle.
    await vi.advanceTimersByTimeAsync(3000);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(true);

    // r2 mounts and starts its fetch: the first-load light holds until it ends.
    firstLoadRegionMounted("r2");
    progress.begin("photos:r2", { regionId: "r2" });
    await vi.advanceTimersByTimeAsync(0);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(true);
    progress.end("photos:r2");
    await vi.advanceTimersByTimeAsync(0);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
  });

  it("one continuous light from first load into a late region fetch", async () => {
    const wrapper = mount(Host);
    expectFirstLoadRegion("r1");
    wrapper.vm.contentReady();
    await vi.advanceTimersByTimeAsync(2000);
    expect(progress.appVisible).toBe(true);
    firstLoadRegionMounted("r1");
    progress.begin("calendar:r1", { regionId: "r1" });
    for (let t = 0; t < 1500; t += 50) {
      await vi.advanceTimersByTimeAsync(50);
      expect(progress.visibleFrames.length).toBe(1);
    }
  });

  it("a region that goes away before mounting is not waited for", async () => {
    const wrapper = mount(Host);
    expectFirstLoadRegion("r1");
    wrapper.vm.contentReady();
    await vi.advanceTimersByTimeAsync(1000);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(true);
    forgetFirstLoadRegion("r1");
    await vi.advanceTimersByTimeAsync(0);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
  });

  it("a region that never mounts cannot hold the light past the fallback", async () => {
    const wrapper = mount(Host);
    expectFirstLoadRegion("r1");
    wrapper.vm.contentReady();
    await vi.advanceTimersByTimeAsync(9999);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
  });

  it("runs once per page load, not on every return to the dashboard", () => {
    const first = mount(Host);
    first.unmount();
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
    mount(Host);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
  });
});
