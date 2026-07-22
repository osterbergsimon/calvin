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

/**
 * Return the SSE URL for streaming update log output from a given byte offset.
 */
export function getUpdateStreamUrl(logOffset = 0) {
  const base = import.meta.env.VITE_API_URL || "/api";
  return `${base}/system/update/stream?log_offset=${logOffset}`;
}

/**
 * Basic backend health check.
 */
export async function getHealth() {
  const response = await api.get("/health");
  return response.data;
}

/**
 * Get deployment capabilities (docker vs native, which actions work here).
 */
export async function getSystemEnvironment() {
  const response = await api.get("/system/environment");
  return response.data;
}
