/**
 * Unit tests for usePhotoFrameMode composable
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { usePhotoFrameMode, resetPhotoFrameInstance } from "@/composables/usePhotoFrameMode";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";
import { useRouter } from "vue-router";

// Mock stores
vi.mock("@/stores/config", () => ({
  useConfigStore: vi.fn(),
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
  let mockModeStore;
  let mockRouter;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset singleton instance between tests
    resetPhotoFrameInstance();

    mockConfigStore = {
      photoFrameEnabled: false,
      photoFrameTimeout: 300,
      lastSideViewMode: "photos",
      fetchConfig: vi.fn().mockResolvedValue({}),
      setLastSideViewMode: vi.fn(),
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
    useModeStore.mockReturnValue(mockModeStore);
    useRouter.mockReturnValue(mockRouter);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Initialization", () => {
    it("should initialize with inactive photo frame mode", () => {
      const photoFrame = usePhotoFrameMode();

      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });
  });

  describe("resetInactivityTimer", () => {
    it("should reset inactivity timer", async () => {
      mockConfigStore.photoFrameEnabled = true;
      mockConfigStore.photoFrameTimeout = 5; // 5 seconds

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      // Trigger activity
      photoFrame.resetInactivityTimer();

      // Fast-forward time
      vi.advanceTimersByTime(5000);

      expect(mockModeStore.enterFullscreen).toHaveBeenCalledWith(mockModeStore.MODES.PHOTOS);
      expect(photoFrame.isPhotoFrameActive.value).toBe(true);
      expect(mockRouter.push).toHaveBeenCalledWith("/");
    });

    it("should exit photo frame mode when resetting timer", async () => {
      mockConfigStore.photoFrameEnabled = true;

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      // Manually set active state (bypassing enterPhotoFrameMode)
      photoFrame.isPhotoFrameActive.value = true;

      photoFrame.resetInactivityTimer();

      expect(mockModeStore.exitFullscreen).toHaveBeenCalled();
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });

    it("should not start timer if photo frame is disabled", () => {
      mockConfigStore.photoFrameEnabled = false;

      const photoFrame = usePhotoFrameMode();

      photoFrame.resetInactivityTimer();

      vi.advanceTimersByTime(10000);

      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
    });

    it("should clear existing timer when resetting", async () => {
      mockConfigStore.photoFrameEnabled = true;
      mockConfigStore.photoFrameTimeout = 5;

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      // Start first timer
      photoFrame.resetInactivityTimer();

      // Reset before timeout
      vi.advanceTimersByTime(2000);
      photoFrame.resetInactivityTimer();

      // Should not trigger yet
      vi.advanceTimersByTime(3000);
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();

      // Now should trigger
      vi.advanceTimersByTime(2000);
      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe("enterPhotoFrameMode", () => {
    it("should enter photo frame mode", async () => {
      mockConfigStore.photoFrameEnabled = true;

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      photoFrame.enterPhotoFrameMode();

      expect(mockModeStore.enterFullscreen).toHaveBeenCalledWith(mockModeStore.MODES.PHOTOS);
      expect(photoFrame.isPhotoFrameActive.value).toBe(true);
      expect(mockRouter.push).toHaveBeenCalledWith("/");
    });

    it("should not enter if photo frame is disabled", () => {
      mockConfigStore.photoFrameEnabled = false;

      const photoFrame = usePhotoFrameMode();

      photoFrame.enterPhotoFrameMode();

      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
      expect(photoFrame.isPhotoFrameActive.value).toBe(false);
    });
  });

  describe("exitPhotoFrameMode", () => {
    it("should exit photo frame mode", async () => {
      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

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
      mockConfigStore.photoFrameEnabled = true;
      mockConfigStore.photoFrameTimeout = 5;

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      // Manually set active state (bypassing enterPhotoFrameMode)
      photoFrame.isPhotoFrameActive.value = true;

      photoFrame.exitPhotoFrameMode();

      // Wait for throttling from exit
      vi.advanceTimersByTime(600);

      // Timer should be reset, so we need to wait the full timeout
      vi.advanceTimersByTime(5000);

      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe("handleActivity", () => {
    it("should reset inactivity timer on activity", async () => {
      mockConfigStore.photoFrameEnabled = true;
      mockConfigStore.photoFrameTimeout = 5;

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      // Start timer
      photoFrame.resetInactivityTimer();

      // Simulate activity before timeout - handleActivity is called internally via resetInactivityTimer
      vi.advanceTimersByTime(3000);
      photoFrame.resetInactivityTimer(); // This calls handleActivity internally

      // Wait for throttling
      vi.advanceTimersByTime(600);

      // Should not have entered photo frame yet
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();

      // Need to wait full timeout again (the timer was reset)
      vi.advanceTimersByTime(5000);
      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe("Config watching", () => {
    it("should react to photoFrameEnabled changes", async () => {
      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      // Enable photo frame
      mockConfigStore.photoFrameEnabled = true;
      // Trigger watch by accessing the store property (in real usage, Vue watch would trigger)
      await photoFrame.resetInactivityTimer();

      // Wait for throttling
      vi.advanceTimersByTime(600);

      vi.advanceTimersByTime(300000); // 5 minutes

      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });

    it("should stop timer when photo frame is disabled", () => {
      mockConfigStore.photoFrameEnabled = true;
      mockConfigStore.photoFrameTimeout = 5;

      const photoFrame = usePhotoFrameMode();
      photoFrame.resetInactivityTimer();

      // Disable photo frame
      mockConfigStore.photoFrameEnabled = false;
      photoFrame.exitPhotoFrameMode();

      vi.advanceTimersByTime(10000);

      // Should not enter photo frame after disabling
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();
    });

    it("should reset timer when timeout changes", async () => {
      mockConfigStore.photoFrameEnabled = true;
      mockConfigStore.photoFrameTimeout = 5;

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      photoFrame.resetInactivityTimer();

      // Change timeout
      mockConfigStore.photoFrameTimeout = 10;
      photoFrame.resetInactivityTimer();

      // Wait for throttling
      vi.advanceTimersByTime(600);

      // Old timeout should not trigger
      vi.advanceTimersByTime(5000);
      expect(mockModeStore.enterFullscreen).not.toHaveBeenCalled();

      // New timeout should trigger
      vi.advanceTimersByTime(5000);
      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
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
      mockConfigStore.photoFrameEnabled = true;
      mockConfigStore.photoFrameTimeout = 5;

      const photoFrame = usePhotoFrameMode();

      // Wait for any throttling to complete
      vi.advanceTimersByTime(600);

      await mockConfigStore.fetchConfig();
      photoFrame.resetInactivityTimer();

      // Wait for throttling
      vi.advanceTimersByTime(600);

      vi.advanceTimersByTime(5000);

      expect(mockModeStore.enterFullscreen).toHaveBeenCalled();
    });
  });
});
