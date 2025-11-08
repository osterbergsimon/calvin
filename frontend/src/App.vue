<template>
  <div id="app">
    <KeyboardHandler />
    <RouterView />
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import KeyboardHandler from "./components/KeyboardHandler.vue";
// Initialize photo frame mode globally
import { usePhotoFrameMode } from "./composables/usePhotoFrameMode";
// Initialize theme globally
import { useTheme } from "./composables/useTheme";

usePhotoFrameMode();
const theme = useTheme();

// Ensure theme is initialized immediately
onMounted(() => {
  theme.loadTheme();
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
