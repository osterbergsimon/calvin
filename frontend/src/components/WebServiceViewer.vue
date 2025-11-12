<template>
  <div class="web-service-viewer" :class="{ fullscreen: isFullscreen }">
    <!-- Fullscreen Close Button (only in fullscreen mode) -->
    <div v-if="isFullscreen" class="fullscreen-close-overlay">
      <button
        class="btn-close-fullscreen"
        title="Close Fullscreen (ESC)"
        @click="close"
      >
        ×
      </button>
    </div>

    <!-- Header (hidden in fullscreen mode) -->
    <div v-if="showHeader && !isFullscreen" class="viewer-header">
      <div class="header-left">
        <h2>{{ currentService?.name || "Web Services" }}</h2>
        <div v-if="services.length > 1" class="service-indicator">
          Service {{ currentServiceIndex + 1 }} of {{ services.length }}
        </div>
      </div>
      <div class="header-right">
        <button
          v-if="services.length > 1"
          class="btn-nav"
          title="Previous Service"
          @click="previousService"
        >
          ‹
        </button>
        <button
          v-if="services.length > 1"
          class="btn-nav"
          title="Next Service"
          @click="nextService"
        >
          ›
        </button>
        <button
          class="btn-fullscreen"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
          @click="toggleFullscreen"
        >
          {{ isFullscreen ? "⤓" : "⤢" }}
        </button>
        <button class="btn-close" title="Close" @click="close">×</button>
      </div>
    </div>

    <!-- Service Selection (if multiple services) -->
    <div
      v-if="showHeader && !isFullscreen && services.length > 1"
      class="service-selector"
    >
      <button
        v-for="(service, index) in services"
        :key="service.id"
        class="service-btn"
        :class="{ active: index === currentServiceIndex }"
        @click="setServiceIndex(index)"
      >
        {{ service.name }}
      </button>
    </div>

    <!-- Viewer Content -->
    <div class="viewer-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="spinner" />
        <p>Loading service...</p>
      </div>

      <!-- No Services -->
      <div v-else-if="services.length === 0" class="no-services">
        <p>No web services configured</p>
        <p class="help-text">Add web services in Settings</p>
      </div>

      <!-- Service Content (uses ServiceViewer for routing) -->
      <div v-else-if="currentService" class="service-container">
        <ServiceViewer :key="currentService.id" :service="currentService" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useWebServicesStore } from "../stores/webServices";
import { useModeStore } from "../stores/mode";
import ServiceViewer from "./service/ServiceViewer.vue";

const props = defineProps({
  isFullscreen: {
    type: Boolean,
    default: false,
  },
});

const configStore = useConfigStore();
const webServicesStore = useWebServicesStore();
const modeStore = useModeStore();

const showHeader = computed(() => configStore.showUI);
const services = computed(() => webServicesStore.services);
const currentServiceIndex = computed(
  () => webServicesStore.currentServiceIndex,
);
const currentService = computed(() => webServicesStore.getCurrentService());
const loading = computed(() => webServicesStore.loading);

// ServiceViewer now handles all service rendering logic

const close = () => {
  if (props.isFullscreen) {
    // Exit fullscreen mode - return to dashboard
    modeStore.exitFullscreen();
  } else {
    // Return to calendar mode (home view)
    modeStore.setMode(modeStore.MODES.CALENDAR);
  }
};

const toggleFullscreen = () => {
  if (props.isFullscreen) {
    // Exit fullscreen - return to dashboard
    modeStore.exitFullscreen();
  } else {
    // Enter fullscreen web services
    modeStore.enterFullscreen(modeStore.MODES.WEB_SERVICES);
  }
};

const nextService = () => {
  webServicesStore.nextService();
};

const previousService = () => {
  webServicesStore.previousService();
};

const setServiceIndex = (index) => {
  webServicesStore.setServiceIndex(index);
};

// ServiceViewer handles all service rendering logic

