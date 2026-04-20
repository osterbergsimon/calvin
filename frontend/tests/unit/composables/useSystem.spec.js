/**
 * Unit tests for useSystem composable
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useSystem } from "@/composables/useSystem";
import * as systemApi from "@/services/systemApi";

// Mock systemApi
vi.mock("@/services/systemApi", () => ({
  turnDisplayOn: vi.fn(),
  turnDisplayOff: vi.fn(),
  configureDisplayTimeout: vi.fn(),
  restartBackend: vi.fn(),
  restartFrontend: vi.fn(),
  triggerUpdate: vi.fn(),
  getUpdateStatus: vi.fn(),
  getHealth: vi.fn(),
}));

describe("useSystem", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Initialization", () => {
    it("should initialize with default values", () => {
      const system = useSystem();

      expect(system.displayOn.value).toBe(false);
      expect(system.displayTimeout.value).toBe(0);
      expect(system.displayTimeoutEnabled.value).toBe(false);
      expect(system.updating.value).toBe(false);
      expect(system.updateStatus.value).toBe(null);
      expect(system.updateMessage.value).toBe("");
      expect(system.updateMessageClass.value).toBe("");
    });
  });

  describe("turnDisplayOn", () => {
    it("should turn display on", async () => {
      systemApi.turnDisplayOn.mockResolvedValue({});

      const system = useSystem();
      await system.turnDisplayOn();

      expect(systemApi.turnDisplayOn).toHaveBeenCalled();
      expect(system.displayOn.value).toBe(true);
    });

    it("should handle errors when turning display on", async () => {
      const error = new Error("Failed to turn display on");
      systemApi.turnDisplayOn.mockRejectedValue(error);

      const system = useSystem();

      await expect(system.turnDisplayOn()).rejects.toThrow(
        "Failed to turn display on",
      );
      expect(system.displayOn.value).toBe(false);
    });
  });

  describe("turnDisplayOff", () => {
    it("should turn display off", async () => {
      systemApi.turnDisplayOff.mockResolvedValue({});

      const system = useSystem();
      await system.turnDisplayOff();

      expect(systemApi.turnDisplayOff).toHaveBeenCalled();
      expect(system.displayOn.value).toBe(false);
    });

    it("should handle errors when turning display off", async () => {
      const error = new Error("Failed to turn display off");
      systemApi.turnDisplayOff.mockRejectedValue(error);

      const system = useSystem();

      await expect(system.turnDisplayOff()).rejects.toThrow(
        "Failed to turn display off",
      );
    });
  });

  describe("configureDisplayTimeout", () => {
    it("should configure display timeout", async () => {
      systemApi.configureDisplayTimeout.mockResolvedValue({});

      const system = useSystem();
      await system.configureDisplayTimeout(300);

      expect(systemApi.configureDisplayTimeout).toHaveBeenCalledWith(300);
      expect(system.displayTimeout.value).toBe(300);
    });

    it("should handle errors when configuring timeout", async () => {
      const error = new Error("Failed to configure timeout");
      systemApi.configureDisplayTimeout.mockRejectedValue(error);

      const system = useSystem();

      await expect(system.configureDisplayTimeout(300)).rejects.toThrow(
        "Failed to configure timeout",
      );
    });
  });

  describe("restartBackend", () => {
    it("should restart backend successfully", async () => {
      systemApi.restartBackend.mockResolvedValue({
        message: "Backend restart scheduled.",
      });

      const system = useSystem();
      await system.restartBackend();

      expect(systemApi.restartBackend).toHaveBeenCalled();
      expect(system.updateMessage.value).toBe("Backend restart scheduled.");
      expect(system.updateMessageClass.value).toBe("success");

      // Fast-forward to clear message
      vi.advanceTimersByTime(5000);

      expect(system.updateMessage.value).toBe("");
      expect(system.updateMessageClass.value).toBe("");
    });

    it("should handle errors when restarting backend", async () => {
      const error = new Error("Failed to restart");
      systemApi.restartBackend.mockRejectedValue(error);

      const system = useSystem();

      await expect(system.restartBackend()).rejects.toThrow(
        "Failed to restart",
      );
      expect(system.updateMessage.value).toBe("Failed to restart backend");
      expect(system.updateMessageClass.value).toBe("error");
    });
  });

  describe("restartFrontend", () => {
    it("should restart frontend successfully", async () => {
      systemApi.restartFrontend.mockResolvedValue({
        message: "Frontend service restart initiated.",
      });

      const system = useSystem();
      await system.restartFrontend();

      expect(systemApi.restartFrontend).toHaveBeenCalled();
      expect(system.updateMessage.value).toBe(
        "Frontend service restart initiated.",
      );
      expect(system.updateMessageClass.value).toBe("success");

      // Fast-forward to clear message
      vi.advanceTimersByTime(5000);

      expect(system.updateMessage.value).toBe("");
      expect(system.updateMessageClass.value).toBe("");
    });

    it("should handle errors when restarting frontend", async () => {
      const error = new Error("Failed to restart");
      systemApi.restartFrontend.mockRejectedValue(error);

      const system = useSystem();

      await expect(system.restartFrontend()).rejects.toThrow(
        "Failed to restart",
      );
      expect(system.updateMessage.value).toBe("Failed to restart frontend");
      expect(system.updateMessageClass.value).toBe("error");
    });
  });

  describe("triggerUpdate", () => {
    it("should trigger update and update status", async () => {
      systemApi.triggerUpdate.mockResolvedValue({});
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      // Mock getUpdateStatus to return idle (completed) status immediately
      systemApi.getUpdateStatus.mockResolvedValue({
        status: "idle",
        message: "Update completed",
      });

      const system = useSystem();
      await system.triggerUpdate();

      // Test functionality: update was triggered, status was checked, message was set
      expect(systemApi.triggerUpdate).toHaveBeenCalled();
      expect(system.updating.value).toBe(false); // Should be false after completion
      expect(system.updateStatus.value?.status).toBe("idle");
      expect(system.updateMessage.value).toContain("completed successfully");
    });

    it("should handle update errors", async () => {
      const error = new Error("Update failed");
      systemApi.triggerUpdate.mockRejectedValue(error);

      const system = useSystem();
      await system.triggerUpdate();

      expect(system.updating.value).toBe(false);
      expect(system.updateMessage.value).toBe("Update failed");
      expect(system.updateMessageClass.value).toBe("error");
    });

    it("should handle update status errors", async () => {
      systemApi.triggerUpdate.mockResolvedValue({});
      systemApi.getUpdateStatus.mockResolvedValue({
        status: "error",
        message: "Update failed",
      });

      const system = useSystem();
      await system.triggerUpdate();

      expect(system.updateMessage.value).toBe("Update failed: Update failed");
      expect(system.updateMessageClass.value).toBe("error");
    });
  });

  describe("getUpdateStatus", () => {
    it("should get update status", async () => {
      const mockStatus = {
        status: "running",
        message: "Updating...",
      };

      systemApi.getUpdateStatus.mockResolvedValue(mockStatus);

      const system = useSystem();
      const status = await system.getUpdateStatus();

      expect(systemApi.getUpdateStatus).toHaveBeenCalled();
      expect(status).toEqual(mockStatus);
      expect(system.updateStatus.value).toEqual(mockStatus);
    });

    it("should handle errors when getting update status", async () => {
      const error = new Error("Failed to get status");
      systemApi.getUpdateStatus.mockRejectedValue(error);

      const system = useSystem();

      await expect(system.getUpdateStatus()).rejects.toThrow(
        "Failed to get status",
      );
    });
  });

  describe("pollUpdateStatus", () => {
    it("should check update status and update store", async () => {
      const mockStatus = {
        status: "idle",
        message: "Update completed",
      };
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      systemApi.getUpdateStatus.mockResolvedValue(mockStatus);

      const system = useSystem();
      await system.pollUpdateStatus();

      // Test functionality: status was checked and stored
      expect(systemApi.getUpdateStatus).toHaveBeenCalled();
      expect(system.updateStatus.value).toEqual(mockStatus);
      expect(system.updateMessage.value).toContain("completed successfully");
    });

    it("should handle in-progress status", async () => {
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      systemApi.getUpdateStatus
        .mockResolvedValueOnce({ status: "running", message: "Updating…" })
        .mockResolvedValueOnce({ status: "idle", message: "Done" });

      const system = useSystem();
      const p = system.pollUpdateStatus();
      await vi.runAllTimersAsync();
      await p;

      // Test functionality: transitions from running -> idle
      expect(system.updateStatus.value?.status).toBe("idle");
      expect(system.updateMessage.value).toContain("completed successfully");
      expect(systemApi.getUpdateStatus).toHaveBeenCalledTimes(2);
    });

    it("should handle error status", async () => {
      systemApi.getUpdateStatus.mockResolvedValue({
        status: "error",
        message: "Update failed",
      });

      const system = useSystem();
      await system.pollUpdateStatus();

      // Test functionality: error status is stored and message is set
      expect(system.updateStatus.value?.status).toBe("error");
      expect(system.updateMessage.value).toContain("Update failed");
      expect(system.updateMessageClass.value).toBe("error");
    });
  });
});
