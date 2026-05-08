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
        v-if="modeStore.currentMode !== modeStore.MODES.WEB_SERVICES"
        class="bar-btn"
        :title="compact ? 'Web Services' : undefined"
        aria-label="Show Web Services"
        @click="showWebServices"
      >
        <span class="bar-btn-icon">🌐</span>
        <span v-if="!compact" class="bar-btn-label">Web Services</span>
      </button>
      <button
        v-else
        class="bar-btn"
        :title="compact ? 'Photos' : undefined"
        aria-label="Show Photos"
        @click="showPhotos"
      >
        <span class="bar-btn-icon">🖼️</span>
        <span v-if="!compact" class="bar-btn-label">Photos</span>
      </button>

      <button
        class="bar-btn"
        :title="compact ? sideViewPositionTitle : undefined"
        :aria-label="sideViewPositionTitle"
        @click="toggleSideViewPosition"
      >
        <span class="bar-btn-icon">{{ sideViewPositionIcon }}</span>
      </button>

      <button
        class="bar-btn"
        :title="compact ? orientationTitle : undefined"
        :aria-label="orientationTitle"
        @click="toggleOrientation"
      >
        <span class="bar-btn-icon">{{ orientationIcon }}</span>
        <span v-if="!compact" class="bar-btn-label">{{ orientationLabel }}</span>
      </button>

      <button
        class="bar-btn"
        :title="compact ? 'Settings' : undefined"
        aria-label="Open settings"
        @click="goToSettings"
      >
        <span class="bar-btn-icon">⚙️</span>
        <span v-if="!compact" class="bar-btn-label">Settings</span>
      </button>

      <button
        class="bar-btn"
        :title="compact ? 'Hide UI' : undefined"
        aria-label="Hide UI"
        @click="configStore.toggleUI"
      >
        <span class="bar-btn-icon">⊖</span>
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import axios from "axios";
import { useRouter } from "vue-router";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";
import { logError } from "../utils/logger";
import ConnectionIndicator from "./ConnectionIndicator.vue";

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

const orientationIcon = computed(() => (configStore.orientation === "landscape" ? "📱" : "🖥️"));
const orientationLabel = computed(() =>
  configStore.orientation === "landscape" ? "Portrait" : "Landscape"
);
const orientationTitle = computed(
  () => `Switch to ${configStore.orientation === "landscape" ? "portrait" : "landscape"} view`
);

const sideViewPositionIcon = computed(() => {
  if (configStore.orientation === "landscape") {
    return configStore.sideViewPosition === "right" ? "←" : "→";
  }
  return configStore.sideViewPosition === "bottom" ? "↑" : "↓";
});

const sideViewPositionTitle = computed(() => {
  if (configStore.orientation === "landscape") {
    return configStore.sideViewPosition === "right"
      ? "Move Side View to Left"
      : "Move Side View to Right";
  }
  return configStore.sideViewPosition === "bottom"
    ? "Move Side View to Top"
    : "Move Side View to Bottom";
});

const toggleOrientation = () => {
  const next = configStore.orientation === "landscape" ? "portrait" : "landscape";
  configStore.setOrientation(next);
  configStore.setSideViewPosition(next === "landscape" ? "right" : "bottom");
};

const toggleSideViewPosition = async () => {
  configStore.toggleSideViewPosition();
  try {
    await configStore.updateConfig({ sideViewPosition: configStore.sideViewPosition });
  } catch (err) {
    logError("[BarActionCluster]", "Failed to save side view position:", err);
  }
};

const showWebServices = () => {
  configStore.setLastSideViewMode("web_services");
  modeStore.setMode(modeStore.MODES.WEB_SERVICES);
};

const showPhotos = () => {
  configStore.setLastSideViewMode("photos");
  modeStore.setMode(modeStore.MODES.PHOTOS);
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
  color: var(--text-secondary);
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
  background-color: #ff9800;
  animation: bar-pulse 1.5s ease-in-out infinite;
}

.status-dot.healthy {
  background-color: #4caf50;
}

.status-dot.error {
  background-color: #f44336;
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
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
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
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.bar-btn-icon {
  font-size: 1rem;
  line-height: 1;
}

.bar-btn-label {
  font-size: 0.85rem;
}
</style>
