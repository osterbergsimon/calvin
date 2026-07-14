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
        <!-- Ambient loading comet: orbits the framed content area, riding a
             clock bar's seam where one exists. See calvin-dt7. -->
        <PerimeterProgress />

        <ClockBarVertical
          v-if="showVerticalBarLeft"
          position="left"
          :show-in-non-kiosk="true"
          :show-in-kiosk="configStore.clockBarShowInKiosk"
          :enabled="true"
        />

        <div :class="['dashboard-main', mainLayoutClass]">
          <!-- Fullscreen Mode (Calendar, Photos or Web Services) -->
          <div v-if="modeStore.isFullscreen" class="mode-content fullscreen-mode">
            <!-- Fullscreen Calendar -->
            <CalendarView
              v-if="modeStore.fullscreenMode === modeStore.MODES.CALENDAR"
              :is-fullscreen="true"
              :source-ids="modeStore.fullscreenContext?.sourceIds || []"
              :view="modeStore.fullscreenContext?.view || null"
            />
            <!-- Fullscreen Photos -->
            <PhotoSlideshow
              v-else-if="modeStore.fullscreenMode === modeStore.MODES.PHOTOS"
              :is-fullscreen="true"
              :auto-rotate="true"
              :rotation-interval="configStore.photoRotationInterval * 1000"
            />
            <!-- Fullscreen Web Services -->
            <WebServiceViewer
              v-else-if="modeStore.fullscreenMode === modeStore.MODES.WEB_SERVICES"
              :is-fullscreen="true"
              :service-id="modeStore.fullscreenContext?.serviceId || null"
            />
          </div>

          <!-- Dashboard View (Home) - Renders configured dashboard regions -->
          <div
            v-else
            ref="dashboardViewEl"
            :class="[
              'mode-content',
              'dashboard-view',
              mainLayoutClass,
              { 'dashboard-view--unlocked': !configStore.regionsLocked },
            ]"
            :style="regionChromeVars(configStore.touchControlSize)"
          >
            <template v-for="elementType in layoutOrder" :key="elementType">
              <!-- Dashboard Region -->
              <div
                v-if="isRegionElement(elementType)"
                class="dashboard-region-section"
                :class="{ 'dashboard-region-section--lit': isLitSection(elementType) }"
                :style="getRegionStyle(elementType)"
              >
                <DashboardRegion
                  :region="getRegionForElement(elementType)"
                  :path="regionPath(elementType)"
                  :photo-rotation-interval="configStore.photoRotationInterval"
                  :parent-direction="layoutDirection"
                  :active-region-id="activeScreen.activeRegionId"
                  :light-active="lightActive"
                  :dim-others="configStore.focusLightDimOthers && configStore.regionsLocked"
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

            <!-- Drag-to-resize handles (only when the layout is unlocked) -->
            <div
              v-for="handle in resizeHandles"
              :key="`resizer-${handle.firstIndex}`"
              class="region-resizer"
              :class="`region-resizer--${layoutDirection}`"
              :style="resizerStyle(handle)"
              role="separator"
              aria-orientation="vertical"
              :aria-label="`Drag to resize regions ${handle.firstIndex + 1} and ${handle.firstIndex + 2}`"
              @pointerdown="startRegionResize(handle.firstIndex, $event)"
            >
              <span class="region-resizer__grip" aria-hidden="true" />
            </div>
          </div>

          <!-- Unlocked-layout banner: clear status + one-tap re-lock -->
          <div v-if="!configStore.regionsLocked" class="layout-unlock-banner" role="status">
            <span class="layout-unlock-banner__text"
              >Layout unlocked — drag the dividers to resize</span
            >
            <button type="button" class="layout-unlock-banner__lock" @click="lockLayout">
              Lock
            </button>
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
import { onMounted, onUnmounted, computed, ref, watch, defineAsyncComponent, provide } from "vue";
import LayoutManager from "../components/LayoutManager.vue";
import DashboardRegion from "../components/DashboardRegion.vue";
import MinimalUIOverlay from "../components/MinimalUIOverlay.vue";
import ClockBarHorizontal from "../components/ClockBarHorizontal.vue";
import ClockBarVertical from "../components/ClockBarVertical.vue";
import PerimeterProgress from "../components/PerimeterProgress.vue";

