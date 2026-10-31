<template>
  <div class="app-shell">
    <KeyboardHandler />
    <RouterView />
    <ConnectionStatus v-if="!clockBarVisible" floating />
    <StatusRail />
    <OnScreenKeyboard />
    <AdminSignInDialog />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from "vue";
import { RouterView } from "vue-router";
import KeyboardHandler from "./components/KeyboardHandler.vue";
import StatusRail from "./components/StatusRail.vue";
import OnScreenKeyboard from "./components/ui/OnScreenKeyboard.vue";
import AdminSignInDialog from "./components/auth/AdminSignInDialog.vue";
import ConnectionStatus from "./components/ConnectionStatus.vue";
import { useClockBarVisible } from "./composables/useClockBarVisible";
// Initialize photo frame mode globally
import { usePhotoFrameMode } from "./composables/usePhotoFrameMode";
// Initialize theme globally
import { useTheme } from "./composables/useTheme";
// Keep the global UI scale in sync with config
import { useUiScale } from "./composables/useUiScale";
// Initialize connection store
import { useConnectionStore } from "./stores/connection";

usePhotoFrameMode();
const theme = useTheme();
const uiScale = useUiScale();
const connectionStore = useConnectionStore();
const clockBarVisible = useClockBarVisible();

// Ensure theme is initialized immediately
onMounted(() => {
  theme.loadTheme();
  // theme.loadTheme() triggers configStore.fetchConfig(); the immediate watch
  // reconciles the UI scale once uiSize is populated (API is source of truth).
  uiScale.syncWithConfig();
  connectionStore.initialize();
});

onUnmounted(() => {
  connectionStore.cleanup();
});
</script>

<style>
.app-shell {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
}
</style>
