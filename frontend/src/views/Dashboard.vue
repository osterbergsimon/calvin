<template>
  <LayoutManager>
    <div class="dashboard">
      <div v-if="configStore.showUI" class="dashboard-header">
        <h1>Calvin Dashboard</h1>
        <Clock
          v-if="configStore.clockEnabled"
          :display-mode="configStore.clockDisplayMode"
          :show-date="configStore.clockShowDate"
        />
        <div class="header-controls">
          <div class="status-indicator">
            <span :class="['status-dot', statusClass]" />
            <span>{{ statusText }}</span>
          </div>
          <button
            class="btn-orientation"
            :title="`Switch to ${configStore.orientation === 'landscape' ? 'portrait' : 'landscape'} view`"
            @click="toggleOrientation"
          >
            {{ configStore.orientation === "landscape" ? "📱" : "🖥️" }}
            {{
              configStore.orientation === "landscape" ? "Portrait" : "Landscape"
            }}
          </button>
          <button
            v-if="modeStore.currentMode !== modeStore.MODES.WEB_SERVICES"
            class="btn-web-services"
            title="Show Web Services"
            @click="showWebServices"
          >
            Web Services
          </button>
          <button
            v-else
            class="btn-web-services"
            title="Show Photos"
            @click="showPhotos"
          >
            Photos
          </button>
          <button
            class="btn-side-position"
            :title="sideViewPositionTitle"
            @click="toggleSideViewPosition"
          >
            {{ sideViewPositionIcon }}
          </button>
          <button class="btn-settings" title="Settings" @click="goToSettings">
            ⚙️ Settings
          </button>
          <button
            class="btn-minimal"
            title="Hide UI"
            @click="configStore.toggleUI"
          >
            ⊖
          </button>
        </div>
      </div>

      <!-- Minimal UI overlay (shown when UI is hidden) -->
      <MinimalUIOverlay />
      <ModeIndicator />
      
      <!-- Clock (when display mode is 'always' - only shown when UI is off) -->
      <Clock
        v-if="configStore.clockEnabled && configStore.clockDisplayMode === 'always'"
        :display-mode="configStore.clockDisplayMode"
        :show-date="configStore.clockShowDate"
        :class="['clock-overlay', `position-${configStore.clockPosition || 'top-right'}`]"
      />

      <div class="dashboard-main" :class="mainLayoutClass">
        <!-- Fullscreen Mode (Photos or Web Services) -->
        <div v-if="modeStore.isFullscreen" class="mode-content fullscreen-mode">
          <!-- Fullscreen Photos -->
          <PhotoSlideshow
            v-if="modeStore.fullscreenMode === modeStore.MODES.PHOTOS"
            :is-fullscreen="true"
            :auto-rotate="true"
            :rotation-interval="configStore.photoRotationInterval * 1000"
          />
          <!-- Fullscreen Web Services -->
          <WebServiceViewer
            v-else-if="
              modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES
            "
            :is-fullscreen="true"
          />
        </div>

        <!-- Dashboard View (Home) - Always shows calendar + side view -->
        <div
          v-else
          class="mode-content dashboard-view"
          :class="[mainLayoutClass, sideViewPositionClass]"
        >
          <!-- Calendar Section (66-75%) -->
          <div
            class="calendar-section"
            :style="{ width: calendarWidth, height: calendarHeight }"
          >
            <CalendarView />
          </div>

          <!-- Right/Bottom Section (25-33%) - Shows current mode content -->
          <div
            class="secondary-section"
            :style="{ width: secondaryWidth, height: secondaryHeight }"
          >
            <!-- Show content based on current mode -->
            <WebServiceViewer
              v-if="modeStore.currentMode === modeStore.MODES.WEB_SERVICES"
              :is-fullscreen="false"
            />
            <PhotoSlideshow
              v-else-if="modeStore.currentMode === modeStore.MODES.PHOTOS"
              :is-fullscreen="false"
              :auto-rotate="true"
              :rotation-interval="configStore.photoRotationInterval * 1000"
            />
            <!-- Default: show photos when in calendar mode -->
            <PhotoSlideshow
              v-else
              :is-fullscreen="false"
              :auto-rotate="true"
              :rotation-interval="configStore.photoRotationInterval * 1000"
            />
          </div>
        </div>
      </div>
    </div>
  </LayoutManager>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import axios from "axios";
