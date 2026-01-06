/**
 * API service for system-related operations.
 */

import api from "./api";

/**
 * Turn display on.
 */
export async function turnDisplayOn() {
  const response = await api.post("/system/display/power/on");
  return response.data;
}

/**
 * Turn display off.
 */
export async function turnDisplayOff() {
  const response = await api.post("/system/display/power/off");
  return response.data;
}

/**
 * Configure display timeout.
 */
export async function configureDisplayTimeout(timeout) {
  const response = await api.post("/system/display/timeout/configure", {
    timeout: timeout,
  });
  return response.data;
}

/**
 * Restart backend.
 */
export async function restartBackend() {
  const response = await api.post("/system/restart-backend");
  return response.data;
}

/**
 * Restart frontend.
 */
export async function restartFrontend() {
  const response = await api.post("/system/restart-frontend");
  return response.data;
}

/**
 * Trigger system update.
 */
export async function triggerUpdate() {
  const response = await api.post("/system/update");
  return response.data;
}

/**
 * Get update status.
 */
export async function getUpdateStatus() {
  const response = await api.get("/system/update/status");
  return response.data;
}
