<template>
  <div id="app">
    <KeyboardHandler />
    <RouterView />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from "vue";
import { RouterView } from "vue-router";
import KeyboardHandler from "./components/KeyboardHandler.vue";
// Initialize photo frame mode globally
import { usePhotoFrameMode } from "./composables/usePhotoFrameMode";
// Initialize theme globally
import { useTheme } from "./composables/useTheme";
// Initialize connection store
import { useConnectionStore } from "./stores/connection";

usePhotoFrameMode();
const theme = useTheme();
const connectionStore = useConnectionStore();

// Ensure theme is initialized immediately
onMounted(() => {
  theme.loadTheme();
  connectionStore.initialize();
});

onUnmounted(() => {
  connectionStore.cleanup();
});
</script>

<style>
#app {
  width: 100%;
  height: 100vh;
  margin: 0;
  padding: 0;
}
</style>
