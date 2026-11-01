import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";
import router from "./router";
import "./styles/main.css";
import "./styles/theme.css";
import "./styles/fonts.js";
import "./styles/base.css";
import { initLogger, logError, logInfo } from "./utils/logger";
import { useConfigStore } from "./stores/config";
import { useTypeTheme } from "./composables/useTypeTheme";
import { useUiScale } from "./composables/useUiScale";
import { captureKioskIdentity } from "./utils/kioskId";
import { reloadWithLight } from "./utils/reloadWithLight";
import { useProgressStore } from "./stores/progress";
import {
  markControllerReload,
  shouldReloadOnControllerChange,
  startUpdateChecks,
} from "./utils/serviceWorkerUpdate";

// Store ?kiosk=/&khost= before the router can drop them on the first navigation (F1).
captureKioskIdentity();

// Apply the persisted typeface before mount so the dashboard boots with the
// saved font instead of the default (previously only applied on opening Settings).
useTypeTheme().loadTypeTheme();

// Apply the persisted UI-size preset before mount so controls boot at the saved
// scale (no flash). The config store reconciles it after /api/config loads.
useUiScale().loadUiScale();

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(VueQueryPlugin, {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Enable caching for better performance
      gcTime: 10 * 60 * 1000, // 10 minutes (cacheTime in v5+)
      // Use network-first strategy for critical data
      networkMode: "online",
      // Enable structural sharing for better performance
      structuralSharing: true,
    },
  },
});

// Initialize logger with config store getter
initLogger(() => useConfigStore());

// Register service worker for offline caching and performance
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // A new deploy installs a new worker (it activates at once). Reload when it
  // takes over a page an older worker served, so a kiosk that never navigates
  // still moves onto the new UI. The page's controller is tracked from here,
  // not captured once: a page loaded during the first install starts without
  // one, and a later deploy must still reload it.
  let currentController = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const previousController = currentController;
    currentController = navigator.serviceWorker.controller;

    if (
      !shouldReloadOnControllerChange({
        previousController,
        nextController: currentController,
      })
    ) {
      return;
    }

    markControllerReload();
    // The app loading light shows until the new build is up (CLV-115).
    reloadWithLight({ progress: useProgressStore(pinia) });
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      // Always revalidate sw.js itself, never take it from the HTTP cache.
      .register("/sw.js", { updateViaCache: "none" })
      .then(registration => {
        logInfo("[main]", "Service Worker registered:", registration);
        // Kiosks stay on one page for days: poll for a new deploy instead of
        // waiting for a navigation that never comes.
        startUpdateChecks(registration);
      })
      .catch(error => {
        logError("[main]", "Service Worker registration failed:", error);
      });
  });
}

app.mount("#app");
