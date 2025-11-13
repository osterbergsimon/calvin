<template>
  <div
    v-if="!isFullyOnline"
    class="connection-indicator"
    :class="{ 'offline': !isOnline, 'backend-offline': isOnline && !isBackendOnline }"
    :title="connectionTooltip"
  >
    <span
      class="connection-icon"
    >
      {{ connectionIcon }}
    </span>
    <span
      v-if="showLabel"
      class="connection-label"
    >
      {{ connectionLabel }}
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useConnectionStore } from "../stores/connection";

defineProps({
  showLabel: {
    type: Boolean,
    default: false,
  },
});
// Props are used in template via v-if="showLabel"

const connectionStore = useConnectionStore();

const isOnline = computed(() => connectionStore.isOnline);
const isBackendOnline = computed(() => connectionStore.isBackendOnline);
const isFullyOnline = computed(() => connectionStore.isFullyOnline());

const connectionIcon = computed(() => {
  if (!isOnline.value) {
    return "📡"; // Browser offline
  }
  if (!isBackendOnline.value) {
    return "⚠️"; // Backend unreachable
  }
  return "";
});

const connectionLabel = computed(() => {
  if (!isOnline.value) {
    return "Offline";
  }
  if (!isBackendOnline.value) {
    return "No Connection";
  }
  return "";
});

const connectionTooltip = computed(() => {
  if (!isOnline.value) {
    return "No internet connection. Using cached data.";
  }
  if (!isBackendOnline.value) {
    return "Backend server unreachable. Using cached data.";
  }
  return "";
});
</script>

<style scoped>
.connection-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 193, 7, 0.9);
  color: #856404;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.connection-indicator.offline {
  background: rgba(220, 53, 69, 0.9);
  color: white;
}

.connection-indicator.backend-offline {
  background: rgba(255, 193, 7, 0.9);
  color: #856404;
}

.connection-icon {
  font-size: 1rem;
  line-height: 1;
}

.connection-label {
  font-size: 0.875rem;
}
</style>

