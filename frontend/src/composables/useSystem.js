/**
 * Composable for system operations (display, restart, updates).
 */

import { computed, ref } from "vue";
import * as systemApi from "../services/systemApi";
import { errorDetailMessage } from "../utils/apiErrors";
import { friendlyError } from "../utils/friendlyError";
import {
  UPDATE_IDLE,
  isUpdateBusy,
  nextUpdate,
  serverStatusEvent,
  updateView,
} from "../utils/updateLifecycle";

// Singleton refs so any component using useSystem() shares the same status
// Calvin's own update: one state (utils/updateLifecycle.js); `updating` and
// the message refs below are derived from it by sendUpdate.
const updateLife = ref(UPDATE_IDLE);
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

  // Move the update to its next state and show what that state says. The
  // only writer of `updating` and, during an update, of the message line.
  const sendUpdate = event => {
    const next = nextUpdate(updateLife.value, event);
    if (next === updateLife.value) return;
    updateLife.value = next;
    updating.value = isUpdateBusy(next);
    const view = updateView(next);
    _cancelMessageClear();
    updateMessage.value = view.message;
    updateMessageClass.value = view.tone;
    if (view.clearAfterMs) _scheduleMessageClear(view.clearAfterMs);
  };

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
            sendUpdate({ type: "log", line: data.line });
          } else if (data.type === "status") {
            if (data.state) {
              updateStatus.value = {
                ...(updateStatus.value || {}),
                ...data.state,
                last_log: updateStatus.value?.last_log || "",
              };
            }
            if (data.status === "running") {
              sendUpdate({
                type: "progress",
                phase: data.phase ?? data.state?.phase,
                message: data.message,
              });
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

  // The script finished: Calvin restarts on the new version; say so only once
  // it answers again.
  const confirmRestart = async () => {
    const healthy = await waitForBackendHealthy();
    sendUpdate({ type: healthy ? "healthy" : "notHealthy" });
  };

  // Follow an update through the status endpoint until it settles: after the
  // live stream drops (Calvin restarting cuts it), or for an update this page
  // did not start. A failed request means Calvin is restarting, not done.
  const followUpdate = async () => {
    const timeoutMs = 10 * 60 * 1000; // 10 minutes
    const pollIntervalMs = 5000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const status = await systemApi.getUpdateStatus();
        updateStatus.value = status;
        const event = serverStatusEvent(status);
        if (event) sendUpdate(event);
        if (event?.type === "installed") {
          await confirmRestart();
          return;
        }
        if (event?.type === "failed") return;
      } catch (error) {
        console.warn("Update status unavailable (backend may be restarting):", error);
        sendUpdate({ type: "unreachable" });
        await waitForBackendHealthy({ timeoutMs: 60000, intervalMs: 2000 });
      }

      await sleep(pollIntervalMs);
    }

    sendUpdate({ type: "timedOut" });
  };

  const triggerUpdate = async () => {
    if (isUpdateBusy(updateLife.value)) return; // one update at a time
    updateStatus.value = null;
    sendUpdate({ type: "start" });

    let response;
    try {
      response = await systemApi.triggerUpdate();
    } catch (error) {
      console.error("Failed to trigger update:", error);
      sendUpdate({ type: "startFailed", message: friendlyError(error, "start the update") });
      return;
    }

    updateStatus.value = { status: "running", last_log: "", message: "Starting..." };
    const result = await streamUpdateStatus(response.log_offset ?? 0);

    if (result.status === "complete") {
      sendUpdate({ type: "installed" });
      await confirmRestart();
    } else if (result.status === "error") {
      sendUpdate({ type: "failed" });
    } else if (result.status === "disconnected") {
      // A dropped stream is not a finished update: Calvin restarting at the
      // end cuts it, and so does a network blip in the middle. Ask the server.
      sendUpdate({ type: "streamLost" });
      await followUpdate();
    } else {
      sendUpdate({ type: "timedOut" });
    }
  };

  // Watch an update in progress (one this page did not start).
  const pollUpdateStatus = async () => {
    sendUpdate({ type: "follow" });
    await followUpdate();
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
    // Where Calvin's update is (utils/updateLifecycle.js): idle, starting,
    // running, following, waiting, restarting, done, unconfirmed, failed, slow.
    updateStage: computed(() => updateLife.value.stage),
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