// Handle Escape key to close fullscreen
const handleKeydown = (event) => {
  if (event.key === "Escape" && props.isFullscreen) {
    close();
    event.preventDefault();
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
  background: var(--bg-primary);
  border-radius: 8px;
  overflow: hidden;
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

.viewer-header {
  padding: 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.viewer-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.service-indicator {
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 0.25rem 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-nav,
.btn-fullscreen,
.btn-close {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  width: 32px;
  height: 32px;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-nav:hover,
.btn-fullscreen:hover,
.btn-close:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.service-selector {
  padding: 0.75rem 1rem;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.service-btn {
  padding: 0.5rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
}

.service-btn:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.service-btn.active {
  background: var(--accent-primary);
  color: #fff; /* Keep white for contrast on accent background */
  border-color: var(--accent-primary);
}

.viewer-content {
  flex: 1;
  position: relative;
  overflow: hidden;
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

.service-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.service-iframe.iframe-error {
  opacity: 0.3;
  pointer-events: none;
}

.iframe-error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  opacity: 0.95;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 2rem;
}

.error-content {
  max-width: 500px;
  text-align: center;
  background: var(--bg-primary);
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow-hover);
}

.error-content h3 {
  margin: 0 0 1rem 0;
  color: var(--accent-error);
  font-size: 1.5rem;
}

.error-content p {
  margin: 0.5rem 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.service-url {
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--text-tertiary);
  word-break: break-all;
  background: var(--bg-secondary);
  padding: 0.5rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.btn-open-new,
.btn-retry {
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-block;
}

.btn-open-new {
  background: var(--accent-secondary);
  color: #fff; /* Keep white for contrast on accent background */
  border: none;
}

.btn-open-new:hover {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.btn-retry {
  background: var(--accent-primary);
  color: #fff; /* Keep white for contrast on accent background */
  border: none;
}

.btn-retry:hover {
  background: var(--accent-primary);
  opacity: 0.9;
}

.fullscreen-close-overlay {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 100;
  pointer-events: none;
}

.btn-close-fullscreen {
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.5);
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.btn-close-fullscreen:hover {
  background: rgba(0, 0, 0, 0.9);
  border-color: rgba(255, 255, 255, 0.8);
  transform: scale(1.1);
}

/* API-based Service Styles */
.api-service-container {
  padding: 1.5rem;
  overflow-y: auto;
}

.service-data-content {
  width: 100%;
  height: 100%;
}

.meal-plan-content {
  width: 100%;
  height: 100%;
  padding: 2rem;
  overflow-y: auto;
  max-height: 100%;
  background: var(--bg-primary);
}

.meal-plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid var(--border-color);
}

.meal-plan-header h3 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.meal-plan-dates {
  font-size: 0.95rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.meal-plan-items {
  display: grid;
  gap: 1rem;
}

/* Card size variants */
.meal-plan-content.card-size-small .meal-plan-items {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.meal-plan-content.card-size-medium .meal-plan-items {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.meal-plan-content.card-size-large .meal-plan-items {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

/* Portrait mode: stack cards vertically */
@media (orientation: portrait) {
  .meal-plan-items {
    grid-template-columns: 1fr !important;
    gap: 0.75rem;
  }
  
  .meal-plan-item {
    padding: 1rem;
  }
  
  .meal-plan-header {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
  }
}

/* Smaller screens */
@media (max-width: 768px) {
  .meal-plan-items {
    grid-template-columns: 1fr !important;
    gap: 0.75rem;
  }
}

.meal-plan-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.meal-plan-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.meal-plan-date {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meal-plan-meals {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meal-item {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--bg-primary);
  border-radius: 8px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.meal-item.clickable {
  cursor: pointer;
}

.meal-item.clickable:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
  transform: translateX(6px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.meal-item.clickable .meal-name {
  color: var(--accent-primary);
  font-weight: 500;
  transition: all 0.2s ease;
}

.meal-item.clickable:hover .meal-name {
  color: var(--accent-primary);
  font-weight: 600;
}

.meal-type {
  font-weight: 700;
  color: var(--accent-primary);
  min-width: 90px;
  text-transform: capitalize;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  text-align: center;
}

.meal-name {
  color: var(--text-primary);
  flex: 1;
  font-size: 1rem;
  line-height: 1.5;
}

.no-meals {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-tertiary);
  font-size: 1.1rem;
}

.no-meals-day {
  text-align: center;
  padding: 1rem;
  color: var(--text-tertiary);
  font-style: italic;
  font-size: 0.95rem;
  background: var(--bg-tertiary);
  border-radius: 6px;
  border: 1px dashed var(--border-color);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.error-state h3 {
  margin: 0 0 1rem 0;
  color: var(--accent-error);
}

.error-state p {
  margin: 0 0 1.5rem 0;
  color: var(--text-secondary);
}
</style>
