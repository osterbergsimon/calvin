import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * Connection status store.
 * Tracks online/offline state and backend API connectivity.
 */
export const useConnectionStore = defineStore("connection", () => {
  const isOnline = ref(navigator.onLine);
  const isBackendOnline = ref(true); // Assume online initially
  const lastBackendCheck = ref(null);
  let healthCheckInterval = null;

  // Check backend connectivity
  const checkBackend = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      const response = await fetch("/api/health", {
        method: "GET",
        signal: controller.signal,
        cache: "no-cache",
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        isBackendOnline.value = true;
        lastBackendCheck.value = new Date();
        return true;
      } else {
        isBackendOnline.value = false;
        return false;
      }
    } catch (_error) {
      // Network error or timeout
      isBackendOnline.value = false;
      return false;
    }
  };

  // Combined online status (browser online AND backend reachable)
  const isFullyOnline = () => {
    return isOnline.value && isBackendOnline.value;
  };

  // Listen to browser online/offline events
  const handleOnline = () => {
    isOnline.value = true;
    // Check backend when browser comes online
    checkBackend();
  };

  const handleOffline = () => {
    isOnline.value = false;
    isBackendOnline.value = false; // Assume backend is also offline
  };

  // Periodic backend health check (every 30 seconds when online)
  const startHealthCheck = () => {
    if (healthCheckInterval) return;
    
    healthCheckInterval = setInterval(async () => {
      if (isOnline.value) {
        await checkBackend();
      }
    }, 30000); // Check every 30 seconds
  };

  const stopHealthCheck = () => {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
  };

  // Initialize event listeners (call this from App.vue onMounted)
  const initialize = () => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    // Initial backend check
    checkBackend();
    
    // Start periodic health checks
    startHealthCheck();
  };

  // Cleanup (call this from App.vue onUnmounted)
  const cleanup = () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    stopHealthCheck();
  };

  return {
    isOnline,
    isBackendOnline,
    lastBackendCheck,
    isFullyOnline,
    checkBackend,
    startHealthCheck,
    stopHealthCheck,
    initialize,
    cleanup,
  };
});