import LayoutManager from "../components/LayoutManager.vue";
import CalendarView from "../components/CalendarView.vue";
import PhotoSlideshow from "../components/PhotoSlideshow.vue";
import WebServiceViewer from "../components/WebServiceViewer.vue";
import MinimalUIOverlay from "../components/MinimalUIOverlay.vue";
import ModeIndicator from "../components/ModeIndicator.vue";
import Clock from "../components/Clock.vue";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";
import { useRouter } from "vue-router";

const configStore = useConfigStore();
const modeStore = useModeStore();
const router = useRouter();

const status = ref("checking...");
const statusClass = computed(() => {
  if (status.value === "healthy") return "healthy";
  if (status.value === "checking...") return "checking";
  return "error";
});

const statusText = computed(() => {
  return status.value.charAt(0).toUpperCase() + status.value.slice(1);
});

// Polling interval for config updates (30 seconds)
let configPollInterval = null;

const isLandscape = computed(() => configStore.orientation === "landscape");
const isPortrait = computed(() => configStore.orientation === "portrait");

const calendarWidth = computed(() => {
  return isLandscape.value ? configStore.calendarWidth : "100%";
});

const calendarHeight = computed(() => {
  return isPortrait.value ? configStore.calendarWidth : "100%";
});

const secondaryWidth = computed(() => {
  return isLandscape.value ? configStore.photosWidth : "100%";
});

const secondaryHeight = computed(() => {
  return isPortrait.value ? configStore.photosWidth : "100%";
});

const mainLayoutClass = computed(() => {
  return `layout-${configStore.orientation}`;
});

const sideViewPositionClass = computed(() => {
  return `side-${configStore.sideViewPosition}`;
});

const sideViewPositionTitle = computed(() => {
  if (configStore.orientation === "landscape") {
    return configStore.sideViewPosition === "right"
      ? "Move Side View to Left"
      : "Move Side View to Right";
  } else {
    return configStore.sideViewPosition === "bottom"
      ? "Move Side View to Top"
      : "Move Side View to Bottom";
  }
});

const sideViewPositionIcon = computed(() => {
  if (configStore.orientation === "landscape") {
    return configStore.sideViewPosition === "right" ? "←" : "→";
  } else {
    return configStore.sideViewPosition === "bottom" ? "↑" : "↓";
  }
});

const toggleOrientation = () => {
  const newOrientation =
    configStore.orientation === "landscape" ? "portrait" : "landscape";
  configStore.setOrientation(newOrientation);
  // Reset side view position to default when switching orientation
  if (newOrientation === "landscape") {
    configStore.setSideViewPosition("right");
  } else {
    configStore.setSideViewPosition("bottom");
  }
};

const toggleSideViewPosition = async () => {
  configStore.toggleSideViewPosition();
  // Save the config change
  try {
    await configStore.updateConfig({
      sideViewPosition: configStore.sideViewPosition,
    });
  } catch (error) {
    console.error("Failed to save side view position:", error);
  }
};

const showWebServices = () => {
  modeStore.setMode(modeStore.MODES.WEB_SERVICES);
};

const showPhotos = () => {
  modeStore.setMode(modeStore.MODES.PHOTOS);
};

const goToSettings = () => {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push("/settings");
};

const checkHealth = async () => {
  try {
    const response = await axios.get("/api/health", { timeout: 5000 });
    if (response.data && response.data.status === "healthy") {
      status.value = "healthy";
    } else {
      status.value = "unhealthy";
    }
  } catch (error) {
    // Only set error if it's not a timeout or network error (might be temporary)
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      status.value = "checking...";
    } else {
      status.value = "error";
    }
    console.error("Health check failed:", error);
  }
};

let healthInterval = null;

onMounted(async () => {
  // Check health immediately and then periodically
  checkHealth();
  healthInterval = setInterval(checkHealth, 30000); // Check every 30 seconds
  
  // Fetch config on mount
  await configStore.fetchConfig();
  // Set up polling for config updates (every 30 seconds)
  // This allows changes made from another device to appear on the Pi's display
  configPollInterval = setInterval(async () => {
    try {
      await configStore.fetchConfig();
    } catch (error) {
      console.error("Failed to fetch config updates:", error);
    }
  }, 30000); // Poll every 30 seconds
});

