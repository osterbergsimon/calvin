/**
 * Idle-timer regressions for usePhotoFrameMode (calvin-agnx): the frame must
 * start on a kiosk nobody touches, across config applies and failed entries.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { reactive } from "vue";
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

describe("usePhotoFrameMode idle timer (calvin-agnx)", () => {
  let config;
  let images;
  let mode;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetPhotoFrameInstance();

    // Reactive, like the real store: refs assigned by applyConfigPayload.
    config = reactive({
      photoFrameEnabled: true,
      photoFrameTimeout: 60,
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

    useConfigStore.mockReturnValue(config);
    useImagesStore.mockReturnValue(images);
    useModeStore.mockReturnValue(mode);
    useRouter.mockReturnValue({ push: vi.fn(), currentRoute: { value: { path: "/" } } });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPhotoFrameInstance();
  });

  it("is not restarted by a config apply that leaves the frame settings unchanged", async () => {
    const frame = usePhotoFrameMode();
    frame.resetInactivityTimer();

    await vi.advanceTimersByTimeAsync(40_000);
    // The 30s poll applied a payload where some other field changed:
    // applyConfigPayload assigns every ref, source ids included, as a new array.
    config.photoFrameSourceIds = [];
    config.photoFrameEnabled = true;
    config.photoFrameTimeout = 60;
    await vi.advanceTimersByTimeAsync(20_000);

    expect(mode.enterFullscreen).toHaveBeenCalledTimes(1);
  });

  it("is still restarted when the chosen sources really change", async () => {
    const frame = usePhotoFrameMode();
    frame.resetInactivityTimer();

    await vi.advanceTimersByTimeAsync(40_000);
    config.photoFrameSourceIds = ["src-a"];
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mode.enterFullscreen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(mode.enterFullscreen).toHaveBeenCalledTimes(1);
  });

  it("retries without input after the photo fetch failed", async () => {
    images.fetchImages.mockRejectedValueOnce(new Error("offline"));
    const frame = usePhotoFrameMode();
    frame.resetInactivityTimer();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mode.enterFullscreen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mode.enterFullscreen).toHaveBeenCalledTimes(1);
  });

  it("retries without input after the chosen sources were empty", async () => {
    images.getImagesForSource.mockReturnValueOnce([]);
    const frame = usePhotoFrameMode();
    frame.resetInactivityTimer();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mode.enterFullscreen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mode.enterFullscreen).toHaveBeenCalledTimes(1);
  });
});
