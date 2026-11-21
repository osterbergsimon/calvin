/**
 * Boot regressions for usePhotoFrameMode (calvin-agnx): a kiosk that boots to
 * the dashboard and receives no input at all must still enter the frame.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, reactive, ref, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { usePhotoFrameMode, resetPhotoFrameInstance } from "@/composables/usePhotoFrameMode";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";
import { useModeStore } from "@/stores/mode";
import { useRouter } from "vue-router";

vi.mock("@/stores/config", () => ({ useConfigStore: vi.fn() }));
vi.mock("@/stores/images", () => ({ useImagesStore: vi.fn() }));
vi.mock("@/stores/mode", () => ({ useModeStore: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: vi.fn() }));

const mountFrame = () => {
  let frame;
  const Host = defineComponent({
    setup() {
      frame = usePhotoFrameMode();
      return () => null;
    },
  });
  const wrapper = mount(Host);
  return { wrapper, frame };
};

describe("usePhotoFrameMode boot (calvin-agnx)", () => {
  let config;
  let images;
  let mode;
  let route;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetPhotoFrameInstance();

    config = reactive({
      photoFrameEnabled: false,
      photoFrameTimeout: 5,
      photoFrameSourceIds: [],
      lastSideViewMode: "photos",
      fetchConfig: vi.fn().mockResolvedValue({}),
      setLastSideViewMode: vi.fn(),
    });
    images = {
      fetchImages: vi.fn().mockResolvedValue({}),
      getImagesForSource: vi.fn(() => [{ id: "p1" }]),
    };
    mode = { MODES: { PHOTOS: "photos" }, enterFullscreen: vi.fn(), exitFullscreen: vi.fn() };
    route = ref({ path: "/" });

    useConfigStore.mockReturnValue(config);
    useImagesStore.mockReturnValue(images);
    useModeStore.mockReturnValue(mode);
    useRouter.mockReturnValue({ push: vi.fn(), currentRoute: route });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPhotoFrameInstance();
  });

  it("enters after the idle wait when config arrives and nobody touches the screen", async () => {
    config.fetchConfig.mockImplementation(async () => {
      config.photoFrameEnabled = true;
      config.photoFrameTimeout = 5;
    });

    mountFrame();
    await flushPromises();
    await nextTick();

    await vi.advanceTimersByTimeAsync(5000);

    expect(mode.enterFullscreen).toHaveBeenCalledTimes(1);
  });

  it("arms the idle wait when a later config poll enables the frame", async () => {
    mountFrame();
    await flushPromises();
    await nextTick();

    // The first load left the frame off; the dashboard's 30 s poll enables it.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mode.enterFullscreen).not.toHaveBeenCalled();

    config.photoFrameEnabled = true;
    await nextTick();

    await vi.advanceTimersByTimeAsync(5000);
    expect(mode.enterFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does not arm on /settings, and arms when the screen leaves settings", async () => {
    config.photoFrameEnabled = true;
    route.value = { path: "/settings" };

    mountFrame();
    await flushPromises();
    await nextTick();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(mode.enterFullscreen).not.toHaveBeenCalled();

    route.value = { path: "/" };
    await nextTick();

    await vi.advanceTimersByTimeAsync(5000);
    expect(mode.enterFullscreen).toHaveBeenCalledTimes(1);
  });
});
