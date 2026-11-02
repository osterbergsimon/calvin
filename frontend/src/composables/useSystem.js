/**
 * Composable for system operations (display, restart, updates).
 */

import { ref } from "vue";
import * as systemApi from "../services/systemApi";
import { errorDetailMessage } from "../utils/apiErrors";
import { friendlyError } from "../utils/friendlyError";

// Singleton refs so any component using useSystem() shares the same status
const updating = ref(false);
const updateStatus = ref(null);
const updateStatusLoading = ref(false);
const updateStatusCheckedAt = ref(null);
const updateMessage = ref("");
const updateMessageClass = ref("");
const backendHealth = ref(null);
const backendHealthLoading = ref(false);
const backendHealthCheckedAt = ref(null);
// Deployment info from /system/environment, fetched once per page load.
// null until loaded, or when the request failed (callers then fall back to
// the native UI so nothing is hidden by mistake).
const environment = ref(null);
let _environmentRequest = null;

let _clearMsgTimer = null;

const _scheduleMessageClear = (ms = 8000) => {
  if (_clearMsgTimer) clearTimeout(_clearMsgTimer);
  _clearMsgTimer = setTimeout(() => {
    updateMessage.value = "";
    updateMessageClass.value = "";
    _clearMsgTimer = null;
  }, ms);
};

const _cancelMessageClear = () => {
  if (_clearMsgTimer) {
    clearTimeout(_clearMsgTimer);
    _clearMsgTimer = null;
  }
};

const loadEnvironment = () => {
  if (!_environmentRequest) {
    _environmentRequest = systemApi
      .getSystemEnvironment()
      .then(data => {
        environment.value = data;
        return data;
      })
      .catch(error => {
        _environmentRequest = null;
        console.error("Failed to load system environment:", error);
        return null;
      });
  }
  return _environmentRequest;
};

