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
      // Raw detail stays for the Settings › Details line; the readout is friendly.
      expect(system.backendHealth.value.error).toBe("down");
      expect(system.backendHealth.value.errorText).toBe(
        "Couldn't reach Calvin. Check that it's running and on the same network."
      );
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
      error.response = { status: 500, data: { detail: "Service unavailable" } };
      systemApi.restartBackend.mockRejectedValue(error);

      const system = useSystem();
      await system.restartBackend();

      // A 5xx detail is server text, not copy (CLV-63).
      expect(system.updateMessage.value).toBe(
        "Something went wrong on the Calvin server while trying to restart Calvin."
      );
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

    it("shows a validation detail written for people", async () => {
      const error = new Error("Failed to restart");
      error.response = { status: 422, data: { detail: "Service unavailable" } };
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
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
      expect(system.updateMessageClass.value).toBe("success");
    });

    it("sets an error message when triggerUpdate itself fails", async () => {
      systemApi.triggerUpdate.mockRejectedValue(new Error("Update failed"));

      const system = useSystem();
      await system.triggerUpdate();

      expect(system.updating.value).toBe(false);
      expect(system.updateMessage.value).toBe(
        "Couldn't reach Calvin. Check that it's running and on the same network."
      );
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

      expect(system.updateMessage.value).toBe(
        "The update didn't finish. Calvin is still on the previous version."
      );
      expect(system.updateMessageClass.value).toBe("error");
    });

    it("keeps streaming when the server sends a running state snapshot", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      vi.useRealTimers();

      const system = useSystem();
      const promise = system.triggerUpdate();

      await fireStreamEvent({
        type: "status",
        status: "running",
        message: "Pulling latest code",
        state: {
          status: "running",
          phase: "pulling_code",
          message: "Pulling latest code",
        },
      });

      expect(FakeEventSource.last.closed).toBe(false);
      expect(system.updateStatus.value.phase).toBe("pulling_code");
      // The phase in plain words, not the script's own message (CLV-63).
      expect(system.updateMessage.value).toBe("Downloading the update…");
      expect(system.updateStage.value).toBe("running");

      await fireStreamEvent({ type: "status", status: "complete" });
      await promise;

      expect(system.updateMessageClass.value).toBe("success");
    });

    it("ignores a second Update now while one is running", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      vi.useRealTimers();

      const system = useSystem();
      const first = system.triggerUpdate();
      while (!FakeEventSource.last) {
        await Promise.resolve();
      }

      await system.triggerUpdate();

      expect(systemApi.triggerUpdate).toHaveBeenCalledTimes(1);

      FakeEventSource.last.onmessage({ data: JSON.stringify({ type: "status", status: "error" }) });
      await first;
    });

    it("ignores a late event after the update has settled", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      vi.useRealTimers();

      const system = useSystem();
      const promise = system.triggerUpdate();
      await fireStreamEvent({ type: "status", status: "complete" });
      await promise;
      expect(system.updateStage.value).toBe("done");
      expect(system.updateMessage.value).toBe("Calvin is up to date.");

      // A line buffered on the stream can land after the close: it must not
      // turn "up to date" back into "updating".
      await fireStreamEvent({ type: "log", line: "update complete!" });
      await fireStreamEvent({ type: "status", status: "running", phase: "restarting" });

      expect(system.updateStage.value).toBe("done");
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
      expect(system.updateMessageClass.value).toBe("success");
    });

    it("starts no second polling loop when asked about a running update", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });

      const system = useSystem();
      const promise = system.triggerUpdate();
      await fireStreamEvent({ type: "status", status: "running", phase: "pulling_code" });

      // pollUpdateStatus is for an update this page did not start; the running
      // one already follows its own stream.
      const polling = system.pollUpdateStatus();
      expect(systemApi.getUpdateStatus).not.toHaveBeenCalled();
      await polling;

      await fireStreamEvent({ type: "status", status: "error" });
      await promise;
      expect(system.updateMessageClass.value).toBe("error");
    });
  });

  describe("triggerUpdate when the live stream drops", () => {
    const dropStream = async () => {
      while (!FakeEventSource.last) {
        await Promise.resolve();
      }
      FakeEventSource.last.onerror();
    };

    it("does not call a dropped stream a finished update: it asks the server", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      systemApi.getUpdateStatus
        .mockResolvedValueOnce({ status: "running", phase: "refreshing_host" })
        .mockResolvedValueOnce({ status: "idle", phase: "complete" });

      const system = useSystem();
      const promise = system.triggerUpdate();
      await dropStream();
      await vi.advanceTimersByTimeAsync(0);

      // Still updating after the drop: no "up to date" while the server runs.
      expect(system.updating.value).toBe(true);
      expect(system.updateMessage.value).not.toBe("Calvin is up to date.");
      expect(system.updateMessage.value).toBe("Installing…");

      await vi.runAllTimersAsync();
      await promise;
      expect(systemApi.getUpdateStatus).toHaveBeenCalledTimes(2);
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
      expect(system.updating.value).toBe(false);
    });

    it("reports a failure the server recorded after the stream dropped", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getUpdateStatus.mockResolvedValue({ status: "error", phase: "rollback" });

      const system = useSystem();
      const promise = system.triggerUpdate();
      await dropStream();
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(systemApi.getHealth).not.toHaveBeenCalled();
      expect(system.updateMessage.value).toBe(
        "The update didn't finish. Calvin is still on the previous version."
      );
      expect(system.updateMessageClass.value).toBe("error");
      expect(system.updating.value).toBe(false);
      // A failure clears itself after a while, as before.
      await vi.advanceTimersByTimeAsync(8000);
      expect(system.updateMessage.value).toBe("");
    });

    it("waits for Calvin while it restarts, then confirms", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth
        .mockRejectedValueOnce(new Error("Network Error"))
        .mockResolvedValue({ status: "healthy" });
      systemApi.getUpdateStatus
        .mockRejectedValueOnce(new Error("Network Error"))
        .mockResolvedValueOnce({ status: "idle" });

      const system = useSystem();
      const promise = system.triggerUpdate();
      await dropStream();
      await vi.advanceTimersByTimeAsync(0);
      expect(system.updateMessage.value).toBe("Calvin is restarting. This takes about 15 seconds.");

      await vi.runAllTimersAsync();
      await promise;
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
    });

    it("does not say Calvin is restarting when only the status check fails", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      const error = new Error("Request failed with status code 500");
      error.response = { status: 500 };
      systemApi.getUpdateStatus.mockRejectedValueOnce(error).mockResolvedValueOnce({
        status: "idle",
      });

      const system = useSystem();
      const promise = system.triggerUpdate();
      await dropStream();
      await vi.advanceTimersByTimeAsync(0);

      // Calvin answered the health check, so the restart hasn't happened yet.
      expect(systemApi.getHealth).toHaveBeenCalled();
      expect(system.updateMessage.value).toBe("Checking on the update…");
      expect(system.updateMessage.value).not.toBe(
        "Calvin is restarting. This takes about 15 seconds."
      );

      await vi.runAllTimersAsync();
      await promise;
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
    });

    it("shows the checking wording when the status is unknown but Calvin answers", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      systemApi.getUpdateStatus
        .mockResolvedValueOnce({ status: "unknown" })
        .mockResolvedValueOnce({ status: "idle" });

      const system = useSystem();
      const promise = system.triggerUpdate();
      await dropStream();
      await vi.advanceTimersByTimeAsync(0);

      expect(system.updateMessage.value).toBe("Checking on the update…");

      await vi.runAllTimersAsync();
      await promise;
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
    });

    it("gives up after ten minutes with the taking-longer message", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      systemApi.getUpdateStatus.mockResolvedValue({ status: "unknown" });

      const system = useSystem();
      const promise = system.triggerUpdate();
      await dropStream();
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 10 * 1000);
      await promise;

      expect(system.updateMessage.value).toBe(
        "The update is taking longer than usual. Leave it running and check back later."
      );
      expect(system.updateMessageClass.value).toBe("warning");
      expect(system.updateStage.value).toBe("slow");
      expect(system.updating.value).toBe(false);

      // The poll is over: no further status checks after the timeout.
      const checks = systemApi.getUpdateStatus.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(systemApi.getUpdateStatus).toHaveBeenCalledTimes(checks);
    });

    it("follows the server when the stream fails before any event arrives", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });
      systemApi.getUpdateStatus
        .mockResolvedValueOnce({ status: "running", phase: "pulling_code" })
        .mockResolvedValueOnce({ status: "idle" });

      const system = useSystem();
      const promise = system.triggerUpdate();

      // No event ever arrives: the connection just fails.
      await dropStream();
      await vi.advanceTimersByTimeAsync(0);

      expect(system.updateStage.value).toBe("running");
      expect(system.updateMessage.value).toBe("Downloading the update…");
      expect(system.updateMessage.value).not.toBe("Calvin is up to date.");

      await vi.runAllTimersAsync();
      await promise;
      expect(systemApi.getUpdateStatus).toHaveBeenCalledTimes(2);
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
    });

    it("says in plain words when the update is going back to the previous version", async () => {
      systemApi.triggerUpdate.mockResolvedValue({ log_offset: 0 });
      vi.useRealTimers();
      const system = useSystem();
      const promise = system.triggerUpdate();
      while (!FakeEventSource.last) {
        await Promise.resolve();
      }
      FakeEventSource.last.onmessage({
        data: JSON.stringify({ type: "status", status: "running", phase: "rollback" }),
      });
      expect(system.updateMessage.value).toBe(
        "The new version didn't start. Going back to the previous one…"
      );
      FakeEventSource.last.onmessage({ data: JSON.stringify({ type: "status", status: "error" }) });
      await promise;
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
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
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
      expect(system.updateMessage.value).toBe("Calvin is up to date.");
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
      expect(system.updateMessage.value).toBe(
        "The update didn't finish. Calvin is still on the previous version."
      );
      expect(system.updateMessageClass.value).toBe("error");
    });
  });

  describe("following an update that is already running", () => {
    it("leaves the message and its clear timer alone on a repeated reachable", async () => {
      systemApi.getUpdateStatus.mockResolvedValue({ status: "unknown" });
      systemApi.getHealth.mockResolvedValue({ status: "healthy" });

      const system = useSystem();
      const polling = system.pollUpdateStatus();
      await vi.advanceTimersByTimeAsync(0);
      expect(system.updateStage.value).toBe("following");

      // The message line and its clear timer are shared with the restart
      // flows, so a follow poll that changes nothing must not cancel one.
      const error = new Error("restart failed");
      error.response = { status: 422, data: { detail: "Service unavailable" } };
      systemApi.restartFrontend.mockRejectedValue(error);
      await system.restartFrontend();
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");

      await vi.advanceTimersByTimeAsync(5000);

      expect(system.updateStage.value).toBe("following");
      expect(clearSpy).not.toHaveBeenCalled();
      expect(system.updateMessage.value).toBe("Service unavailable");

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      await polling;
    });
  });

  describe("host control message", () => {
    it("shows the structured 409 message instead of [object Object]", async () => {
      const message =
        "Restarting the backend is disabled on this deployment. Set CALVIN_HOST_CONTROL=1 if Calvin owns this machine.";
      const error = new Error("conflict");
      error.response = {
        status: 409,
        data: { detail: { code: "host_control_disabled", message } },
      };
      systemApi.restartBackend.mockRejectedValue(error);

      const system = useSystem();
      await system.restartBackend();

      expect(system.updateMessage.value).toBe(message);
      expect(system.updateMessageClass.value).toBe("error");
      expect(systemApi.getHealth).not.toHaveBeenCalled();
    });
  });
});
