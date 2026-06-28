<template>
  <div v-if="visible" class="bar-action-cluster" :class="{ compact }">
    <ConnectionIndicator :show-label="!compact" />

    <div
      class="status-indicator"
      :class="{ compact }"
      :title="`Backend: ${statusText}`"
      role="status"
      :aria-label="`Backend status: ${statusText}`"
    >
      <span :class="['status-dot', statusClass]" />
      <span v-if="!compact" class="status-text">{{ statusText }}</span>
    </div>

    <template v-if="configStore.shouldShowUI">
      <button
        class="bar-btn"
        :title="compact ? 'Settings' : undefined"
        aria-label="Open settings"
        @click="goToSettings"
      >
        <span class="bar-btn-icon">⚙️</span>
        <span v-if="!compact" class="bar-btn-label">Settings</span>
      </button>

      <AdminOverflow />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import axios from "axios";
import { useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";
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
const modeStore = useModeStore();
const router = useRouter();

const status = ref("checking...");
let healthInterval = null;

const statusClass = computed(() => {
  if (status.value === "healthy") return "healthy";
  if (status.value === "checking...") return "checking";
  return "error";
});

const statusText = computed(() => status.value.charAt(0).toUpperCase() + status.value.slice(1));

const checkHealth = async () => {
  try {
    const response = await axios.get("/api/health", { timeout: 5000 });
    status.value = response.data?.status === "healthy" ? "healthy" : "unhealthy";
  } catch (err) {
    if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
      status.value = "checking...";
    } else {
      status.value = "error";
    }
  }
};

const goToSettings = () => {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push("/settings");
};

onMounted(() => {
  checkHealth();
  healthInterval = setInterval(checkHealth, 30000);
});

onUnmounted(() => {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
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

.bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
  white-space: nowrap;
}

.bar-action-cluster.compact .bar-btn {
  padding: 0.4rem;
  width: 100%;
  justify-content: center;
}

.bar-btn:hover {
  background: var(--bg-2);
  border-color: var(--ink-2);
}

.bar-btn-icon {
  font-size: 1rem;
  line-height: 1;
}

.bar-btn-label {
  font-size: 0.85rem;
}
</style>
