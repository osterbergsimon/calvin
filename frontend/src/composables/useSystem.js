/**
 * Composable for system operations (display, restart, updates).
 */

import { ref } from "vue";
import * as systemApi from "../services/systemApi";

export function useSystem() {
  const displayOn = ref(false);
  const displayTimeout = ref(0);
  const displayTimeoutEnabled = ref(false);
  const updating = ref(false);
  const updateStatus = ref(null);
  const updateMessage = ref("");
  const updateMessageClass = ref("");

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
    try {
      await systemApi.restartBackend();
      updateMessage.value = "Backend restart initiated";
      updateMessageClass.value = "success";
      setTimeout(() => {
        updateMessage.value = "";
        updateMessageClass.value = "";
      }, 5000);
    } catch (error) {
      console.error("Failed to restart backend:", error);
      updateMessage.value = "Failed to restart backend";
      updateMessageClass.value = "error";
      throw error;
    }
  };

  const restartFrontend = async () => {
    try {
      await systemApi.restartFrontend();
      updateMessage.value = "Frontend restart initiated";
      updateMessageClass.value = "success";
      setTimeout(() => {
        updateMessage.value = "";
        updateMessageClass.value = "";
      }, 5000);
    } catch (error) {
      console.error("Failed to restart frontend:", error);
      updateMessage.value = "Failed to restart frontend";
      updateMessageClass.value = "error";
      throw error;
    }
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
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const status = await systemApi.getUpdateStatus();
        updateStatus.value = status;

        if (status.status === "completed" || status.status === "error") {
          updateMessage.value =
            status.status === "completed"
              ? "Update completed successfully!"
              : `Update failed: ${status.message || "Unknown error"}`;
          updateMessageClass.value =
            status.status === "completed" ? "success" : "error";
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000); // Check every 5 seconds
        } else {
          updateMessage.value =
            "Update is taking longer than expected. Please check manually.";
          updateMessageClass.value = "warning";
        }
      } catch (error) {
        console.error("Failed to check update status:", error);
        updateMessage.value = "Failed to check update status";
        updateMessageClass.value = "error";
      }
    };

    await checkStatus();
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
