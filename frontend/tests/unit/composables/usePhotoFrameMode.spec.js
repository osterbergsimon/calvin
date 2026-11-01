/**
 * Unit tests for usePhotoFrameMode composable (calvin-3xz9: per-screen frame).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { usePhotoFrameMode, resetPhotoFrameInstance } from "@/composables/usePhotoFrameMode";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";
import { useModeStore } from "@/stores/mode";
import { useRouter } from "vue-router";

// Mock stores
vi.mock("@/stores/config", () => ({
  useConfigStore: vi.fn(),
}));

vi.mock("@/stores/images", () => ({
  useImagesStore: vi.fn(),
}));

vi.mock("@/stores/mode", () => ({
  useModeStore: vi.fn(),
}));

// Mock vue-router
vi.mock("vue-router", () => ({
  useRouter: vi.fn(),
}));

describe("usePhotoFrameMode", () => {
  let mockConfigStore;
  let mockImagesStore;
  let mockModeStore;
  let mockRouter;

  const enable = ({ enabled = true, timeout = 5, sourceIds = [] } = {}) => {
    mockConfigStore.photoFrameEnabled = enabled;
    mockConfigStore.photoFrameTimeout = timeout;
    mockConfigStore.photoFrameSourceIds = sourceIds;
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    window.localStorage.clear();

    // Reset singleton instance between tests
    resetPhotoFrameInstance();

    mockConfigStore = {
      photoFrameEnabled: false,
      photoFrameTimeout: 300,
      photoFrameSourceIds: [],
      lastSideViewMode: "photos",
      fetchConfig: vi.fn().mockResolvedValue({}),
      setLastSideViewMode: vi.fn(),
    };

    mockImagesStore = {
      fetchImages: vi.fn().mockResolvedValue({ images: [{ id: "photo-1" }] }),
      getImagesForSource: vi.fn(() => [{ id: "photo-1" }]),
    };

    mockModeStore = {
      MODES: {
        PHOTOS: "photos",
        CALENDAR: "calendar",
      },
      enterFullscreen: vi.fn(),
      exitFullscreen: vi.fn(),
    };

    mockRouter = {
      push: vi.fn(),
      currentRoute: {
        value: {
          path: "/",
        },
      },
    };

    useConfigStore.mockReturnValue(mockConfigStore);
    useImagesStore.mockReturnValue(mockImagesStore);
    useModeStore.mockReturnValue(mockModeStore);
    useRouter.mockReturnValue(mockRouter);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetPhotoFrameInstance();
  });

  describe("Initialization", () => {
    it("should initialize with inactive photo frame mode", () => {
      const photoFrame = usePhotoFrameMode();

      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });
  });

  describe("resetInactivityTimer", () => {
    it("should enter the frame with this screen's timeout and all sources", async () => {
      enable({ timeout: 5 });

      const photoFrame = usePhotoFrameMode();
      photoFrame.resetInactivityTimer();

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockModeStore.enterFullscreen).toHaveBeenCalledWith(mockModeStore.MODES.PHOTOS, {
        sourceIds: [],
      });
      expect(photoFrame.isPhotoFrameActive.value).toBe(true);
      expect(mockRouter.push).toHaveBeenCalledWith("/");
    });

    it("should pass this screen's chosen photo sources to the slideshow", async () => {
      enable({ timeout: 5, sourceIds: ["src-b", "src-a"] });

      const photoFrame = usePhotoFrameMode();
      photoFrame.resetInactivityTimer();
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockImagesStore.fetchImages).toHaveBeenCalledWith(["src-a", "src-b"]);
      expect(mockModeStore.enterFullscreen).toHaveBeenCalledWith(mockModeStore.MODES.PHOTOS, {
        sourceIds: ["src-a", "src-b"],
      });
    });

    it("should use this browser's own per-screen choice over the global fallback", async () => {
      enable({ enabled: false, timeout: 300 });
      window.localStorage.setItem("calvin-screen-photoFrameEnabled", "true");
      window.localStorage.setItem("calvin-screen-photoFrameTimeout", "2");

      const photoFrame = usePhotoFrameMode();
      photoFrame.resetInactivityTimer();
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });

    it("should exit photo frame mode when resetting timer", () => {
      enable();

      const photoFrame = usePhotoFrameMode();

      // Manually set active state (bypassing enterPhotoFrameMode)
      photoFrame.isPhotoFrameActive.value = true;

      photoFrame.resetInactivityTimer();

      expect(mockModeStore.exitFullscreen).toHaveBeenCalled();
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });

    it("should not start timer if photo frame is disabled", async () => {
      enable({ enabled: false });

      const photoFrame = usePhotoFrameMode();

      photoFrame.resetInactivityTimer();

      await vi.advanceTimersByTimeAsync(10000);

      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
    });

    it("should clear existing timer when resetting", async () => {
      enable({ timeout: 5 });

      const photoFrame = usePhotoFrameMode();

      // Start first timer
      photoFrame.resetInactivityTimer();

      // Reset before timeout
      await vi.advanceTimersByTimeAsync(2000);
      photoFrame.resetInactivityTimer();

      // Should not trigger yet
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();

      // Now should trigger
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe("enterPhotoFrameMode", () => {
    it("should enter photo frame mode", async () => {
      enable();

      const photoFrame = usePhotoFrameMode();

      await photoFrame.enterPhotoFrameMode();

      expect(mockModeStore.enterFullscreen).toHaveBeenCalledWith(mockModeStore.MODES.PHOTOS, {
        sourceIds: [],
      });
      expect(photoFrame.isPhotoFrameActive.value).toBe(true);
      expect(mockRouter.push).toHaveBeenCalledWith("/");
    });

    it("should not enter if photo frame is disabled", async () => {
      enable({ enabled: false });

      const photoFrame = usePhotoFrameMode();

      await photoFrame.enterPhotoFrameMode();

      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });

    it("should stay on the dashboard when the chosen sources have no photos", async () => {
      enable({ sourceIds: ["empty-source"] });
      mockImagesStore.getImagesForSource.mockReturnValue([]);

      const photoFrame = usePhotoFrameMode();
      const entered = await photoFrame.enterPhotoFrameMode();

      expect(entered).toBe(false);
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it("should stay on the dashboard when the photo list cannot be loaded", async () => {
      enable();
      mockImagesStore.fetchImages.mockRejectedValue(new Error("offline"));

      const photoFrame = usePhotoFrameMode();
      const entered = await photoFrame.enterPhotoFrameMode();

      expect(entered).toBe(false);
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
    });
  });

  describe("waking the frame", () => {
    const enterAndListen = async () => {
      enable();
      const photoFrame = usePhotoFrameMode();
      photoFrame.setupEventListeners();
      await photoFrame.enterPhotoFrameMode();
      return photoFrame;
    };

    it("swallows the key that wakes the screen", async () => {
      const photoFrame = await enterAndListen();
      const event = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });

      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(mockModeStore.exitFullscreen).toHaveBeenCalled();
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });

    it("swallows the whole tap gesture, not just its first event", async () => {
      const photoFrame = await enterAndListen();
      const gesture = ["pointerdown", "touchstart", "mousedown", "click"].map(
        type => new Event(type, { cancelable: true, bubbles: true })
      );

      for (const event of gesture) window.dispatchEvent(event);

      for (const event of gesture) expect(event.defaultPrevented).toBe(true);
      expect(mockModeStore.exitFullscreen).toHaveBeenCalledTimes(1);
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });

    it("ends the wake window on release so the next real tap is not eaten", async () => {
      await enterAndListen();
      const down = new Event("pointerdown", { cancelable: true, bubbles: true });
      window.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);

      // No click (a drag/long-press): the release closes the window.
      const up = new Event("pointerup", { cancelable: true, bubbles: true });
      window.dispatchEvent(up);
      expect(up.defaultPrevented).toBe(true);
      // The trailing click of this gesture is still swallowed ...
      const click = new Event("click", { cancelable: true, bubbles: true });
      window.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);

      // ... and the window closes right after it.
      await vi.advanceTimersByTimeAsync(0);

      const nextTap = new Event("pointerdown", { cancelable: true, bubbles: true });
      window.dispatchEvent(nextTap);
      expect(nextTap.defaultPrevented).toBe(false);
    });

    it("lets modifier-only keys and browser chords through", async () => {
      await enterAndListen();
      const shift = new KeyboardEvent("keydown", { key: "Shift", cancelable: true });
      window.dispatchEvent(shift);
      expect(shift.defaultPrevented).toBe(false);
      expect(mockModeStore.exitFullscreen).toHaveBeenCalledTimes(1);

      // Re-enter for the browser chord.
      await enterAndListen();
      const reload = new KeyboardEvent("keydown", { key: "r", ctrlKey: true, cancelable: true });
      window.dispatchEvent(reload);
      expect(reload.defaultPrevented).toBe(false);
    });

    it("registers non-passive wake listeners only while the frame is up", async () => {
      enable();
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      const photoFrame = usePhotoFrameMode();
      photoFrame.setupEventListeners();

      const pointerdownOptions = () =>
        add.mock.calls.filter(([type]) => type === "pointerdown").map(([, , options]) => options);
      expect(pointerdownOptions()).toEqual([{ capture: true, passive: true }]);

      await photoFrame.enterPhotoFrameMode();
      expect(pointerdownOptions()).toContainEqual({ capture: true, passive: false });

      const key = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });
      window.dispatchEvent(key);
      expect(
        remove.mock.calls.some(([type, , options]) => type === "pointerdown" && options?.capture)
      ).toBe(true);
    });
  });

  describe("exitPhotoFrameMode", () => {
    it("should exit photo frame mode", () => {
      const photoFrame = usePhotoFrameMode();

      // Manually set active state (bypassing enterPhotoFrameMode)
      photoFrame.isPhotoFrameActive.value = true;

      photoFrame.exitPhotoFrameMode();

      expect(mockModeStore.exitFullscreen).toHaveBeenCalled();
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
      expect(mockRouter.push).toHaveBeenCalledWith("/");
    });

    it("should not exit if already inactive", () => {
      const photoFrame = usePhotoFrameMode();
      photoFrame.isPhotoFrameActive.value = false;

      const exitCallCount = mockModeStore.exitFullscreen.mock.calls.length;

      photoFrame.exitPhotoFrameMode();

      expect(mockModeStore.exitFullscreen).toHaveBeenCalledTimes(exitCallCount);
    });

    it("should reset timer after exiting", async () => {
      enable({ timeout: 5 });

      const photoFrame = usePhotoFrameMode();

      // Manually set active state (bypassing enterPhotoFrameMode)
      photoFrame.isPhotoFrameActive.value = true;

      photoFrame.exitPhotoFrameMode();

      // Wait for throttling from exit
      await vi.advanceTimersByTimeAsync(600);

      // Timer should be reset, so we need to wait the full timeout
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe("handleActivity", () => {
    it("should reset inactivity timer on activity", async () => {
      enable({ timeout: 5 });

      const photoFrame = usePhotoFrameMode();

      // Start timer
      photoFrame.resetInactivityTimer();

      // Simulate activity before timeout
      await vi.advanceTimersByTimeAsync(3000);
      photoFrame.resetInactivityTimer();

      // Wait for throttling
      await vi.advanceTimersByTimeAsync(600);

      // Should not have entered photo frame yet
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();

      // Need to wait full timeout again (the timer was reset)
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe("Config watching", () => {
    it("should stop timer when photo frame is disabled", () => {
      enable({ timeout: 5 });

      const photoFrame = usePhotoFrameMode();
      photoFrame.resetInactivityTimer();

      // Disable photo frame
      mockConfigStore.photoFrameEnabled = false;
      photoFrame.exitPhotoFrameMode();

      vi.advanceTimersByTime(10000);

      // Should not enter photo frame after disabling
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
    });
  });

  describe("Lifecycle hooks", () => {
    it("should fetch config on mount", async () => {
      const _photoFrame = usePhotoFrameMode();

      // Simulate onMounted
      await mockConfigStore.fetchConfig();

      expect(mockConfigStore.fetchConfig).toHaveBeenCalled();
    });

    it("should initialize timer on mount if photo frame is enabled", async () => {
      enable({ timeout: 5 });

      const photoFrame = usePhotoFrameMode();

      await mockConfigStore.fetchConfig();
      photoFrame.resetInactivityTimer();

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });
});
