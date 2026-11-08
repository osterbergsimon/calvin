<template>
  <!-- A share link's guest page (calvin-mwqo): no dashboard, keyboard or admin shell. -->
  <RouterView v-if="guest" />
  <div v-else class="app-shell">
    <KeyboardHandler />
    <RouterView />
    <ConnectionStatus v-if="!clockBarVisible" floating />
    <StatusRail />
    <ReloadLight />
    <OnScreenKeyboardLoader />
    <AdminSignInDialog />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from "vue";
import { RouterView, useRouter } from "vue-router";
import { isGuestPath } from "./utils/guestPath";
import KeyboardHandler from "./components/KeyboardHandler.vue";
import StatusRail from "./components/StatusRail.vue";
import ReloadLight from "./components/ReloadLight.vue";
import OnScreenKeyboardLoader from "./components/ui/OnScreenKeyboardLoader.vue";
import AdminSignInDialog from "./components/auth/AdminSignInDialog.vue";
import ConnectionStatus from "./components/ConnectionStatus.vue";
import { useClockBarVisible } from "./composables/useClockBarVisible";
// Drop retired per-browser values once, before anything reads the screen config
import { removeRetiredBrowserSettings } from "./utils/screenSetting";
// Initialize photo frame mode globally
import { usePhotoFrameMode } from "./composables/usePhotoFrameMode";
// Initialize theme globally
import { useTheme } from "./composables/useTheme";
// Keep the household font in sync with config (H4)
import { useTypeTheme } from "./composables/useTypeTheme";
// Keep the global UI scale in sync with config
import { useUiScale } from "./composables/useUiScale";
// Force this screen's desktop/phone layout, if it has one
import { useLayoutOverride } from "./composables/useLayoutOverride";
// Apply this screen's effects level (full or standard) to <html>
import { useEffectsLevel } from "./composables/useEffectsLevel";
// Sign out a kiosk's admin session after 5 minutes without touch (calvin-q4o8)
import { useKioskSessionGuard } from "./composables/useKioskSessionGuard";
// Initialize connection store
import { useConnectionStore } from "./stores/connection";

// Decided once from the address the page loaded at: the guest page is a full
// page load of its own, never reached by in-app navigation.
const guest = isGuestPath(window.location.pathname);

// One-time migration, before any composable reads a screen setting: the old
// browser values for Behaviour must never beat the household value.
removeRetiredBrowserSettings();

const clockBarVisible = guest ? null : useClockBarVisible();
if (!guest) {
  usePhotoFrameMode();
  const theme = useTheme();
  // Applies the boot cache now, then the household font once config arrives.
  useTypeTheme().syncWithConfig();
  const uiScale = useUiScale();
  // Applies the layout class before mount; keeps it in step with Settings.
  useLayoutOverride().syncWithConfig();
  // Applies data-effects before mount and follows the merged config (calvin-uudb).
  useEffectsLevel().syncWithConfig();
  const connectionStore = useConnectionStore();
  useKioskSessionGuard({ router: useRouter() });

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
}
</script>

<style>
.app-shell {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
}
</style>