const PhotoSlideshow = defineAsyncComponent(() => import("../components/PhotoSlideshow.vue"));
const WebServiceViewer = defineAsyncComponent(() => import("../components/WebServiceViewer.vue"));
const CalendarView = defineAsyncComponent(() => import("../components/CalendarView.vue"));
import { regionChromeVars } from "@/styles/regionChromeScale";
import { useConfigStore } from "../stores/config";
import { useModeStore } from "../stores/mode";
import { useCalendarStore } from "../stores/calendar";
import { useProgressStore } from "../stores/progress";
import { useRoute } from "vue-router";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { useHotCornerReveal } from "../composables/useHotCornerReveal";
import {
  getActiveDashboardScreen,
  getClockBarPlacementGap,
  getGlobalClockBarSettings,
  getLayoutDirection,
  getNodeAtPath,
  getRegionAxisStyle,
  normalizeDashboardScreens,
  applyDragSizesById,
  resizeAdjacentRegions,
  resolveClockBarForScreen,
} from "../utils/layout";

const configStore = useConfigStore();

// Press-and-hold in the reveal corner shows the UI while it's hidden. Runs at
// the window level so the corner visual stays pointer-events:none and content
// taps pass straight through. See calvin-arv.
useHotCornerReveal(configStore);
const modeStore = useModeStore();
const calendarStore = useCalendarStore();
const progressStore = useProgressStore();
const route = useRoute();

// Bridge background work into the perimeter comet. Keyed by source so a future
// per-region indicator can subscribe to its own id (see calvin-dt7); for now the
// calendar's background refresh is the single global source.
watch(
  () => calendarStore.backgroundRefreshing,
  refreshing => {
    if (refreshing) progressStore.begin("calendar");
    else progressStore.end("calendar");
  },
  { immediate: true }
);
const { focusRegion } = useKeyboardActions();

let configPollInterval = null;

const layoutDirection = computed(() =>
  getLayoutDirection(activeScreen.value?.layout, configStore.orientation)
);

const mainLayoutClass = computed(() => {
  return `layout-${configStore.orientation} layout-direction-${layoutDirection.value}`;
});

const barVisible = computed(() => configStore.shouldShowUI || configStore.clockBarShowInKiosk);

const dashboardScreens = computed(() => configStore.effectiveDashboardScreens);
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

const regionPath = elementType => {
  const regionId = elementType.replace("region:", "");
  const idx = activeScreen.value.layout.regions.findIndex(r => r.id === regionId);
  return idx >= 0 ? [idx] : [];
};

const getRegionStyle = elementType => {
  const region = getRegionForElement(elementType);
  // During a live drag, override sizes from dragSizes for instant feedback
  // without persisting on every pointer move.
  const override = region && dragSizes.value ? dragSizes.value[region.id] : undefined;
  const sized = override != null ? { ...region, size: override } : region;
  return getRegionAxisStyle(sized, layoutDirection.value);
};

// ── Drag-to-resize regions (top-level and nested) (calvin-fou) ──────────────
const dashboardViewEl = ref(null);
const dragSizes = ref(null); // { [regionId]: size } live override while dragging
let resizeState = null; // { containerPath, firstIndex, rect, direction }

// Provide the resize context so nested DashboardRegion components can
// render their own handles and report drag-start events.
provide("dashboardResize", {
  dragSizes,
  regionsLocked: computed(() => configStore.regionsLocked),
  start: startNestedResize,
});

// One handle per divider between adjacent top-level regions, skipping the
// divider occupied by a between-clock-bar. Positioned by cumulative size %.
const resizeHandles = computed(() => {
  if (configStore.regionsLocked) return [];
  const regions = activeScreen.value?.layout?.regions || [];
  if (regions.length < 2) return [];
  const betweenGap = clockBarPlacementGap.value;
  const sizeOf = region => (dragSizes.value?.[region.id] ?? region.size) || 0;
  const handles = [];
  let cumulative = 0;
  for (let i = 0; i < regions.length - 1; i++) {
    cumulative += sizeOf(regions[i]);
    if (betweenGap !== null && i === betweenGap) continue; // a bar sits here
    handles.push({ firstIndex: i, position: cumulative });
  }
  return handles;
});

const resizerStyle = handle =>
  layoutDirection.value === "column"
    ? { top: `${handle.position}%` }
    : { left: `${handle.position}%` };

