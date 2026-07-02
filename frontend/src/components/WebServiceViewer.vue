<template>
  <div class="web-service-viewer" :class="{ fullscreen: isFullscreen }">
    <!-- Fullscreen Close Button (only in fullscreen mode) -->
    <div v-if="isFullscreen" class="fullscreen-close-overlay">
      <button
        class="btn-close-fullscreen"
        data-action="exit-fullscreen"
        title="Close Fullscreen (ESC)"
        @click.stop="handleCloseFullscreen"
      >
        ×
      </button>
    </div>

    <!-- Viewer Content -->
    <div class="viewer-content">
      <DashboardPanel
        v-if="emptyState"
        title="Web Services"
        :show-title="false"
        :header-visible="!isFullscreen"
        :focused="focused"
        :dim="dim"
      >
        <template #actions>
          <RegionControls v-if="focused" region-kind="service" />
        </template>
        <div :class="emptyState.className">
          <div v-if="emptyState.loading" class="spinner" />
          <p>{{ emptyState.message }}</p>
          <p v-if="emptyState.helpText" class="help-text">{{ emptyState.helpText }}</p>
        </div>
      </DashboardPanel>

      <!-- Service Content (uses ServiceViewer for routing) -->
      <div v-else-if="currentService" class="service-container">
        <ServiceViewer
          :key="currentService.id"
          :service="currentService"
          :subtitle="serviceSubtitle"
          :header-visible="!isFullscreen"
          :focused="focused"
        >
          <template #actions>
            <RegionControls v-if="focused" region-kind="service" />
            <button
              v-if="!isTouch && canNavigateServices && services.length > 1"
              class="dashboard-panel__icon-button"
              title="Previous Service"
              @click="previousService"
            >
              ‹
            </button>
            <button
              v-if="!isTouch && canNavigateServices && services.length > 1"
              class="dashboard-panel__icon-button"
              title="Next Service"
              @click="nextService"
            >
              ›
            </button>
            <button
              v-if="!isTouch && !isFullscreen"
              class="dashboard-panel__icon-button"
              title="Enter Fullscreen"
              @click.stop="handleToggleFullscreen"
            >
              ⤢
            </button>
            <button
              v-if="!isFullscreen"
              class="dashboard-panel__icon-button"
              title="Close"
              @click.stop="handleClose"
            >
              ×
            </button>
          </template>
        </ServiceViewer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import { useWebServicesStore } from "../stores/webServices";
import { useModeStore } from "../stores/mode";
import DashboardPanel from "./DashboardPanel.vue";
import ServiceViewer from "./service/ServiceViewer.vue";
import RegionControls from "./dashboard/RegionControls.vue";
import { useTouchCapability } from "@/composables/useTouchCapability";

const props = defineProps({
  focused: {
    type: Boolean,
    default: false,
  },
  dim: {
    type: Boolean,
    default: false,
  },
  isFullscreen: {
    type: Boolean,
    default: false,
  },
  serviceId: {
    type: String,
    default: null,
  },
});

const { isTouch } = useTouchCapability();

const webServicesStore = useWebServicesStore();
const modeStore = useModeStore();

const services = computed(() => webServicesStore.services);
const currentServiceIndex = computed(() => webServicesStore.currentServiceIndex);
const canNavigateServices = computed(() => !props.serviceId);
const currentService = computed(() => {
  if (props.serviceId) return webServicesStore.getServiceById(props.serviceId);
  // No serviceId is only valid in fullscreen mode (cycling through services).
  if (props.isFullscreen) return webServicesStore.getCurrentService();
  return null;
});
const loading = computed(() => webServicesStore.loading);
const serviceUnavailable = computed(
  () =>
    !loading.value &&
    services.value.length > 0 &&
    (Boolean(props.serviceId) || !props.isFullscreen) &&
    !currentService.value
);
const serviceSubtitle = computed(() =>
  canNavigateServices.value && services.value.length > 1
    ? `Service ${currentServiceIndex.value + 1} of ${services.value.length}`
    : ""
);
const emptyState = computed(() => {
  if (loading.value) {
    return { className: "loading-state", loading: true, message: "Loading service..." };
  }
  if (services.value.length === 0) {
    return {
      className: "no-services",
      message: "No web services configured",
      helpText: "Add web services in Settings",
    };
  }
  if (serviceUnavailable.value) {
    return {
      className: "no-services",
      message: "Selected service is unavailable",
      helpText: "Choose another service in Settings",
    };
  }
  return null;
});

// ServiceViewer now handles all service rendering logic

// Prevent multiple rapid clicks
let isHandlingClose = false;
let isHandlingToggle = false;

const close = () => {
  if (isHandlingClose) return;
  isHandlingClose = true;

  if (props.isFullscreen) {
    // Exit fullscreen mode - return to dashboard
    // This will preserve the web service in the side panel
    modeStore.exitFullscreen();
  } else {
    // Return to calendar mode (home view)
    modeStore.setMode(modeStore.MODES.CALENDAR);
  }

  // Reset flag after a short delay
  setTimeout(() => {
    isHandlingClose = false;
  }, 300);
};

const handleClose = event => {
  event.preventDefault();
  event.stopPropagation();
  close();
};

const handleCloseFullscreen = event => {
  event.preventDefault();
  event.stopPropagation();
  close();
};

const toggleFullscreen = () => {
  if (isHandlingToggle) return;
  isHandlingToggle = true;

  if (props.isFullscreen) {
    // Exit fullscreen - return to dashboard
    // This will preserve the web service in the side panel
    modeStore.exitFullscreen();
  } else {
    // Enter fullscreen web services
    modeStore.enterFullscreen(modeStore.MODES.WEB_SERVICES);
  }

  // Reset flag after a short delay
  setTimeout(() => {
    isHandlingToggle = false;
  }, 300);
};

const handleToggleFullscreen = event => {
  event.preventDefault();
  event.stopPropagation();
  toggleFullscreen();
};

const nextService = () => {
  if (props.serviceId) return;
  webServicesStore.nextService();
};

const previousService = () => {
  if (props.serviceId) return;
  webServicesStore.previousService();
};

// ServiceViewer handles all service rendering logic

// Handle Escape key to close fullscreen
const handleKeydown = event => {
  if (event.key === "Escape" && props.isFullscreen && !isHandlingClose) {
    close();
    event.preventDefault();
    event.stopPropagation();
  }
};

onMounted(async () => {
  await webServicesStore.fetchServices();
  // Add keyboard listener for Escape key
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  // Remove keyboard listener
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<style scoped>
.web-service-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-1);
  border-radius: 8px;
  overflow: visible; /* let the focused panel glow bloom out */
}

.web-service-viewer.fullscreen {
  border-radius: 0;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

.viewer-content {
  flex: 1;
  position: relative;
  /* visible so the focused panel's neon glow can bloom out — the iframe/content
     is still clipped by the panel body's own overflow:hidden. */
  overflow: visible;
  min-height: 0;
}

.loading-state,
.no-services {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.help-text {
  font-size: 0.9rem;
  font-style: italic;
}

.service-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.fullscreen-close-overlay {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 100;
  pointer-events: none;
}

.btn-close-fullscreen {
  background: var(--bg-2);
  color: var(--ink);
  border: 2px solid var(--line);
  border-radius: 50%;
  width: 48px;
  height: 48px;
  font-size: 2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  pointer-events: auto;
  box-shadow: 0 4px 12px var(--shadow);
}

.btn-close-fullscreen:hover {
  background: var(--bg-1);
  border-color: var(--ink-2);
  transform: scale(1.1);
}

.btn-close-fullscreen:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
