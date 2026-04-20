/**
 * Composable for system operations (display, restart, updates).
 */

import { ref } from "vue";
import * as systemApi from "../services/systemApi";

// Singleton refs so any component using useSystem() shares the same status
const updating = ref(false);
const updateStatus = ref(null);
const updateMessage = ref("");
const updateMessageClass = ref("");

export function useSystem() {
  const displayOn = ref(false);
  const displayTimeout = ref(0);
  const displayTimeoutEnabled = ref(false);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isUpdateDoneStatus = (status) => status === "idle";
  const isUpdateRunningStatus = (status) => status === "running";
  const isUpdateErrorStatus = (status) => status === "error";

  const waitForBackendHealthy = async ({
    timeoutMs = 120000,
    intervalMs = 2000,
  } = {}) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        await systemApi.getHealth();
        return true;
      } catch {
        // Backend may be restarting; keep waiting.
      }
      await sleep(intervalMs);
    }
    return false;
  };

  // Display power control
  const turnDisplayOn = async () => {
    try {
      await systemApi.turnDisplayOn();
      displayOn.value = true;
    } catch (error) {
      console.error("Failed to turn display on:", error);
      throw error;
    }
  };

  const turnDisplayOff = async () => {
    try {
      await systemApi.turnDisplayOff();
      displayOn.value = false;
    } catch (error) {
      console.error("Failed to turn display off:", error);
      throw error;
    }
  };

  const configureDisplayTimeout = async (timeout) => {
    try {
      await systemApi.configureDisplayTimeout(timeout);
      displayTimeout.value = timeout;
    } catch (error) {
      console.error("Failed to configure display timeout:", error);
      throw error;
    }
  };

  // System restart
  const restartBackend = async () => {
    updateMessage.value = "Restarting backend…";
    updateMessageClass.value = "info";
    try {
      await systemApi.restartBackend();
    } catch (error) {
      // A network error here means the backend killed itself before sending the
      // response (old behaviour). Treat it the same as a successful initiation.
      if (error.response) {
        updateMessage.value =
          error.response?.data?.detail || "Failed to restart backend";
        updateMessageClass.value = "error";
        console.error("Failed to restart backend:", error);
        return;
      }
      // No response → likely the process died mid-request; fall through.
    }
    updateMessage.value = "Backend restarting — waiting for it to come back…";
    updateMessageClass.value = "info";
    await sleep(2000); // give systemctl time to stop the service
    const healthy = await waitForBackendHealthy({ timeoutMs: 60000 });
    if (healthy) {
      updateMessage.value = "Backend restarted successfully! Reloading…";
      updateMessageClass.value = "success";
      await sleep(1500);
      window.location.reload();
    } else {
      updateMessage.value =
        "Backend not responding after restart. Check the service manually.";
      updateMessageClass.value = "warning";
    }
  };

  const restartFrontend = async () => {
    updateMessage.value = "Restarting frontend…";
    updateMessageClass.value = "info";
    try {
      await systemApi.restartFrontend();
    } catch (error) {
      if (error.response) {
        updateMessage.value =
          error.response?.data?.detail || "Failed to restart frontend";
        updateMessageClass.value = "error";
        console.error("Failed to restart frontend:", error);
        return;
      }
    }
    updateMessage.value = "Frontend restarting — reloading page shortly…";
    updateMessageClass.value = "info";
    await sleep(4000);
    window.location.reload();
  };

  // System updates
  const triggerUpdate = async () => {
    updating.value = true;
    updateMessage.value = "";
    updateMessageClass.value = "";

    try {
      await systemApi.triggerUpdate();
      updateMessage.value = "Update started. Check status below.";
      updateMessageClass.value = "info";
      // Poll for update status
      await pollUpdateStatus();
    } catch (error) {
      console.error("Failed to trigger update:", error);
      updateMessage.value =
        error.response?.data?.detail ||
        error.message ||
        "Failed to start update";
      updateMessageClass.value = "error";
    } finally {
      updating.value = false;
    }
  };

  const pollUpdateStatus = async () => {
    const timeoutMs = 10 * 60 * 1000; // 10 minutes
    const pollIntervalMs = 5000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const status = await systemApi.getUpdateStatus();
        updateStatus.value = status;

        if (isUpdateDoneStatus(status.status)) {
          // Script says update is complete; confirm backend is reachable after restart.
          updateMessage.value =
            "Update complete. Waiting for backend to come back…";
          updateMessageClass.value = "info";

          const healthy = await waitForBackendHealthy();
          if (!healthy) {
            updateMessage.value =
              "Update completed, but backend is not responding yet. Please wait or check logs.";
            updateMessageClass.value = "warning";
            return;
          }

          updateMessage.value = "Update completed successfully!";
          updateMessageClass.value = "success";
          return;
        }

        if (isUpdateErrorStatus(status.status)) {
          updateMessage.value = `Update failed: ${status.message || "Unknown error"}`;
          updateMessageClass.value = "error";
          return;
        }

        if (isUpdateRunningStatus(status.status)) {
          updateMessage.value = status.message || "Update in progress…";
          updateMessageClass.value = "info";
        }
      } catch (error) {
        // During restarts, the backend may be down; treat this as "waiting for health"
        console.warn(
          "Update status unavailable (backend may be restarting):",
          error,
        );
        updateMessage.value = "Backend restarting… waiting for /api/health";
        updateMessageClass.value = "warning";
        await waitForBackendHealthy({ timeoutMs: 60000, intervalMs: 2000 });
      }

      await sleep(pollIntervalMs);
    }

    updateMessage.value =
      "Update is taking longer than expected. Please check logs or try again later.";
    updateMessageClass.value = "warning";
  };

  const getUpdateStatus = async () => {
    try {
      const status = await systemApi.getUpdateStatus();
      updateStatus.value = status;
      return status;
    } catch (error) {
      console.error("Failed to get update status:", error);
      throw error;
    }
  };

  return {
    // State
    displayOn,
    displayTimeout,
    displayTimeoutEnabled,
    updating,
    updateStatus,
    updateMessage,
    updateMessageClass,
    // Methods
    turnDisplayOn,
    turnDisplayOff,
    configureDisplayTimeout,
    restartBackend,
    restartFrontend,
    triggerUpdate,
    getUpdateStatus,
    pollUpdateStatus,
  };
}