// Generalised drag handler: works for any container in the layout tree.
// containerPath=[] → top-level regions; else → split.regions of the node at that path.
// containerEl is the DOM element whose bounding rect defines the drag coordinate space.
function startNestedResize(containerPath, firstIndex, containerEl, direction) {
  if (configStore.regionsLocked || !containerEl) return;
  resizeState = {
    containerPath,
    firstIndex,
    rect: containerEl.getBoundingClientRect(),
    direction,
  };
  window.addEventListener("pointermove", onNestedResizeMove);
  window.addEventListener("pointerup", stopNestedResize, { once: true });
}

const onNestedResizeMove = event => {
  if (!resizeState) return;
  const { containerPath, firstIndex, rect, direction } = resizeState;
  const isColumn = direction === "column";
  const offset = isColumn ? event.clientY - rect.top : event.clientX - rect.left;
  const axis = isColumn ? rect.height : rect.width;
  if (axis <= 0) return;
  const layout = activeScreen.value.layout;
  const container =
    containerPath.length === 0
      ? layout.regions
      : (getNodeAtPath(layout, containerPath)?.split?.regions ?? []);
  const before = container
    .slice(0, firstIndex)
    .reduce((s, r) => s + (Number(dragSizes.value?.[r.id] ?? r.size) || 0), 0);
  const nextFirstSize = (offset / axis) * 100 - before;
  const resized = resizeAdjacentRegions(container, firstIndex, nextFirstSize);
  const map = { ...(dragSizes.value || {}) };
  resized.forEach(r => {
    map[r.id] = r.size;
  });
  dragSizes.value = map;
};

const commitRegionSizes = sizes => {
  // WRITE must be based on the RAW full catalog (configStore.dashboardScreens), not
  // the filtered effective set (dashboardScreens.value). In kiosk mode the effective
  // set only contains the screens this kiosk can see; posting it to /api/config would
  // silently delete every other screen from the global catalog (data loss).
  const fullCatalog = normalizeDashboardScreens(configStore.dashboardScreens);
  const activeId = activeScreen.value?.id;
  const next = {
    ...fullCatalog,
    screens: fullCatalog.screens.map(screen =>
      screen.id !== activeId
        ? screen
        : {
            ...screen,
            // applyDragSizesById walks the entire layout tree and patches any node
            // whose id appears in `sizes`, so it works for both top-level and nested
            // regions without separate code paths.
            layout: applyDragSizesById(screen.layout, sizes),
          }
    ),
  };
  return configStore.updateConfig({ dashboardScreens: normalizeDashboardScreens(next) });
};

const stopNestedResize = () => {
  window.removeEventListener("pointermove", onNestedResizeMove);
  const sizes = dragSizes.value;
  resizeState = null;
  if (!sizes) {
    dragSizes.value = null;
    return;
  }
  // Keep the live override applied until the persisted config reflects the new
  // sizes, then clear it. Clearing first would render one frame at the old
  // committed size before the update lands — a visible snap-back on drop.
  commitRegionSizes(sizes)
    .catch(() => {}) // updateConfig already logs; keep the override-clear unconditional
    .finally(() => {
      dragSizes.value = null;
    });
};

// Backward-compat aliases so the template's @pointerdown still works.
const startRegionResize = (firstIndex, event) => {
  if (configStore.regionsLocked) return;
  event.preventDefault();
  event.stopPropagation();
  const el = dashboardViewEl.value;
  if (!el) return;
  startNestedResize([], firstIndex, el, layoutDirection.value);
};


const lockLayout = () => {
  configStore.updateConfig({ regionsLocked: true });
};

const lightActive = computed(() => {
  // While arranging the layout (unlocked), drop the focus spotlight: its large
  // blur glow + raised z-index repaint on every resize frame, which flashes the
  // neighbouring panel through. Plain opaque panels tile cleanly as you drag.
  if (!configStore.regionsLocked) return false;
  if (configStore.focusLightMode === "off") return false;
  if (configStore.focusLightMode === "always") return true;
  return configStore.shouldShowUI; // 'interaction'
});

const onFocusRegion = regionId => {
  // Focusing a region (for the focus-light / touch nav) must not bring the
  // chrome back while the UI is hidden — the hot corner is the deliberate
  // reveal. Only tap-anywhere opt-in re-shows the UI on a content tap.
  if (configStore.tapAnywhereReveal && typeof configStore.showUITemporarily === "function") {
    configStore.showUITemporarily(60);
  }
  focusRegion(regionId);
};