onUnmounted(() => {
  // Clean up polling intervals
  if (configPollInterval) {
    clearInterval(configPollInterval);
    configPollInterval = null;
  }
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
});
</script>

<style scoped>
.dashboard {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 0;
  background: var(--bg-secondary);
}

.dashboard:has(.dashboard-header) {
  padding: 1rem;
  gap: 1rem;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: 0 2px 4px var(--shadow);
  gap: 1rem;
  flex-wrap: wrap;
}

.dashboard-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot.checking {
  background-color: #ff9800;
  animation: pulse 1.5s ease-in-out infinite;
}

.status-dot.healthy {
  background-color: #4caf50;
}

.status-dot.error {
  background-color: #f44336;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.btn-orientation {
  background: var(--accent-secondary);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-orientation:hover {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.btn-web-services {
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-web-services:hover {
  background: var(--accent-primary);
  opacity: 0.9;
}

.btn-side-position {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
}

.btn-side-position:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.btn-settings {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-settings:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.btn-minimal {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-minimal:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.dashboard-main {
  flex: 1;
  display: flex;
  gap: 1rem;
  min-height: 0; /* Important for flex children */
  flex-direction: row; /* Default to row (landscape) */
}

.dashboard-main.layout-portrait {
  flex-direction: column; /* Portrait: stack vertically */
}

.dashboard-main.layout-landscape {
  flex-direction: row; /* Landscape: side by side */
}

.mode-content {
  width: 100%;
  height: 100%;
  display: flex;
  gap: 1rem;
}

.mode-content.dashboard-view.layout-portrait {
  flex-direction: column; /* Portrait: stack calendar and secondary vertically */
}

.mode-content.dashboard-view.layout-landscape {
  flex-direction: row; /* Landscape: side by side */
}

/* Side view position: Landscape (left/right) */
.mode-content.dashboard-view.layout-landscape.side-left .calendar-section {
  order: 2; /* Calendar on right */
}

.mode-content.dashboard-view.layout-landscape.side-left .secondary-section {
  order: 1; /* Secondary on left */
}

.mode-content.dashboard-view.layout-landscape.side-right .calendar-section {
  order: 1; /* Calendar on left */
}

.mode-content.dashboard-view.layout-landscape.side-right .secondary-section {
  order: 2; /* Secondary on right */
}

/* Side view position: Portrait (top/bottom) */
.mode-content.dashboard-view.layout-portrait.side-top .calendar-section {
  order: 2; /* Calendar on bottom */
}

.mode-content.dashboard-view.layout-portrait.side-top .secondary-section {
  order: 1; /* Secondary on top */
}

.mode-content.dashboard-view.layout-portrait.side-bottom .calendar-section {
  order: 1; /* Calendar on top */
}

.mode-content.dashboard-view.layout-portrait.side-bottom .secondary-section {
  order: 2; /* Secondary on bottom */
}

.mode-content.photos-mode,
.mode-content.web-services-mode {
  gap: 0;
}

.photos-mode,
.web-services-mode {
  width: 100%;
  height: 100%;
}

.calendar-section {
  min-width: 0; /* Important for flex children */
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
}

.dashboard:not(:has(.dashboard-header)) .calendar-section {
  border-radius: 0;
}

.secondary-section {
  min-width: 0; /* Important for flex children */
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
}

.dashboard:not(:has(.dashboard-header)) .secondary-section {
  border-radius: 0;
}

.clock-overlay {
  position: fixed;
  z-index: 1000;
  background: var(--bg-primary);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--shadow);
  /* Offset from edges to avoid covering calendar elements */
}

.clock-overlay.position-top-left {
  top: 0.5rem;
  left: 0.5rem;
}

.clock-overlay.position-top-right {
  top: 0.5rem;
  right: 1rem;
  /* Additional offset for top-right to avoid calendar day markers */
}

.clock-overlay.position-bottom-left {
  bottom: 0.5rem;
  left: 0.5rem;
}

.clock-overlay.position-bottom-right {
  bottom: 0.5rem;
  right: 0.5rem;
}
</style>
