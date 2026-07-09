<template>
  <div v-if="visible" class="bar-action-cluster" :class="{ compact }">
    <ConnectionIndicator :show-label="!compact" />

    <div
      class="status-indicator"
      :class="{ compact, 'status-indicator--settled': statusSettled }"
      :title="`Backend: ${statusText}`"
      role="status"
      :aria-label="`Backend status: ${statusText}`"
    >
      <span :class="['status-dot', statusClass]" />
      <span v-if="!compact" class="status-text">{{ statusText }}</span>
    </div>

    <template v-if="configStore.shouldShowUI">
      <AdminOverflow />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useConnectionStore } from "../stores/connection";
import ConnectionIndicator from "./ConnectionIndicator.vue";
import AdminOverflow from "./dashboard/AdminOverflow.vue";

defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
});

const visible = computed(() => true);

const configStore = useConfigStore();
const connectionStore = useConnectionStore();

const status = computed(() => {
  if (!connectionStore.lastBackendCheck) return "checking...";
  return connectionStore.isOnline && connectionStore.isBackendOnline ? "healthy" : "error";
});

const statusClass = computed(() => {
  if (status.value === "healthy") return "healthy";
  if (status.value === "checking...") return "checking";
  return "error";
});

const statusText = computed(() => status.value.charAt(0).toUpperCase() + status.value.slice(1));

// On a wall display a permanent "Healthy" indicator is just noise. Fade it out
// once things settle; anything that isn't healthy (checking / error / unhealthy)
// stays visible and prominent so problems are noticed.
const statusSettled = ref(false);
let settleTimer = null;
watch(
  status,
  s => {
    clearTimeout(settleTimer);
    if (s === "healthy") {
      settleTimer = setTimeout(() => {
        statusSettled.value = true;
      }, 4000);
    } else {
      statusSettled.value = false;
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  clearTimeout(settleTimer);
});
</script>

<style scoped>
.bar-action-cluster {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: nowrap;
}

.bar-action-cluster.compact {
  flex-direction: column;
  gap: 0.5rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--ink-2);
  transition:
    opacity 0.8s ease,
    max-width 0.8s ease,
    margin 0.8s ease;
  opacity: 1;
  max-width: 12rem;
  overflow: hidden;
}

/* Healthy + settled: fade away and collapse so it leaves no gap. Hover/focus
   within the bar brings it back for a quick glance. */
.status-indicator--settled {
  opacity: 0;
  max-width: 0;
  margin-right: -0.5rem;
}
.bar-action-cluster:hover .status-indicator--settled {
  opacity: 0.6;
  max-width: 12rem;
  margin-right: 0;
}

.status-indicator.compact {
  gap: 0;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.checking {
  background-color: var(--warn);
  animation: bar-pulse 1.5s ease-in-out infinite;
}

.status-dot.healthy {
  background-color: var(--ok);
}

.status-dot.error {
  background-color: var(--err);
}

@keyframes bar-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
