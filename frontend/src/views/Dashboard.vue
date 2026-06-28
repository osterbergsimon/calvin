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

      <!--
        Dashboard stage wraps the side perimeter bars and the body so that
        vertical left/right bars sit at the dashboard edge regardless of the
        active screen's layout direction (row vs column).
      -->
      <div class="dashboard-stage">
        <ClockBarVertical
          v-if="showVerticalBarLeft"
          position="left"
          :show-in-non-kiosk="true"
          :show-in-kiosk="configStore.clockBarShowInKiosk"
          :enabled="true"
        />

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
            <template v-for="elementType in layoutOrder" :key="elementType">
              <!-- Dashboard Region -->
              <div
                v-if="isRegionElement(elementType)"
                class="dashboard-region-section"
                :style="getRegionStyle(elementType)"
              >
                <DashboardRegion
                  :region="getRegionForElement(elementType)"
                  :photo-rotation-interval="configStore.photoRotationInterval"
                  :parent-direction="layoutDirection"
                  :active-region-id="activeScreen.activeRegionId"
                  :light-active="lightActive"
                  :dim-others="configStore.focusLightDimOthers"
                  @focus-region="onFocusRegion"
                />
              </div>

              <!-- Horizontal between bar (regions stacked vertically) -->
              <ClockBarHorizontal
                v-else-if="elementType === 'horizontalBarBetween'"
                position="between"
                :show-in-non-kiosk="true"
                :show-in-kiosk="configStore.clockBarShowInKiosk"
                :enabled="true"
              />

              <!-- Vertical between bar (regions side by side) -->
              <ClockBarVertical
                v-else-if="elementType === 'verticalBarBetween'"
                position="between"
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

        <ClockBarVertical
          v-if="showVerticalBarRight"
          position="right"
          :show-in-non-kiosk="true"
          :show-in-kiosk="configStore.clockBarShowInKiosk"
          :enabled="true"
        />
      </div>
    </div>
  </LayoutManager>
</template>

<script setup>
import { onMounted, onUnmounted, computed, watch, defineAsyncComponent } from "vue";
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
import { useKeyboardActions } from "../composables/useKeyboardActions";
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
const { focusRegion } = useKeyboardActions();

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

// Between-bar orientation follows the layout direction (perpendicular to the
// region flow), not the user-selected mode. So a 'between' position renders as
// a horizontal strip when regions stack and a vertical strip when they sit
// side by side, regardless of whether the user picked horizontal or vertical
// mode for the perimeter case.
const betweenClockBarElement = computed(() =>
  clockBarActive.value && clockBarPlacementGap.value !== null
    ? layoutDirection.value === "row"
      ? "verticalBarBetween"
      : "horizontalBarBetween"
    : null
);

const showVerticalBarLeft = computed(
  () => clockBarActive.value && isVerticalMode.value && clockBarPosition.value === "left"
);

const showVerticalBarRight = computed(
  () => clockBarActive.value && isVerticalMode.value && clockBarPosition.value === "right"
);

// Computed layout order - determines the order elements should be rendered
const layoutOrder = computed(() => {
  const regionElements = activeScreen.value.layout.regions.map(region => `region:${region.id}`);
  if (regionElements.length <= 1) return regionElements;

  const placedBetween = clockBarPlacementGap.value;
  const elements = [];
  regionElements.forEach((regionElement, index) => {
    if (index > 0 && index - 1 === placedBetween) {
      if (betweenClockBarElement.value) elements.push(betweenClockBarElement.value);
    }
    elements.push(regionElement);
  });
  return elements;
});

const isRegionElement = elementType => elementType.startsWith("region:");

const getRegionForElement = elementType => {
  const regionId = elementType.replace("region:", "");
  return activeScreen.value.layout.regions.find(region => region.id === regionId);
};

const getRegionStyle = elementType => {
  const region = getRegionForElement(elementType);
  return getRegionAxisStyle(region, layoutDirection.value);
};

const lightActive = computed(() => {
  if (configStore.focusLightMode === "off") return false;
  if (configStore.focusLightMode === "always") return true;
  return configStore.shouldShowUI; // 'interaction'
});

const onFocusRegion = regionId => {
  if (typeof configStore.showUITemporarily === "function") {
    configStore.showUITemporarily(60);
  }
  focusRegion(regionId);
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

.dashboard-stage {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  min-width: 0;
}

.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  min-width: 0;
}

.mode-content {
  width: 100%;
  flex: 1 1 auto;
  display: flex;
  gap: 1rem;
  min-height: 0;
  min-width: 0;
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
}
</style>
