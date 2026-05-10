<template>
  <LayoutManager>
    <div class="dashboard">
      <!-- Horizontal Clock Bar at Top -->
      <ClockBarHorizontal
        v-if="showHorizontalBarTop"
        position="top"
        :show-in-non-kiosk="true"
        :show-in-kiosk="configStore.clockBarShowInKiosk"
        :enabled="true"
      />

      <!-- Minimal UI overlay (shown when UI is hidden) -->
      <MinimalUIOverlay v-if="!configStore.shouldShowUI" />

      <div :class="['dashboard-main', mainLayoutClass]">
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
            v-else-if="modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES"
            :is-fullscreen="true"
          />
        </div>

        <!-- Dashboard View (Home) - Renders configured dashboard regions -->
        <div v-else :class="['mode-content', 'dashboard-view', mainLayoutClass]">
          <!-- Render elements in computed order - no CSS order needed! -->
          <template v-for="elementType in layoutOrder" :key="elementType">
            <!-- Vertical Clock Bar at Left -->
            <ClockBarVertical
              v-if="elementType === 'verticalBarLeft'"
              position="left"
              :show-in-non-kiosk="true"
              :show-in-kiosk="configStore.clockBarShowInKiosk"
              :enabled="true"
            />

            <!-- Dashboard Region -->
            <div
              v-else-if="isRegionElement(elementType)"
              :class="[
                'dashboard-region-section',
                {
                  'dashboard-region-section-active':
                    activeRegionHighlightVisible && isActiveRegionElement(elementType),
                },
              ]"
              :style="getRegionStyle(elementType)"
            >
              <DashboardRegion
                :region="getRegionForElement(elementType)"
                :photo-rotation-interval="configStore.photoRotationInterval"
                :parent-direction="layoutDirection"
                :active-region-id="
                  activeRegionHighlightVisible ? activeScreen.activeRegionId : null
                "
              />
            </div>

            <!-- Horizontal Clock Bar Between (Portrait) -->
            <ClockBarHorizontal
              v-else-if="elementType === 'horizontalBarBetween'"
              position="between"
              :show-in-non-kiosk="true"
              :show-in-kiosk="configStore.clockBarShowInKiosk"
              :enabled="true"
            />

            <!-- Vertical Clock Bar Between (Landscape) -->
            <ClockBarVertical
              v-else-if="elementType === 'verticalBarBetween'"
              position="between"
              :show-in-non-kiosk="true"
              :show-in-kiosk="configStore.clockBarShowInKiosk"
              :enabled="true"
            />

            <!-- Vertical Clock Bar at Right -->
            <ClockBarVertical
              v-else-if="elementType === 'verticalBarRight'"
              position="right"
              :show-in-non-kiosk="true"
              :show-in-kiosk="configStore.clockBarShowInKiosk"
              :enabled="true"
            />
          </template>
        </div>

        <!-- Horizontal Clock Bar at Bottom -->
        <ClockBarHorizontal
          v-if="showHorizontalBarBottom"
          position="bottom"
          :show-in-non-kiosk="true"
          :show-in-kiosk="configStore.clockBarShowInKiosk"
          :enabled="true"
        />
      </div>
    </div>
  </LayoutManager>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, defineAsyncComponent } from "vue";
import LayoutManager from "../components/LayoutManager.vue";
import DashboardRegion from "../components/DashboardRegion.vue";
import MinimalUIOverlay from "../components/MinimalUIOverlay.vue";
import ClockBarHorizontal from "../components/ClockBarHorizontal.vue";
import ClockBarVertical from "../components/ClockBarVertical.vue";

const PhotoSlideshow = defineAsyncComponent(() => import("../components/PhotoSlideshow.vue"));
const WebServiceViewer = defineAsyncComponent(() => import("../components/WebServiceViewer.vue"));
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";
import { useRoute } from "vue-router";
import {
  getActiveDashboardScreen,
  getClockBarPlacementGap,
  getGlobalClockBarSettings,
  getLayoutDirection,
  getRegionAxisStyle,
  normalizeDashboardScreens,
  resolveClockBarForScreen,
} from "../utils/layout";

const configStore = useConfigStore();
const modeStore = useModeStore();
const route = useRoute();

let configPollInterval = null;

const layoutDirection = computed(() =>
  getLayoutDirection(activeScreen.value?.layout, configStore.orientation)
);

const mainLayoutClass = computed(() => {
  return `layout-${configStore.orientation} layout-direction-${layoutDirection.value}`;
});

const barVisible = computed(() => configStore.shouldShowUI || configStore.clockBarShowInKiosk);

const dashboardScreens = computed(() => normalizeDashboardScreens(configStore.dashboardScreens));
const activeScreen = computed(() => getActiveDashboardScreen(dashboardScreens.value));

const effectiveClockBar = computed(() =>
  resolveClockBarForScreen(
    activeScreen.value,
    getGlobalClockBarSettings({
      clockBarMode: configStore.clockBarMode,
      clockBarPosition: configStore.clockBarPosition,
    })
  )
);

const clockBarActive = computed(() => effectiveClockBar.value.enabled && barVisible.value);
const isHorizontalMode = computed(() => effectiveClockBar.value.mode === "horizontal");
const isVerticalMode = computed(() => effectiveClockBar.value.mode === "vertical");
const clockBarPosition = computed(() => effectiveClockBar.value.position);
const clockBarPlacementGap = computed(() =>
  getClockBarPlacementGap(clockBarPosition.value, activeScreen.value?.layout?.regions?.length || 0)
);

