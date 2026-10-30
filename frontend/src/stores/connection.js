import { defineStore } from "pinia";
import { computed, ref } from "vue";

/** Steady-state poll interval while the backend is reachable. */
const NORMAL_CHECK_INTERVAL = 30000;
/** Retry delays after consecutive failures: 5s, 10s, then every 30s. */
const RETRY_BACKOFF = [5000, 10000, 30000];
/** How long the "Connected" confirmation stays up after coming back. */
const CONNECTED_FLASH_MS = 3000;
/** A single slow response must not flip the UI: two failures in a row do. */
const FAILURES_BEFORE_UNREACHABLE = 2;

/**
 * Connection status store.
 *
 * Tracks browser connectivity and backend reachability for the dashboard's
 * single connection pill (CLV-48). Two consecutive failed checks make the
 * backend "unreachable"; one success makes it OK again and flashes a
 * confirmation for a moment.
 */
export const useConnectionStore = defineStore("connection", () => {
  const isOnline = ref(navigator.onLine);
  const isBackendOnline = ref(true); // Assume online until a check says otherwise
  const lastBackendCheck = ref(null);
  const hasChecked = ref(false);
  const consecutiveFailures = ref(0);
  const reconnected = ref(false);

  let nextCheckTimer = null;
  let connectedTimer = null;
  let polling = false;
  let listening = false;

  /**
   * 'ok'         backend reachable (nothing shows)
   * 'starting'   no check has finished yet
   * 'unreachable' two consecutive checks failed
   * 'offline'    the browser itself is off the network
   */
  const status = computed(() => {
    if (!isOnline.value) return "offline";
    if (!hasChecked.value) return "starting";
    if (consecutiveFailures.value >= FAILURES_BEFORE_UNREACHABLE) return "unreachable";
    return "ok";
  });

  const clearNextCheck = () => {
    if (nextCheckTimer) {
      clearTimeout(nextCheckTimer);
      nextCheckTimer = null;
    }
  };

  const clearConnectedFlash = () => {
    if (connectedTimer) {
      clearTimeout(connectedTimer);
      connectedTimer = null;
    }
  };

  const scheduleNextCheck = delay => {
    clearNextCheck();
    // Offline or not polling: the online event (or startHealthCheck) restarts us.
    if (!polling || !isOnline.value) return;
    nextCheckTimer = setTimeout(() => {
      nextCheckTimer = null;
      checkBackend();
    }, delay);
  };

  const flashConnected = () => {
    reconnected.value = true;
    clearConnectedFlash();
    connectedTimer = setTimeout(() => {
      reconnected.value = false;
      connectedTimer = null;
    }, CONNECTED_FLASH_MS);
  };

  // Check backend connectivity
  const checkBackend = async () => {
    const wasDown = status.value === "unreachable" || status.value === "offline";
    let ok = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/health`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-cache",
      });
      ok = !!response.ok;
    } catch {
      // Network error or timeout
      ok = false;
    } finally {
      clearTimeout(timeoutId);
    }

    hasChecked.value = true;

    if (ok) {
      consecutiveFailures.value = 0;
      isBackendOnline.value = true;
      lastBackendCheck.value = new Date();
      if (wasDown && isOnline.value) flashConnected();
      scheduleNextCheck(NORMAL_CHECK_INTERVAL);
      return true;
    }

    consecutiveFailures.value += 1;
    isBackendOnline.value = false;
    const delay = RETRY_BACKOFF[Math.min(consecutiveFailures.value - 1, RETRY_BACKOFF.length - 1)];
    scheduleNextCheck(delay);
    return false;
  };

  // Combined online status (browser online AND backend reachable)
  const isFullyOnline = () => {
    return isOnline.value && isBackendOnline.value;
  };

  /**
   * Fresh data arrived from the backend on some other route (services/api.js),
   * so the screen is demonstrably reachable even if the health poll has not
   * come round yet. Ends the unreachable state without waiting for it.
   */
  const markBackendReachable = () => {
    if (!isOnline.value) return;
    const wasDown = status.value === "unreachable";
    hasChecked.value = true;
    consecutiveFailures.value = 0;
    isBackendOnline.value = true;
    lastBackendCheck.value = new Date();
    if (wasDown) flashConnected();
    if (polling) scheduleNextCheck(NORMAL_CHECK_INTERVAL);
  };

  // Listen to browser online/offline events
  const handleOnline = () => {
    isOnline.value = true;
    // Coming back from navigator.onLine false checks immediately.
    checkBackend();
  };

  const handleOffline = () => {
    isOnline.value = false;
    isBackendOnline.value = false; // Assume backend is also unreachable
    consecutiveFailures.value = 0;
    reconnected.value = false;
    clearConnectedFlash();
    clearNextCheck();
  };

  // Start the health-check loop. The next check is scheduled from each result,
  // so retries back off (5s, 10s, 30s) instead of polling at a fixed rate.
  const startHealthCheck = () => {
    polling = true;
    if (!isOnline.value) return;
    if (nextCheckTimer) return;
    checkBackend();
  };

  const stopHealthCheck = () => {
    polling = false;
    clearNextCheck();
  };

  // Initialize event listeners (call this from App.vue onMounted)
  const initialize = () => {
    if (listening) return;
    listening = true;
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    startHealthCheck();
  };

  // Cleanup (call this from App.vue onUnmounted)
  const cleanup = () => {
    if (listening) {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      listening = false;
    }
    stopHealthCheck();
    clearConnectedFlash();
    reconnected.value = false;
  };

  return {
    isOnline,
    isBackendOnline,
    lastBackendCheck,
    hasChecked,
    consecutiveFailures,
    reconnected,
    status,
    isFullyOnline,
    checkBackend,
    markBackendReachable,
    startHealthCheck,
    stopHealthCheck,
    initialize,
    cleanup,
  };
});