// A region (section) is "lit" when the focus-light is active and it contains
// the active leaf. The lit section is raised above its siblings so its glow
// isn't clipped by a later-painted neighbour.
const regionContainsLeaf = (region, leafId) => {
  if (!region || !leafId) return false;
  if (!region.split) return region.id === leafId;
  return region.split.regions.some(sub => regionContainsLeaf(sub, leafId));
};
const isLitSection = elementType => {
  if (!lightActive.value) return false;
  return regionContainsLeaf(getRegionForElement(elementType), activeScreen.value?.activeRegionId);
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
  // Drop any in-flight drag listeners and re-lock the layout on the way out so
  // it never stays editable behind the user's back.
  window.removeEventListener("pointermove", onNestedResizeMove);
  if (!configStore.regionsLocked) {
    configStore.updateConfig({ regionsLocked: true });
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
  background: var(--bg-0);
}

.dashboard-stage {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  min-width: 0;
  /* Lift the region area above the perimeter clock bars (z-index:100) so a
     focused region's glow blooms over the top/bottom bars instead of being
     clipped at their edge. The bars never overlap region content spatially,
     so only the neon bloom bleeds across — matching the between-bar behaviour. */
  position: relative;
  z-index: 101;
}

.dashboard-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  min-width: 0;
  /* Same rationale one level down: sit above the vertical (left/right) bars. */
  position: relative;
  z-index: 101;
}

.mode-content {
  width: 100%;
  flex: 1 1 auto;
  display: flex;
  gap: 0.5rem;
  min-height: 0;
  min-width: 0;
}

/* Inset the region grid from the screen edges so each panel "floats" with
   equal clearance on all sides (edge padding ≈ half the inter-panel gap),
   giving the focus-light room to glow uniformly around the whole region. */
.mode-content.dashboard-view {
  padding: 0.5rem;
  position: relative; /* anchor the absolute drag-resize handles */
}

/* When unlocked, reserve room at the bottom so the fixed .layout-unlock-banner
   (a centered pill at bottom: 1rem) doesn't occlude the bottom region's label. */
.mode-content.dashboard-view.dashboard-view--unlocked {
  padding-bottom: 4.5rem;
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

/* ── Drag-to-resize handles (calvin-fou) ─────────────────────────────────── */
.region-resizer {
  position: absolute;
  z-index: 6; /* above lit regions (z-index:3) so the grip is always grabbable */
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none; /* let pointer events drive the drag on touch screens */
}
.region-resizer--row {
  top: 0;
  bottom: 0;
  width: 28px;
  transform: translateX(-50%);
  cursor: col-resize;
}
.region-resizer--column {
  left: 0;
  right: 0;
  height: 28px;
  transform: translateY(-50%);
  cursor: row-resize;
}
.region-resizer__grip {
  background: var(--focus);
  border: 1px solid var(--focus-edge);
  border-radius: 999px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 22%, transparent);
}
.region-resizer--row .region-resizer__grip {
  width: 6px;
  height: 54px;
  max-height: 60%;
}
.region-resizer--column .region-resizer__grip {
  height: 6px;
  width: 54px;
  max-width: 60%;
}
.region-resizer:hover .region-resizer__grip,
.region-resizer:active .region-resizer__grip {
  background: var(--focus);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--focus) 28%, transparent);
}

/* Unlocked-layout banner */
.layout-unlock-banner {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  z-index: 1002;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  background: var(--bg-1);
  border: 1px solid var(--focus-edge);
  border-radius: 999px;
  box-shadow: 0 10px 30px -10px var(--focus-glow);
  font-family: var(--font-ui);
}
.layout-unlock-banner__text {
  font-size: 0.85rem;
  color: var(--ink);
  white-space: nowrap;
}
.layout-unlock-banner__lock {
  min-height: 36px;
  padding: 0 0.9rem;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}
.layout-unlock-banner__lock:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
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
  /* shrink to fit the padded container so both panels keep their margin
     (flex-shrink:0 caused the trailing panel to overflow past the edge) */
  flex-shrink: 1;
  border-radius: 0;
  /* visible so the focused panel's neon box-shadow can bloom into the gap.
     Panel content is still clipped by the panel's own overflow:hidden. */
  overflow: visible;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  position: relative;
  z-index: 0;
}
/* Raise the focused region so its glow paints over the neighbouring panels
   instead of being clipped by a later-painted sibling. */
.dashboard-region-section--lit {
  z-index: 3;
}
</style>
