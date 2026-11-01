<template>
  <LoadingLight v-if="show" viewport />
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import LoadingLight from "./LoadingLight.vue";
import { RELOAD_SOURCE_ID, useProgressStore } from "../stores/progress";

/**
 * The app loading light on views without a dashboard (Settings, a phone's
 * Settings): mounted only while Reload UI or a service-worker update is under
 * way. Everything else there keeps its own local feedback (CLV-115). The
 * dashboard draws its own app light.
 */
const route = useRoute();
const progress = useProgressStore();

const show = computed(() => route?.name !== "dashboard" && progress.isActive(RELOAD_SOURCE_ID));
</script>