const showHorizontalBarTop = computed(
  () => clockBarActive.value && isHorizontalMode.value && clockBarPosition.value === "top"
);

const showHorizontalBarBottom = computed(
  () => clockBarActive.value && isHorizontalMode.value && clockBarPosition.value === "bottom"
);

const showHorizontalBarBetween = computed(
  () =>
    clockBarActive.value &&
    isHorizontalMode.value &&
    clockBarPlacementGap.value !== null &&
    layoutDirection.value === "column"
);

const showVerticalBarLeft = computed(
  () => clockBarActive.value && isVerticalMode.value && clockBarPosition.value === "left"
);

const showVerticalBarRight = computed(
  () => clockBarActive.value && isVerticalMode.value && clockBarPosition.value === "right"
);

const showVerticalBarBetween = computed(
  () =>
    clockBarActive.value &&
    isVerticalMode.value &&
    clockBarPlacementGap.value !== null &&
    layoutDirection.value === "row"
);

// Computed layout order - determines the order elements should be rendered
const layoutOrder = computed(() => {
  const regionElements = activeScreen.value.layout.regions.map(region => `region:${region.id}`);
  if (regionElements.length <= 1) {
    return withOuterClockBars(regionElements);
  }

  const placedBetween = clockBarPlacementGap.value;

  const elements = [];
  if (showVerticalBarLeft.value) elements.push("verticalBarLeft");
  regionElements.forEach((regionElement, index) => {
    if (index > 0 && index - 1 === placedBetween) {
      if (showVerticalBarBetween.value) elements.push("verticalBarBetween");
      else if (showHorizontalBarBetween.value) elements.push("horizontalBarBetween");
    }
    elements.push(regionElement);
  });
  if (showVerticalBarRight.value) elements.push("verticalBarRight");
  return elements;
});

const withOuterClockBars = regionElements => {
  const elements = [];
  if (showVerticalBarLeft.value) elements.push("verticalBarLeft");
  elements.push(...regionElements);
  if (showVerticalBarRight.value) elements.push("verticalBarRight");
  return elements;
};

const isRegionElement = elementType => elementType.startsWith("region:");

const getRegionForElement = elementType => {
  const regionId = elementType.replace("region:", "");
  return activeScreen.value.layout.regions.find(region => region.id === regionId);
};

const getRegionStyle = elementType => {
  const region = getRegionForElement(elementType);
  return getRegionAxisStyle(region, layoutDirection.value);
};

const ACTIVE_HIGHLIGHT_MS = 2500;
const activeRegionHighlightVisible = ref(false);
let activeRegionHighlightTimer = null;

watch(
  () => activeScreen.value?.activeRegionId,
  () => {
    activeRegionHighlightVisible.value = true;
    if (activeRegionHighlightTimer) clearTimeout(activeRegionHighlightTimer);
    activeRegionHighlightTimer = setTimeout(() => {
      activeRegionHighlightVisible.value = false;
    }, ACTIVE_HIGHLIGHT_MS);
  }
);

const isActiveRegionElement = elementType => {
  const region = getRegionForElement(elementType);
  if (!region || region.split) return false;
  return region.id === activeScreen.value.activeRegionId;
};

const startConfigPolling = () => {
  // Clear existing interval if any
  if (configPollInterval) {
    clearInterval(configPollInterval);
    configPollInterval = null;
  }

  // Get polling interval from config (convert seconds to milliseconds)
  const intervalMs = configStore.configPollInterval * 1000;

  // Set up polling for config updates
  // This allows changes made from another device to appear on the Pi's display
  configPollInterval = setInterval(async () => {
    try {
      await configStore.fetchConfig();
    } catch (error) {
      console.error("Failed to fetch config updates:", error);
    }
  }, intervalMs);
};

// Watch for changes to configPollInterval and restart polling
watch(
  () => configStore.configPollInterval,
  () => {
    startConfigPolling();
  }
);

// Watch for route changes to reload config when returning from settings
watch(
  () => route.path,
  async newPath => {
    if (newPath === "/") {
      // Reload config when returning to dashboard
      await configStore.fetchConfig();
      // Restore previous mode if returning from settings
      modeStore.returnFromSettings();
    }
  }
);

onMounted(async () => {
  await configStore.fetchConfig();
  startConfigPolling();
});

onUnmounted(() => {
  if (activeRegionHighlightTimer) {
    clearTimeout(activeRegionHighlightTimer);
    activeRegionHighlightTimer = null;
  }
  if (configPollInterval) {
    clearInterval(configPollInterval);
    configPollInterval = null;
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

/* Direction overrides — when the user explicitly picks a direction,
 * it takes precedence over the orientation default. */
.mode-content.dashboard-view.layout-direction-row {
  flex-direction: row;
}

.mode-content.dashboard-view.layout-direction-column {
  flex-direction: column;
}

/* Clock bar positioning is now handled via inline styles using computed order values */
/* This makes the layout more maintainable and less dependent on CSS specificity */

.mode-content.photos-mode,
.mode-content.web-services-mode {
  gap: 0;
}

.photos-mode,
.web-services-mode {
  width: 100%;
  height: 100%;
}

.dashboard-region-section {
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  flex-shrink: 0;
  border-radius: 0;
  overflow: hidden;
  overflow-x: clip;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: outline-color 0.6s ease;
  outline: 2px solid transparent;
  outline-offset: -2px;
}

.dashboard-region-section-active {
  outline-color: var(--accent-primary);
}
</style>
