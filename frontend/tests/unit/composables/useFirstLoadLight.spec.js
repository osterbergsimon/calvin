import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { _resetFirstLoadLightForTests, useFirstLoadLight } from "@/composables/useFirstLoadLight";
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
    wrapper.vm.contentReady();
    progress.begin("calendar:r1", { regionId: "r1" });
    await vi.advanceTimersByTimeAsync(600);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(true);

    progress.end("calendar:r1");
    await vi.advanceTimersByTimeAsync(0);
    expect(progress.isActive(FIRST_LOAD_SOURCE_ID)).toBe(false);
  });

  it("ends after the settle window when nothing else is loading", async () => {
    const wrapper = mount(Host);
    wrapper.vm.contentReady();
    await vi.advanceTimersByTimeAsync(599);
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
