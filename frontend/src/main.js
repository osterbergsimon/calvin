import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";
import router from "./router";
import "./styles/main.css";
import "./styles/theme.css";
import { initLogger } from "./utils/logger";
import { useConfigStore } from "./stores/config";

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
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}

app.mount("#app");
