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

      <!-- Service Iframe -->
      <div v-else-if="currentService" class="service-container">
        <iframe
          ref="serviceIframe"
          :src="currentService.url"
          class="service-iframe"
          :class="{ 'iframe-error': iframeError }"
          frameborder="0"
          allowfullscreen
          @load="handleIframeLoad"
          @error="handleIframeError"
        />

        <!-- CORS/Iframe Error Message -->
        <div v-if="iframeError" class="iframe-error-message">
          <div class="error-content">
            <h3>⚠️ Cannot Display Service</h3>
            <p>
              This service cannot be embedded in an iframe due to security
              restrictions (CORS/X-Frame-Options).
            </p>
            <p class="service-url">
              {{ currentService.url }}
            </p>
            <div class="error-actions">
              <a
                :href="currentService.url"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-open-new"
              >
                Open in New Window
              </a>
              <button class="btn-retry" @click="retryLoad">Retry</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useWebServicesStore } from "../stores/webServices";
import { useModeStore } from "../stores/mode";

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

const serviceIframe = ref(null);
const iframeError = ref(false);
const iframeLoadTimeout = ref(null);

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
  iframeError.value = false;
};

const previousService = () => {
  webServicesStore.previousService();
  iframeError.value = false;
};

const setServiceIndex = (index) => {
  webServicesStore.setServiceIndex(index);
  iframeError.value = false;
};

const handleIframeLoad = () => {
  // Clear any timeout
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }

  // Check if iframe actually loaded content
  // Some sites block iframes but still trigger load event
  try {
    // Try to access iframe content (will fail if blocked by CORS)
    const iframe = serviceIframe.value;
    if (iframe && iframe.contentWindow) {
      // If we can access contentWindow, it might be loaded
      // But we can't reliably check content due to CORS
      // So we'll assume it's loaded unless we get an error
      iframeError.value = false;
    }
  } catch (e) {
    // CORS error - can't access iframe content
    // This is expected for cross-origin iframes, not necessarily an error
    console.log("Cannot access iframe content (CORS):", e.message);
  }
};

const handleIframeError = () => {
  iframeError.value = true;
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }
};

const retryLoad = () => {
  iframeError.value = false;
  if (serviceIframe.value && currentService.value) {
    // Force reload by setting src again
    const url = currentService.value.url;
    serviceIframe.value.src = "";
    setTimeout(() => {
      if (serviceIframe.value) {
        serviceIframe.value.src = url;
      }
    }, 100);
  }
};

// Watch for service changes to reset error state
watch(
  () => currentService.value?.id,
  () => {
    iframeError.value = false;
    // Set a timeout to detect if iframe doesn't load
    if (iframeLoadTimeout.value) {
      clearTimeout(iframeLoadTimeout.value);
    }
    iframeLoadTimeout.value = setTimeout(() => {
      // If iframe hasn't loaded after 5 seconds, show error
      // This is a fallback for services that silently fail
      if (serviceIframe.value) {
        try {
          // Try to check if iframe has content
          const iframe = serviceIframe.value;
          if (
            iframe.contentDocument === null &&
            iframe.contentWindow === null
          ) {
            iframeError.value = true;
          }
        } catch (e) {
          // CORS error is expected, not necessarily a problem
          console.log("Cannot check iframe content (CORS):", e.message);
        }
      }
    }, 5000);
  },
);

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
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
  }
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
</style>