export function useSystem() {
  const displayOn = ref(false);
  const displayTimeout = ref(0);
  const displayTimeoutEnabled = ref(false);

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const isUpdateDoneStatus = status => status === "idle";
  const isUpdateRunningStatus = status => status === "running";
  const isUpdateErrorStatus = status => status === "error";

  const waitForBackendHealthy = async ({ timeoutMs = 120000, intervalMs = 2000 } = {}) => {
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

  const getBackendHealth = async () => {
    backendHealthLoading.value = true;
    try {
      const health = await systemApi.getHealth();
      backendHealth.value = {
        status: health?.status || "healthy",
        data: health,
        error: null,
      };
      backendHealthCheckedAt.value = new Date().toISOString();
      return backendHealth.value;
    } catch (error) {
      backendHealth.value = {
        status: "unhealthy",
        data: null,
        // `error` is the raw detail (Settings shows it behind Details); the
        // readout itself only ever shows the friendly sentence.
        error: errorDetailMessage(error, error.message || ""),
        errorText: friendlyError(error, "check on Calvin"),
      };
      backendHealthCheckedAt.value = new Date().toISOString();
      return backendHealth.value;
    } finally {
      backendHealthLoading.value = false;
    }
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

  const configureDisplayTimeout = async timeout => {
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
    _cancelMessageClear();
    updateMessage.value = "Restarting Calvin…";
    updateMessageClass.value = "info";
    try {
      await systemApi.restartBackend();
    } catch (error) {
      // A network error here means the backend killed itself before sending the
      // response (old behaviour). Treat it the same as a successful initiation.
      if (error.response) {
        updateMessage.value = friendlyError(error, "restart Calvin", {
          // A 409 here is usually a deliberate host-control refusal; that
          // message is written for people, so show it as it is.
          conflict: errorDetailMessage(error, ""),
        });
        updateMessageClass.value = "error";
        _scheduleMessageClear(8000);
        console.error("Failed to restart backend:", error);
        return;
      }
      // No response → likely the process died mid-request; fall through.
    }
    updateMessage.value = "Calvin is restarting. This takes about 15 seconds.";
    updateMessageClass.value = "info";
    await sleep(2000); // give systemctl time to stop the service
    const healthy = await waitForBackendHealthy({ timeoutMs: 60000 });
    if (healthy) {
      updateMessage.value = "Calvin is back. Reloading…";
      updateMessageClass.value = "success";
      await sleep(1500);
      window.location.reload();
    } else {
      updateMessage.value =
        "Calvin hasn't come back yet. If it stays down, restart the machine it runs on.";
      updateMessageClass.value = "warning";
      _scheduleMessageClear(12000);
    }
  };

  const restartFrontend = async () => {
    _cancelMessageClear();
    updateMessage.value = "Restarting this screen…";
    updateMessageClass.value = "info";
    try {
      await systemApi.restartFrontend();
    } catch (error) {
      if (error.response) {
        updateMessage.value = friendlyError(error, "restart this screen", {
          conflict: errorDetailMessage(error, ""),
        });
        updateMessageClass.value = "error";
        _scheduleMessageClear(8000);
        console.error("Failed to restart frontend:", error);
        return;
      }
    }
    updateMessage.value = "Restarting this screen…";
    updateMessageClass.value = "info";
    await sleep(2000); // give systemctl time to stop the service
    const healthy = await waitForBackendHealthy({ timeoutMs: 60000 });
    if (healthy) {
      updateMessage.value = "Reloading…";
      updateMessageClass.value = "success";
      await sleep(1500);
      window.location.reload();
    } else {
      updateMessage.value = "This screen hasn't come back. Turn it off and on again.";
      updateMessageClass.value = "warning";
      _scheduleMessageClear(12000);
    }
  };

  // System updates

  const streamUpdateStatus = logOffset => {
    return new Promise(resolve => {
      const es = new EventSource(systemApi.getUpdateStreamUrl(logOffset));
      const logLines = [];

      es.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "log") {
            logLines.push(data.line);
            updateStatus.value = {
              ...(updateStatus.value || {}),
              status: "running",
              last_log: logLines.slice(-80).join("\n"),
            };
            const line = data.line.toLowerCase();
            if (line.includes("pulling latest code") || line.includes("fetching latest")) {
              updateMessage.value = "Downloading the update…";
            } else if (line.includes("updating") && line.includes("dependenc")) {
              updateMessage.value = "Installing…";
            } else if (
              line.includes("building frontend") ||
              (line.includes("vite") && line.includes("build"))
            ) {
              updateMessage.value = "Preparing the screens. This can take a few minutes.";
            } else if (line.includes("restarting")) {
              updateMessage.value = "Restarting Calvin…";
            }
            updateMessageClass.value = "info";
          } else if (data.type === "status") {
            if (data.state) {
              updateStatus.value = {
                ...(updateStatus.value || {}),
                ...data.state,
                last_log: updateStatus.value?.last_log || "",
              };
            }
            if (data.status === "running") {
              updateMessage.value = data.message || "Update in progress…";
              updateMessageClass.value = "info";
              return;
            }
            es.close();
            resolve(data);
          } else if (data.type === "timeout") {
            es.close();
            resolve({ status: "timeout" });
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        resolve({ status: "disconnected" });
      };
    });
  };

  const triggerUpdate = async () => {
    updating.value = true;
    updateMessage.value = "";
    updateMessageClass.value = "";
    updateStatus.value = null;
    _cancelMessageClear();

    try {
      const response = await systemApi.triggerUpdate();
      const logOffset = response.log_offset ?? 0;
      updateMessage.value = "Update started.";
      updateMessageClass.value = "info";
      updateStatus.value = {
        status: "running",
        last_log: "",
        message: "Starting...",
      };

      const result = await streamUpdateStatus(logOffset);

      if (result.status === "complete" || result.status === "disconnected") {
        updateMessage.value = "Update installed. Waiting for Calvin to restart…";
        updateMessageClass.value = "info";
        const healthy = await waitForBackendHealthy();
        if (healthy) {
          updateMessage.value = "Calvin is up to date.";
          updateMessageClass.value = "success";
        } else {
          updateMessage.value =
            "Update installed, but Calvin hasn't restarted yet. Give it a minute.";
          updateMessageClass.value = "warning";
        }
      } else if (result.status === "error") {
        updateMessage.value = "The update didn't finish. Calvin is still on the previous version.";
        updateMessageClass.value = "error";
        _scheduleMessageClear(8000);
      } else {
        updateMessage.value =
          "The update is taking longer than usual. Leave it running and check back later.";
        updateMessageClass.value = "warning";
        _scheduleMessageClear(12000);
      }
    } catch (error) {
      console.error("Failed to trigger update:", error);
      updateMessage.value = friendlyError(error, "start the update");
      updateMessageClass.value = "error";
      _scheduleMessageClear(8000);
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
          updateMessage.value = "Update installed. Waiting for Calvin to restart…";
          updateMessageClass.value = "info";

          const healthy = await waitForBackendHealthy();
          if (!healthy) {
            updateMessage.value =
              "Update installed, but Calvin hasn't restarted yet. Give it a minute.";
            updateMessageClass.value = "warning";
            return;
          }

          updateMessage.value = "Calvin is up to date.";
          updateMessageClass.value = "success";
          return;
        }

        if (isUpdateErrorStatus(status.status)) {
          updateMessage.value =
            "The update didn't finish. Calvin is still on the previous version.";
          updateMessageClass.value = "error";
          _scheduleMessageClear(8000);
          return;
        }

        if (isUpdateRunningStatus(status.status)) {
          updateMessage.value = status.message || "Update in progress…";
          updateMessageClass.value = "info";
        }
      } catch (error) {
        // During restarts, the backend may be down; treat this as "waiting for health"
        console.warn("Update status unavailable (backend may be restarting):", error);
        updateMessage.value = "Calvin is restarting. This takes about 15 seconds.";
        updateMessageClass.value = "warning";
        await waitForBackendHealthy({ timeoutMs: 60000, intervalMs: 2000 });
      }

      await sleep(pollIntervalMs);
    }

    updateMessage.value =
      "The update is taking longer than usual. Leave it running and check back later.";
    updateMessageClass.value = "warning";
    _scheduleMessageClear(12000);
  };

  const getUpdateStatus = async () => {
    updateStatusLoading.value = true;
    try {
      const status = await systemApi.getUpdateStatus();
      updateStatus.value = status;
      updateStatusCheckedAt.value = new Date().toISOString();
      return status;
    } catch (error) {
      console.error("Failed to get update status:", error);
      throw error;
    } finally {
      updateStatusLoading.value = false;
    }
  };

  return {
    // State
    displayOn,
    displayTimeout,
    displayTimeoutEnabled,
    updating,
    updateStatus,
    updateStatusLoading,
    updateStatusCheckedAt,
    updateMessage,
    updateMessageClass,
    backendHealth,
    backendHealthLoading,
    backendHealthCheckedAt,
    environment,
    // Methods
    loadEnvironment,
    turnDisplayOn,
    turnDisplayOff,
    configureDisplayTimeout,
    getBackendHealth,
    restartBackend,
    restartFrontend,
    triggerUpdate,
    streamUpdateStatus,
    getUpdateStatus,
    pollUpdateStatus,
  };
}
