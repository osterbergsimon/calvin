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
  getUpdateStreamUrl: vi.fn(() => "/api/system/update/stream"),
}));

// Minimal EventSource stub for the streaming update flow. Tests drive
// .onmessage / .onerror on FakeEventSource.last to simulate server events.
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    FakeEventSource.last = this;
  }
  close() {
    this.closed = true;
  }
}
FakeEventSource.last = null;
globalThis.EventSource = FakeEventSource;

// Stub window.location.reload — restart flows call it on success.
const reloadSpy = vi.fn();
Object.defineProperty(window, "location", {
  configurable: true,
  value: { reload: reloadSpy },
});

describe("useSystem", () => {
  beforeEach(() => {
    // restoreAllMocks (not resetAllMocks) so vi.spyOn-created spies revert to
    // their original implementations between tests — otherwise globals like
    // Date.now and setTimeout get stubbed out for the whole file.
    vi.restoreAllMocks();
    vi.useFakeTimers();
    FakeEventSource.last = null;
    reloadSpy.mockClear();
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
      expect(system.updateStatusLoading.value).toBe(false);
      expect(system.updateMessage.value).toBe("");
      expect(system.updateMessageClass.value).toBe("");
      expect(system.backendHealth.value).toBe(null);
      expect(system.backendHealthLoading.value).toBe(false);
    });
  });

  describe("getBackendHealth", () => {
    it("stores healthy backend status", async () => {
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });

      const system = useSystem();
      const health = await system.getBackendHealth();

      expect(systemApi.getHealth).toHaveBeenCalled();
      expect(health.status).toBe("healthy");
      expect(system.backendHealth.value.status).toBe("healthy");
      expect(system.backendHealthCheckedAt.value).toBeTruthy();
    });

    it("stores unhealthy backend status on health check failure", async () => {
      systemApi.getHealth.mockRejectedValue(new Error("down"));

      const system = useSystem();
      const health = await system.getBackendHealth();

      expect(health.status).toBe("unhealthy");
      expect(system.backendHealth.value.error).toBe("down");
      expect(system.backendHealthLoading.value).toBe(false);
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

      await expect(system.turnDisplayOn()).rejects.toThrow("Failed to turn display on");
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

      await expect(system.turnDisplayOff()).rejects.toThrow("Failed to turn display off");
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
        "Failed to configure timeout"
      );
    });
  });

  // Restart flows call `await sleep(N)` (2000ms then 1500ms) and a health-poll
  // loop. We stub setTimeout to fire callbacks immediately ONLY for the
  // sleep durations the flow uses — leaving the message-clear timers (8000,
  // 12000) parked so they don't wipe the message before assertions.
  const stubSleepTimers = () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms) => {
      if (ms === 2000 || ms === 1500) {
        fn();
        return 0;
      }
      return Math.floor(Math.random() * 1_000_000);
    });
  };

  describe("restartBackend", () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it("calls systemApi.restartBackend, waits for health, and reloads on success", async () => {
      systemApi.restartBackend.mockResolvedValue({});
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      stubSleepTimers();

      const system = useSystem();
      await system.restartBackend();

      expect(systemApi.restartBackend).toHaveBeenCalled();
      expect(systemApi.getHealth).toHaveBeenCalled();
      expect(system.updateMessageClass.value).toBe("success");
      expect(reloadSpy).toHaveBeenCalled();
    });

    it("sets a warning when backend never comes back healthy", async () => {
      systemApi.restartBackend.mockResolvedValue({});
      systemApi.getHealth.mockRejectedValue(new Error("down"));
      // Drive Date.now forward so the health-poll loop's timeoutMs check
      // exits after a couple of iterations rather than running for real.
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => {
        now += 30_000;
        return now;
      });
      stubSleepTimers();

      const system = useSystem();
      await system.restartBackend();

      expect(system.updateMessageClass.value).toBe("warning");
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("sets error message when restart returns an HTTP error response", async () => {
      const error = new Error("Failed to restart");
      error.response = { data: { detail: "Service unavailable" } };
      systemApi.restartBackend.mockRejectedValue(error);

      const system = useSystem();
      await system.restartBackend();

      expect(system.updateMessage.value).toBe("Service unavailable");
      expect(system.updateMessageClass.value).toBe("error");
      expect(systemApi.getHealth).not.toHaveBeenCalled();
    });

    it("treats a network error (no response) as a successful initiation", async () => {
      // Backend killed itself before sending the response — fall through to
      // the health-poll branch.
      systemApi.restartBackend.mockRejectedValue(new Error("ECONNRESET"));
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      stubSleepTimers();

      const system = useSystem();
      await system.restartBackend();

      expect(systemApi.getHealth).toHaveBeenCalled();
      expect(system.updateMessageClass.value).toBe("success");
    });
  });

  describe("restartFrontend", () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it("calls systemApi.restartFrontend, waits for health, and reloads on success", async () => {
      systemApi.restartFrontend.mockResolvedValue({});
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      stubSleepTimers();

      const system = useSystem();
      await system.restartFrontend();

      expect(systemApi.restartFrontend).toHaveBeenCalled();
      expect(system.updateMessageClass.value).toBe("success");
      expect(reloadSpy).toHaveBeenCalled();
    });

    it("sets error message when restart returns an HTTP error response", async () => {
      const error = new Error("Failed to restart");
      error.response = { data: { detail: "Service unavailable" } };
      systemApi.restartFrontend.mockRejectedValue(error);

      const system = useSystem();
      await system.restartFrontend();

      expect(system.updateMessage.value).toBe("Service unavailable");
      expect(system.updateMessageClass.value).toBe("error");
    });
  });

  describe("triggerUpdate", () => {
    // Resolve once FakeEventSource.last has been populated by the call to
    // streamUpdateStatus, then fire a single SSE message.
    const fireStreamEvent = async statusEvent => {
      while (!FakeEventSource.last) {
        await Promise.resolve();
      }
      FakeEventSource.last.onmessage({ data: JSON.stringify(statusEvent) });
    };

    it("streams update progress and reports success when backend comes back", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      // Use real timers; the happy path doesn't actually wait on any timer
      // (waitForBackendHealthy returns true on first getHealth).
      vi.useRealTimers();

      const system = useSystem();
      const promise = system.triggerUpdate();

      await fireStreamEvent({ type: "status", status: "complete" });
      await promise;

      expect(systemApi.triggerUpdate).toHaveBeenCalled();
      expect(system.updating.value).toBe(false);
      expect(system.updateMessage.value).toContain("completed successfully");
      expect(system.updateMessageClass.value).toBe("success");
    });

    it("sets an error message when triggerUpdate itself fails", async () => {
      systemApi.triggerUpdate.mockRejectedValue(new Error("Update failed"));

      const system = useSystem();
      await system.triggerUpdate();

      expect(system.updating.value).toBe(false);
      expect(system.updateMessage.value).toBe("Update failed");
      expect(system.updateMessageClass.value).toBe("error");
    });

    it("sets an error message when the stream reports status=error", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      vi.useRealTimers();

      const system = useSystem();
      const promise = system.triggerUpdate();

      await fireStreamEvent({
        type: "status",
        status: "error",
        message: "Build failed",
      });
      await promise;

      expect(system.updateMessage.value).toBe("Update failed: Build failed");
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

      await expect(system.getUpdateStatus()).rejects.toThrow("Failed to get status");
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
