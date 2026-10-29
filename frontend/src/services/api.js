import axios from "axios";
import { useConnectionStore } from "../stores/connection";
import { logError } from "../utils/logger";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

// Default per-request timeout. Uploads, plugin installs and backups pass
// LONG_REQUEST_TIMEOUT instead: they legitimately run for minutes.
export const DEFAULT_REQUEST_TIMEOUT = 10000;
export const LONG_REQUEST_TIMEOUT = 10 * 60 * 1000;

// Header the service worker adds to API responses it replays from its cache.
export const SW_CACHE_HEADER = "x-calvin-sw-cache";

// No default Content-Type: axios sets JSON for plain objects itself, and a
// forced application/json would make axios serialize FormData uploads to JSON.
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_REQUEST_TIMEOUT,
});

// Request interceptor
api.interceptors.request.use(
  config => {
    // Add auth token if available
    // const token = localStorage.getItem('token')
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`
    // }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

/**
 * Rejection for an API response the service worker replayed from its cache.
 *
 * The worker only replays when the network request failed, so this is an
 * offline signal, not a fresh success: callers take their offline path (the
 * stores serve their own cached copy flagged stale and never rewrite it).
 * `response` still holds the replayed payload for callers that want it.
 */
export class ServiceWorkerReplayError extends Error {
  constructor(response) {
    super("Backend unreachable: response replayed from the offline cache");
    this.name = "ServiceWorkerReplayError";
    this.serviceWorkerReplay = true;
    this.response = response;
  }
}

export const isServiceWorkerReplay = error => Boolean(error?.serviceWorkerReplay);

// Response interceptor
api.interceptors.response.use(
  response => {
    if (response.headers?.[SW_CACHE_HEADER]) {
      // The network request failed and the worker answered from its cache.
      useConnectionStore().isBackendOnline = false;
      return Promise.reject(new ServiceWorkerReplayError(response));
    }
    const connectionStore = useConnectionStore();
    if (!connectionStore.isBackendOnline) {
      connectionStore.isBackendOnline = true;
    }
    return response;
  },
  async error => {
    const connectionStore = useConnectionStore();

    // Check if it's a network error (offline or backend unreachable)
    if (!error.response) {
      // Network error - no response from server
      if (!navigator.onLine) {
        connectionStore.isOnline = false;
        connectionStore.isBackendOnline = false;
      } else {
        // Browser is online but backend is unreachable
        connectionStore.isBackendOnline = false;
        // Trigger a health check
        await connectionStore.checkBackend();
      }
    } else {
      // HTTP error response
      if (error.response?.status === 401) {
        // Handle unauthorized
        logError("[api]", "Unauthorized");
      } else if (error.response?.status >= 500) {
        // A 5xx is one failing route (often a plugin's upstream), not proof the
        // backend is down: the health check decides that, so ask it.
        logError("[api]", "Server error:", error.response.data);
        await connectionStore.checkBackend();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
