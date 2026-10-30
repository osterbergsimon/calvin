<template>
  <teleport to="body">
    <div
      v-if="open"
      class="sre-root dialog-above-osk"
      :class="[`size-${sizeClass}`, { 'is-coarse': coarsePointer }]"
      role="dialog"
      aria-modal="true"
      aria-label="Pages and regions"
    >
      <DialogScrim blur @dismiss="$emit('close')" />
      <div ref="modalEl" class="sre-modal">
        <!-- Header -->
        <header class="sre-header">
          <div class="sre-title">
            <h2>Pages &amp; regions</h2>
            <p class="sre-sub">
              Design the pages your screens display · drag dividers to resize, the clock bar to
              reposition · changes apply live
            </p>
          </div>
          <IconButton
            class="sre-close"
            variant="ghost"
            size="md"
            label="Close editor"
            @click="$emit('close')"
          >
            ×
          </IconButton>
        </header>

        <!-- Context strip: page tabs + preview-on -->
        <div class="sre-context">
          <div class="sre-tabs" role="tablist" aria-label="Pages">
            <button
              v-for="page in screens.screens"
              :key="page.id"
              type="button"
              role="tab"
              class="sre-tab"
              :class="{
                'is-active': page.id === activeScreenId,
                'is-dimmed': isPageDimmed(page.id),
              }"
              :aria-selected="page.id === activeScreenId"
              @click="selectScreen(page.id)"
            >
              <span class="sre-tab-body">
                <span class="sre-tab-name"><span class="sre-tab-dot" />{{ page.name }}</span>
                <span class="sre-tab-screens" data-test="page-screens">{{
                  screensLine(page.id)
                }}</span>
              </span>
            </button>
            <button
              type="button"
              class="sre-tab-add"
              aria-label="Add page"
              title="Add page"
              @click="addScreen"
            >
              +
            </button>
          </div>
          <div class="sre-preview-as">
            <span class="sre-preview-label">Preview on</span>
            <SelectPill
              :model-value="previewScreenId"
              :options="screenOptions"
              aria-label="Preview on screen"
              @update:model-value="setPreviewScreen"
            />
            <SegmentedControl
              v-if="previewScreenId === ANY_BROWSER"
              class="sre-orient-toggle"
              :model-value="anyBrowserOrientation"
              :options="[
                { value: 'landscape', label: 'Landscape' },
                { value: 'portrait', label: 'Portrait' },
              ]"
              aria-label="Preview orientation"
              @update:model-value="setAnyBrowserOrientation"
            />
            <span class="sre-orient-badge" data-test="orientation-badge">{{
              orientationBadge
            }}</span>
          </div>
        </div>

        <!-- Body: stage + rail -->
        <div v-if="placeSource" class="sre-place" data-test="place-banner">
          <span class="sre-place__text"
            >Choose a region for <strong>{{ placeSource.name }}</strong></span
          >
          <button
            type="button"
            class="sre-place__cancel"
            data-test="place-cancel"
            @click="$emit('place-cancel')"
          >
            Cancel
          </button>
        </div>

        <div class="sre-body" :class="{ 'is-sheet-open': isPhone && sheetOpen }">
          <!-- STAGE -->
          <div ref="stageEl" class="sre-stage" @click="onStageClick">
            <div class="sre-stage-tag"><span class="dot" /> {{ stageTag }}</div>

            <div v-if="mismatch" class="sre-mismatch" data-test="mismatch">
              <span class="sre-mismatch__text"
                >⚠️ <strong>{{ previewScreenName }}</strong> doesn’t show “{{
                  activeScreen.name
                }}”.</span
              >
              <button
                type="button"
                class="sre-mismatch__btn"
                :disabled="showItBusy"
                @click="showItOnScreen"
              >
                Show it on {{ previewScreenName }}
              </button>
              <span v-if="showItError" class="sre-mismatch__error" role="alert">{{
                showItError
              }}</span>
            </div>

            <div class="sre-stage-focus">
              <div class="sre-device-wrap" :class="{ dimmed: mismatch }">
                <div
                  class="sre-device"
                  :class="[orientation, { 'is-narrow': deviceNarrow }]"
                  :style="deviceSize"
                >
                  <div
                    :ref="el => (screenEl = el)"
                    class="sre-screen"
                    :class="`dir-${layoutDir}`"
                    :style="clockAxisStyle"
                  >
                    <!-- perimeter drop zones (only while dragging the clock bar) -->
                    <template v-if="clock.enabled && clockDrag && clockDraggable">
                      <div
                        v-if="clock.position !== 'top'"
                        class="sre-drop perim top"
                        @dragenter.prevent
                        @dragover.prevent
                        @drop.prevent="dropClock('top')"
                      >
                        <span>Top</span>
                      </div>
                      <div
                        v-if="clock.position !== 'bottom'"
                        class="sre-drop perim bottom"
                        @dragenter.prevent
                        @dragover.prevent
                        @drop.prevent="dropClock('bottom')"
                      >
                        <span>Bottom</span>
                      </div>
                      <div
                        v-if="clock.position !== 'left'"
                        class="sre-drop perim left"
                        @dragenter.prevent
                        @dragover.prevent
                        @drop.prevent="dropClock('left')"
                      >
                        <span>Left</span>
                      </div>
                      <div
                        v-if="clock.position !== 'right'"
                        class="sre-drop perim right"
                        @dragenter.prevent
                        @dragover.prevent
                        @drop.prevent="dropClock('right')"
                      >
                        <span>Right</span>
                      </div>
                    </template>

                    <!-- clock bar: top/left (leading perimeter) -->
                    <div
                      v-if="clock.enabled && clock.position === leadingPerimeter"
                      class="sre-clockbar drag"
                      :class="clock.mode === 'vertical' ? 'v' : 'h'"
                      :draggable="clockDraggable"
                      role="button"
                      tabindex="0"
                      :title="clockTitle"
                      :aria-label="clockAria"
                      @dragstart="beginClockDrag"
                      @dragend="endClockDrag"
                      @click.stop="selectClockBar"
                      @keydown.enter.prevent="selectClockBar"
                      @keydown.space.prevent="selectClockBar"
                    >
                      <span v-if="clockDraggable" class="sre-clock-grip" aria-hidden="true">⠿</span>
                      {{ previewClock }}
                    </div>

                    <div
                      :ref="el => (regionsEl = el)"
                      class="sre-regions"
                      :class="`dir-${layoutDir}`"
                    >
                      <template v-for="(region, i) in activeScreen.layout.regions" :key="region.id">
                        <!-- clock drop zone at the gap before region i -->
                        <div
                          v-if="
                            clock.enabled &&
                            clockDrag &&
                            clockDraggable &&
                            i > 0 &&
                            betweenIndex !== i - 1
                          "
                          class="sre-drop gap"
                          :class="layoutDir === 'row' ? 'v' : 'h'"
                          @dragenter.prevent
                          @dragover.prevent
                          @drop.prevent="dropClock(i - 1 === 0 ? 'between' : `between:${i - 1}`)"
                        >
                          <span class="sre-drop-plus">+</span>
                        </div>

                        <!-- clock bar between region i-1 and i -->
                        <div
                          v-if="clock.enabled && betweenIndex === i - 1"
                          class="sre-clockbar between drag"
                          :class="layoutDir === 'row' ? 'v' : 'h'"
                          :draggable="clockDraggable"
                          role="button"
                          tabindex="0"
                          :title="clockTitle"
                          :aria-label="clockAria"
                          @dragstart="beginClockDrag"
                          @dragend="endClockDrag"
                          @click.stop="selectClockBar"
                          @keydown.enter.prevent="selectClockBar"
                          @keydown.space.prevent="selectClockBar"
                        >
                          <span v-if="clockDraggable" class="sre-clock-grip" aria-hidden="true"
                            >⠿</span
                          >
                          {{ previewTime }}
                        </div>

                        <RegionNode
                          :region="region"
                          :path="[i]"
                          :parent-direction="layoutDir"
                          :selected-id="selectedRegionId"
                          :layout-dir="layoutDir"
                          :coarse="coarsePointer"
                          :narrow="deviceNarrow"
                          @select="selectRegion"
                          @resize="onNodeResize"
                        />

                        <button
                          v-if="i < activeScreen.layout.regions.length - 1"
                          type="button"
                          class="sre-resizer"
                          :class="layoutDir === 'row' ? 'col' : 'row'"
                          :style="coarseResizerStyle"
                          aria-label="Resize regions"
                          @pointerdown="startResize(i, $event)"
                        >
                          <span class="grip" />
                          <span class="pill"
                            >{{ region.size }} / {{ activeScreen.layout.regions[i + 1].size }}</span
                          >
                        </button>
                      </template>
                    </div>

                    <!-- clock bar: bottom/right (trailing perimeter) -->
                    <div
                      v-if="clock.enabled && clock.position === trailingPerimeter"
                      class="sre-clockbar drag"
                      :class="clock.mode === 'vertical' ? 'v' : 'h'"
                      :draggable="clockDraggable"
                      role="button"
                      tabindex="0"
                      :title="clockTitle"
                      :aria-label="clockAria"
                      @dragstart="beginClockDrag"
                      @dragend="endClockDrag"
                      @click.stop="selectClockBar"
                      @keydown.enter.prevent="selectClockBar"
                      @keydown.space.prevent="selectClockBar"
                    >
                      <span v-if="clockDraggable" class="sre-clock-grip" aria-hidden="true">⠿</span>
                      {{ previewClock }}
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="sizeClass === 'compact'"
                class="sre-orient-caption"
                data-test="orientation-caption"
              >
                {{ orientationBadge }}
              </div>
            </div>

            <div v-if="!mismatch && previewScreenId !== ANY_BROWSER" class="sre-preview-note">
              Previewing on {{ previewScreenName }} · edits change the shared “{{
                activeScreen.name
              }}” page
            </div>
          </div>

          <!-- RAIL (a bottom sheet on phones) -->
          <aside
            class="sre-rail"
            :class="{
              'is-sheet': isPhone,
              'is-open': isPhone && sheetOpen,
              'no-motion': isPhone && reduceMotion,
            }"
            :role="isPhone ? 'region' : null"
            :aria-label="isPhone ? 'Inspector' : null"
          >
            <div v-if="isPhone" class="sre-sheet-peek" data-test="sheet-peek" @click="toggleSheet">
              <span
                class="sre-sheet-handle"
                data-test="sheet-handle"
                @pointerdown.stop="startSheetDrag"
              />
              <span class="sre-sheet-label" data-test="sheet-selection">{{
                sheetSelectionLabel
              }}</span>
              <button
                type="button"
                class="sre-sheet-chevron"
                data-test="sheet-chevron"
                :aria-label="sheetOpen ? 'Hide settings' : 'Show settings'"
                :aria-expanded="sheetOpen"
                @click.stop="toggleSheet"
              >
                {{ sheetOpen ? "⌄" : "⌃" }}
              </button>
            </div>
            <div class="sre-rail-scroll">
              <RegionInspector
                v-if="selectedRegion"
                :region="selectedRegion"
                :screen="activeScreen"
                :layout-dir="layoutDir"
                :component-options="componentOptions"
                :source-options="sourceOptionsFor(selectedRegion.kind)"
                :context="selectionContext"
                @patch-view="patchSelectedView"
                @set-component="setSelectedComponent"
                @toggle-source="toggleSelectedSource"
                @clear-sources="clearSelectedSources"
                @toggle-split="toggleSplitSelected"
                @toggle-sub-direction="toggleSubDirSelected"
                @add-sub="addSubToSelected"
                @remove="removeSelected"
                @deselect="selectedRegionId = null"
              />
              <ScreenInspector
                v-else
                :screen="activeScreen"
                :layout-dir="layoutDir"
                :clock="clock"
                :can-delete="screens.screens.length > 1"
                @rename="renameScreen"
                @preset="applyPreset"
                @add-region="addRegion"
                @toggle-direction="toggleLayoutDir"
                @clock-enabled="setClockEnabled"
                @clock-position="setClockPosition"
                @clock-inherit="clearClock"
                @duplicate="duplicateScreen"
                @delete="deleteActiveScreen"
              />
            </div>
          </aside>
        </div>
      </div>

      <ConfirmModal
        :show="!!replaceTarget"
        title="Replace what's in this region?"
        :message="replaceMessage"
        confirm-text="Replace"
        @confirm="confirmReplace"
        @cancel="replaceTarget = null"
      />
    </div>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useWebServicesStore } from "@/stores/webServices";
import { useCalendarStore } from "@/stores/calendar";
import { useKiosksStore } from "@/stores/kiosks";
import { useConfigStore } from "@/stores/config";
import { usePlugins } from "@/composables";
import { buildComponentOptions } from "@/utils/componentPicker";
import DialogScrim from "@/components/ui/DialogScrim.vue";
import IconButton from "@/components/ui/IconButton.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import { getKioskId } from "@/utils/kioskId";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import { findPlaceableRegion, placeKindInRegion, placeServiceInRegion } from "@/utils/placement";
import ScreenInspector from "./regions/ScreenInspector.vue";
import RegionInspector from "./regions/RegionInspector.vue";
import RegionNode from "./regions/RegionNode.vue";
import { logError } from "@/utils/logger";
import {
  MAX_TOP_REGIONS,
  addTopRegion,
  canSplitAtPath,
  computeClockBarPositionUpdate,
  createDashboardScreenFromPreset,
  createDashboardLayoutFromPreset,
  getClockBarBetweenIndex,
  getGlobalClockBarSettings,
  getLayoutDirection,
  getNodeAtPath,
  getPathById,
  getSplitDirection,
  normalizeDashboardScreens,
  removeRegionAtPath,
  resizePairAtPath,
  resolveClockBarForScreen,
  setLayoutDirection,
  setRegionContentAtPath,
  setRegionView,
  setSplitDirectionAtPath,
  splitRegionAtPath,
  unsplitRegionAtPath,
  addSubRegionAtPath,
} from "@/utils/layout";

const props = defineProps({
  config: { type: Object, required: true, default: () => ({}) },
  open: { type: Boolean, default: false },
  // A screen to preview when the editor opens ("Edit pages" on a screen). A
  // kiosk preselects itself; otherwise the editor starts on Any browser.
  initialPreviewKiosk: { type: String, default: null },
  // A source to place (§3.6): the stage becomes a chooser and choosing a region
  // sets its content to this service instead of selecting the region.
  placeSource: { type: Object, default: null },
  // Open on this page (a placement link names the page it lives on).
  initialPageId: { type: String, default: null },
  // Open with this region selected ("Where it shows" lines from Content).
  initialRegionId: { type: String, default: null },
});
const emit = defineEmits(["update:config", "close", "placed", "place-cancel"]);

const ANY_BROWSER = "__global";
const webServicesStore = useWebServicesStore();
const calendarStore = useCalendarStore();
const kiosksStore = useKiosksStore();
const { plugins, pluginInstances, loadingPlugins, loadPlugins } = usePlugins();

const selectedRegionId = ref(null);
const previewScreenId = ref(ANY_BROWSER);
const anyBrowserOrientation = ref("landscape");
const showItBusy = ref(false);
const showItError = ref("");
const screenEl = ref(null);
const regionsEl = ref(null);
const dragState = ref(null);

/* --- size class + touch capability --------------------------------------- */
// The editor's layout follows the MODAL's own size, not a viewport media
// query: a kiosk with the on-screen keyboard open has a full-size viewport but
// only the space above the keyboard to draw in. ResizeObserver gives that
// directly, so the OSK shrinking the modal re-evaluates the class too.
const modalEl = ref(null);
const stageEl = ref(null);
const modalSize = ref({ width: 0, height: 0 });
const stageSize = ref({ width: 0, height: 0 });
const WIDE_MIN_WIDTH = 1024;
const WIDE_MIN_HEIGHT = 640;
const COMPACT_MIN_WIDTH = 600;

const sizeClass = computed(() => {
  const { width, height } = modalSize.value;
  // Unmeasured (first paint, or a test host without ResizeObserver): keep
  // today's layout until the observer reports.
  if (!width || !height) return "wide";
  if (width >= WIDE_MIN_WIDTH && height >= WIDE_MIN_HEIGHT) return "wide";
  if (width >= COMPACT_MIN_WIDTH) return "compact";
  return "phone";
});
const isPhone = computed(() => sizeClass.value === "phone");

const coarsePointer = ref(false);
const reduceMotion = ref(false);
const mediaCleanups = [];
const watchMedia = (query, target) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const mql = window.matchMedia(query);
  target.value = Boolean(mql.matches);
  const handler = event => {
    target.value = Boolean(event.matches);
  };
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", handler);
    mediaCleanups.push(() => mql.removeEventListener("change", handler));
  } else if (typeof mql.addListener === "function") {
    mql.addListener(handler);
    mediaCleanups.push(() => mql.removeListener(handler));
  }
};
watchMedia("(any-pointer: coarse)", coarsePointer);
watchMedia("(prefers-reduced-motion: reduce)", reduceMotion);

let modalObserver = null;
let stageObserver = null;
const stopObserving = () => {
  modalObserver?.disconnect();
  stageObserver?.disconnect();
  modalObserver = null;
  stageObserver = null;
};
const startObserving = () => {
  if (typeof ResizeObserver === "undefined") return;
  stopObserving();
  modalObserver = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect;
    if (box) modalSize.value = { width: box.width, height: box.height };
  });
  stageObserver = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect;
    if (box) stageSize.value = { width: box.width, height: box.height };
  });
  if (modalEl.value) modalObserver.observe(modalEl.value);
  if (stageEl.value) stageObserver.observe(stageEl.value);
};

/* --- model --- */
const configValue = computed(() => props.config || {});
const orientationConfig = computed(() => configValue.value.orientation ?? "landscape");
const screens = computed(() => normalizeDashboardScreens(configValue.value.dashboardScreens));
const activeScreenId = computed(
  () =>
    screens.value.screens.find(s => s.id === screens.value.activeScreenId)?.id ||
    screens.value.screens[0]?.id
);
const activeScreen = computed(
  () => screens.value.screens.find(s => s.id === activeScreenId.value) || screens.value.screens[0]
);
const activeIndex = computed(() =>
  screens.value.screens.findIndex(s => s.id === activeScreenId.value)
);

/* --- preview on a screen --- */
// A screen's name is its `displayName` override (§3.3); without one, its
// hostname, then its install id.
const kioskName = kiosk => kiosk?.overrides?.displayName || kiosk?.hostname || kiosk?.id || "";
const screenOptions = computed(() => {
  const options = [
    { value: ANY_BROWSER, label: "Any browser" },
    ...kiosksStore.kiosks.map(k => ({ value: k.id, label: kioskName(k) })),
  ];
  // A kiosk preselected before the list loaded (or one that is not registered
  // yet) still needs a label, or the pill would read blank.
  if (
    previewScreenId.value !== ANY_BROWSER &&
    !options.some(o => o.value === previewScreenId.value)
  ) {
    options.push({ value: previewScreenId.value, label: previewScreenId.value });
  }
  return options;
});
const previewKiosk = computed(
  () => kiosksStore.kiosks.find(k => k.id === previewScreenId.value) || null
);
// GET /kiosks already carries each kiosk's override layer, so previewing one
// needs no extra request (CLV-36). A preselected id that is not in the list yet
// still gets an option so the picker shows its id.
const previewOverrides = computed(() => previewKiosk.value?.overrides || {});
const previewScreenName = computed(() => kioskName(previewKiosk.value) || previewScreenId.value);
const orientation = computed(() =>
  previewScreenId.value === ANY_BROWSER
    ? anyBrowserOrientation.value
    : previewOverrides.value.orientation || orientationConfig.value
);
const previewFlipped = computed(
  () => previewOverrides.value.orientationFlipped ?? configValue.value.orientationFlipped ?? false
);
const previewViewport = computed(() => {
  if (previewScreenId.value === ANY_BROWSER) return null;
  const vp = previewKiosk.value?.viewport;
  return vp && vp.w > 0 && vp.h > 0 ? vp : null;
});
const orientationBadge = computed(() =>
  [
    orientation.value === "portrait" ? "Portrait" : "Landscape",
    previewViewport.value ? `${previewViewport.value.w}×${previewViewport.value.h}` : "",
    previewFlipped.value ? "mounted upside down" : "",
  ]
    .filter(Boolean)
    .join(" · ")
);
// A kiosk shows every page unless it has an explicit allowlist; an empty
// allowlist means it shows none.
const kioskShowsPage = (kiosk, pageId) => {
  const avail = kiosk?.overrides?.availableScreens;
  return !Array.isArray(avail) || avail.includes(pageId);
};
const screensShowingPage = pageId => kiosksStore.kiosks.filter(k => kioskShowsPage(k, pageId));
const screensLine = pageId => {
  const all = kiosksStore.kiosks;
  if (all.length === 0) return "All screens";
  const showing = screensShowingPage(pageId);
  if (showing.length === all.length) return "All screens";
  if (showing.length === 0) return "Not on any screen";
  return showing.map(kioskName).join(" · ");
};
const isPageDimmed = pageId =>
  previewScreenId.value !== ANY_BROWSER && !kioskShowsPage(previewKiosk.value, pageId);
const mismatch = computed(
  () =>
    previewScreenId.value !== ANY_BROWSER &&
    Array.isArray(previewOverrides.value.availableScreens) &&
    !previewOverrides.value.availableScreens.includes(activeScreenId.value)
);
const stageTag = computed(() =>
  previewScreenId.value === ANY_BROWSER
    ? `Live preview · “${activeScreen.value.name}”`
    : `Preview on ${previewScreenName.value} · “${activeScreen.value.name}”`
);
const setAnyBrowserOrientation = next => {
  // Preview-only: never emitted, never saved.
  anyBrowserOrientation.value = next;
};
// The shared orientation can hydrate after the editor mounts.
watch(orientationConfig, next => {
  if (previewScreenId.value === ANY_BROWSER) anyBrowserOrientation.value = next;
});

/* --- layout direction + clock bar --- */
const layoutDir = computed(() => getLayoutDirection(activeScreen.value.layout, orientation.value));
const globalClock = computed(() => getGlobalClockBarSettings(configValue.value));
const clock = computed(() => resolveClockBarForScreen(activeScreen.value, globalClock.value));
const betweenIndex = computed(() => getClockBarBetweenIndex(clock.value.position));
const leadingPerimeter = computed(() => (clock.value.mode === "vertical" ? "left" : "top"));
const trailingPerimeter = computed(() => (clock.value.mode === "vertical" ? "right" : "bottom"));
const clockAxisStyle = computed(() => {
  // The screen shell stacks perimeter bars opposite the region axis.
  const perimeterVertical = clock.value.mode === "vertical";
  return { flexDirection: perimeterVertical ? "row" : "column" };
});

/* --- device sizing --- */
// The device box follows the screen's real aspect ratio when it has reported
// one; otherwise a 16:9 / 9:16 stand-in for its orientation. Its size is the
// largest box of that ratio that fits the stage (§2), never the old fixed 560.
const DEVICE_FALLBACK_MAX = 560;
const DEVICE_MIN_LONG_SIDE = 200;
const STAGE_PADDING = 16;
const STAGE_CHROME_HEIGHT = 72; // the stage tag above + the caption/note below

const sheetOpen = ref(false);
const clockSelected = ref(false);

const deviceBox = computed(() => {
  const vp = previewViewport.value;
  const aspect = vp ? vp.w / vp.h : orientation.value === "portrait" ? 9 / 16 : 16 / 9;
  const stageW = stageSize.value.width;
  const stageH = stageSize.value.height;
  let width;
  let height;
  if (!stageW || !stageH) {
    // Before the stage is measured (or in a host without ResizeObserver).
    width = aspect >= 1 ? DEVICE_FALLBACK_MAX : DEVICE_FALLBACK_MAX * aspect;
    height = aspect >= 1 ? DEVICE_FALLBACK_MAX / aspect : DEVICE_FALLBACK_MAX;
  } else {
    const availW = Math.max(0, stageW - STAGE_PADDING * 2);
    const availH = Math.max(0, stageH - STAGE_PADDING * 2 - STAGE_CHROME_HEIGHT);
    if (aspect >= 1) {
      width = Math.min(availW, availH * aspect);
      height = width / aspect;
    } else {
      height = Math.min(availH, availW / aspect);
      width = height * aspect;
    }
  }
  const longSide = Math.max(width, height);
  if (longSide <= 0) {
    // A stage too small even for the minimum: still show the minimum box.
    width = aspect >= 1 ? DEVICE_MIN_LONG_SIDE : DEVICE_MIN_LONG_SIDE * aspect;
    height = aspect >= 1 ? DEVICE_MIN_LONG_SIDE / aspect : DEVICE_MIN_LONG_SIDE;
  } else if (longSide < DEVICE_MIN_LONG_SIDE) {
    const scale = DEVICE_MIN_LONG_SIDE / longSide;
    width *= scale;
    height *= scale;
  }
  return { width: Math.round(width), height: Math.round(height) };
});
const deviceSize = computed(() => ({
  width: `${deviceBox.value.width}px`,
  height: `${deviceBox.value.height}px`,
}));
// Under 320px the region labels step down to --fs-xs so they still fit.
const deviceNarrow = computed(() => Math.max(deviceBox.value.width, deviceBox.value.height) < 320);
const coarseResizerStyle = computed(() => (coarsePointer.value ? { flex: "0 0 28px" } : null));

/* --- selection --- */
const selectedPath = computed(() =>
  selectedRegionId.value ? getPathById(activeScreen.value.layout, selectedRegionId.value) : null
);
const selectedRegion = computed(() => {
  const path = selectedPath.value;
  return path ? getNodeAtPath(activeScreen.value.layout, path) : null;
});
const selectionContext = computed(() => {
  const path = selectedPath.value;
  if (!path) return null;
  const node = getNodeAtPath(activeScreen.value.layout, path);
  const parent =
    path.length > 1 ? getNodeAtPath(activeScreen.value.layout, path.slice(0, -1)) : null;
  const owner = node?.split ? node : parent;
  return {
    depth: path.length,
    isSub: path.length > 1,
    canSplit: canSplitAtPath(path) && !node?.split,
    canAddSub: Boolean(owner?.split) && owner.split.regions.length < MAX_TOP_REGIONS,
    splitDir: owner?.split ? getSplitDirection(owner.split, layoutDir.value) : layoutDir.value,
  };
});
const regionLabel = region =>
  region?.kind === "calendar" ? "Calendar" : region?.kind === "photos" ? "Photos" : "Service";
const selectRegion = id => {
  // Place mode turns the stage into a chooser: a tap fills the region rather
  // than opening the inspector.
  if (props.placeSource) {
    handlePlaceTap(id);
    return;
  }
  const next = selectedRegionId.value === id ? null : id;
  selectedRegionId.value = next;
  if (next) {
    clockSelected.value = false;
    if (isPhone.value) sheetOpen.value = true;
  }
};
// Tapping the clock bar (touch or compact/phone, where it does not drag) shows
// its settings; Position in ScreenInspector is the way to move it (§4).
const selectClockBar = () => {
  selectedRegionId.value = null;
  clockSelected.value = true;
  if (isPhone.value) sheetOpen.value = true;
};
const toggleSheet = () => {
  sheetOpen.value = !sheetOpen.value;
};
const sheetSelectionLabel = computed(() => {
  if (selectedRegion.value) return `Region · ${regionLabel(selectedRegion.value)}`;
  if (clockSelected.value) return "Clock bar";
  return `Page · ${activeScreen.value.name}`;
});
// Tapping the stage's empty area closes the sheet to its peek (§3).
const onStageClick = event => {
  if (!isPhone.value || !sheetOpen.value) return;
  const target = event?.target;
  if (target?.closest?.(".sre-region, .sre-resizer, .sre-clockbar, .sre-drop, .sre-mismatch")) {
    return;
  }
  sheetOpen.value = false;
};
// Dragging the sheet handle down past a threshold closes it (§3).
let sheetDrag = null;
const stopSheetDrag = () => {
  sheetDrag = null;
  window.removeEventListener("pointermove", onSheetDragMove);
};
const onSheetDragMove = event => {
  if (!sheetDrag) return;
  if ((event.clientY ?? 0) - sheetDrag.startY > 40) {
    sheetOpen.value = false;
    stopSheetDrag();
  }
};
const startSheetDrag = event => {
  if (!event) return;
  sheetDrag = { startY: event.clientY ?? 0 };
  window.addEventListener("pointermove", onSheetDragMove);
  window.addEventListener("pointerup", stopSheetDrag, { once: true });
};
const selectScreen = id => {
  selectedRegionId.value = null;
  clockSelected.value = false;
  sheetOpen.value = false;
  emitScreens({ ...screens.value, activeScreenId: id });
};

/* --- data sources --- */
const services = computed(() => webServicesStore.services);
const componentOptions = computed(() => buildComponentOptions(services.value));
const calendarSources = computed(() =>
  (calendarStore.sources || [])
    .filter(s => s.enabled !== false)
    .map(s => ({ id: s.id, name: s.name }))
);
const imageInstances = computed(() =>
  plugins.value
    .filter(p => p.type === "image" && p.enabled)
    .flatMap(p => pluginInstances.value[p.id] || [])
    .filter(i => i.enabled !== false)
    .map(i => ({ id: i.id, name: i.name }))
);
const sourceOptionsFor = kind => {
  if (kind === "calendar") return calendarSources.value;
  if (kind === "photos") return imageInstances.value;
  return [];
};

/* --- emit helpers --- */
const emitScreens = next =>
  emit("update:config", { dashboardScreens: normalizeDashboardScreens(next) });
const cloneLayout = () => JSON.parse(JSON.stringify(activeScreen.value.layout));
const updateActiveLayout = layout => {
  const next = JSON.parse(JSON.stringify(screens.value));
  next.screens[activeIndex.value].layout = layout;
  emitScreens(next);
};
const patchActiveScreen = patch => {
  const next = JSON.parse(JSON.stringify(screens.value));
  next.screens[activeIndex.value] = { ...next.screens[activeIndex.value], ...patch };
  emitScreens(next);
};

/* --- place a service source (§3.6) --- */
const replaceTarget = ref(null);

const replaceMessage = computed(() => {
  const target = replaceTarget.value;
  const name = props.placeSource?.name || "this source";
  return target ? `Replace ${target.current} with ${name}?` : "";
});

const describeRegion = region => {
  if (region?.kind === "service") {
    return webServicesStore.getServiceById(region.serviceId)?.name || "another app";
  }
  if (region?.kind === "photos") return "Photos";
  return "Calendar";
};

const commitPlacement = regionId => {
  if (!props.placeSource) return;
  const kind = props.placeSource.kind;
  const next =
    kind && kind !== "service"
      ? placeKindInRegion(configValue.value.dashboardScreens, kind, regionId)
      : placeServiceInRegion(configValue.value.dashboardScreens, props.placeSource.id, regionId);
  emit("update:config", { dashboardScreens: next });
  replaceTarget.value = null;
  emit("placed", props.placeSource.id);
};

// Declared as a function so selectRegion (defined above) can call it.
function handlePlaceTap(regionId) {
  const found = findPlaceableRegion(configValue.value, regionId);
  if (!found) return;
  const region = found.region;
  const hasContent =
    region.kind === "service" ? !!region.serviceId : (region.instanceIds || []).length > 0;
  if (hasContent) {
    replaceTarget.value = { regionId, current: describeRegion(region) };
    return;
  }
  commitPlacement(regionId);
}

const confirmReplace = () => {
  if (replaceTarget.value) commitPlacement(replaceTarget.value.regionId);
};

// A deep link ("Where it shows") may switch pages; remember the region until
// the page switch settles, because the activeScreenId watcher clears selection.
const pendingRegionId = ref(null);
const selectDeepLinkedRegion = id => {
  if (!id) return;
  if (getPathById(activeScreen.value.layout, id)) {
    selectedRegionId.value = id;
    if (isPhone.value) sheetOpen.value = true;
  }
};
const applyInitialSelection = async () => {
  if (props.initialPageId) {
    const pageChanges = props.initialPageId !== activeScreenId.value;
    if (pageChanges) pendingRegionId.value = props.initialRegionId;
    selectScreen(props.initialPageId);
    await nextTick();
  }
  if (!pendingRegionId.value) selectDeepLinkedRegion(props.initialRegionId);
};

// A placement link names the page the source is on: open the editor there. A
// "Where it shows" line also names the region, so open its inspector too.
watch(
  () => props.open,
  async open => {
    if (open) await applyInitialSelection();
    if (!open) {
      pendingRegionId.value = null;
      replaceTarget.value = null;
    }
  },
  { immediate: true }
);

/* --- screen ops --- */
const addScreen = () => {
  const next = JSON.parse(JSON.stringify(screens.value));
  const screen = createDashboardScreenFromPreset("split_two", {
    name: `Page ${next.screens.length + 1}`,
  });
  next.screens.push(screen);
  next.activeScreenId = screen.id;
  selectedRegionId.value = null;
  emitScreens(next);
};
const duplicateScreen = () => {
  const next = JSON.parse(JSON.stringify(screens.value));
  const copy = JSON.parse(JSON.stringify(next.screens[activeIndex.value]));
  copy.id = `screen-${Math.random().toString(36).slice(2, 8)}`;
  copy.name = `${activeScreen.value.name} copy`;
  next.screens.splice(activeIndex.value + 1, 0, copy);
  next.activeScreenId = copy.id;
  emitScreens(next);
};
const deleteActiveScreen = () => {
  if (screens.value.screens.length <= 1) return;
  const next = JSON.parse(JSON.stringify(screens.value));
  const idx = activeIndex.value;
  next.screens.splice(idx, 1);
  next.activeScreenId = next.screens[Math.min(idx, next.screens.length - 1)].id;
  selectedRegionId.value = null;
  emitScreens(next);
};
const renameScreen = name => patchActiveScreen({ name: name || "Screen" });
const applyPreset = preset => {
  const layout = createDashboardLayoutFromPreset(preset, activeScreen.value.layout);
  selectedRegionId.value = null;
  updateActiveLayout(layout);
};
const toggleLayoutDir = () => {
  const next = layoutDir.value === "column" ? "row" : "column";
  updateActiveLayout(setLayoutDirection(cloneLayout(), next));
};

/* --- region ops --- */
const addRegion = () => {
  if (activeScreen.value.layout.regions.length >= MAX_TOP_REGIONS) return;
  updateActiveLayout(addTopRegion(cloneLayout()));
};
const removeSelected = () => {
  const p = selectedPath.value;
  if (!p) return;
  updateActiveLayout(removeRegionAtPath(cloneLayout(), p));
  selectedRegionId.value = null;
};
const toggleSplitSelected = () => {
  const p = selectedPath.value;
  if (!p) return;
  const node = getNodeAtPath(activeScreen.value.layout, p);
  if (!node) return;
  updateActiveLayout(
    node.split ? unsplitRegionAtPath(cloneLayout(), p) : splitRegionAtPath(cloneLayout(), p)
  );
};
const toggleSubDirSelected = () => {
  const p = selectedPath.value;
  if (!p) return;
  const node = getNodeAtPath(activeScreen.value.layout, p);
  if (!node) return;
  // Owner is the node itself if split, otherwise its parent.
  const ownerPath = node.split ? p : p.slice(0, -1);
  const owner = getNodeAtPath(activeScreen.value.layout, ownerPath);
  if (!owner?.split) return;
  const cur = getSplitDirection(owner.split, layoutDir.value);
  updateActiveLayout(
    setSplitDirectionAtPath(cloneLayout(), ownerPath, cur === "column" ? "row" : "column")
  );
};
const addSubToSelected = () => {
  const p = selectedPath.value;
  if (!p) return;
  const node = getNodeAtPath(activeScreen.value.layout, p);
  if (!node) return;
  const ownerPath = node.split ? p : p.slice(0, -1);
  updateActiveLayout(addSubRegionAtPath(cloneLayout(), ownerPath));
};
const setSelectedComponent = option => {
  const p = selectedPath.value;
  if (!p) return;
  updateActiveLayout(
    setRegionContentAtPath(cloneLayout(), p, {
      kind: option.kind,
      serviceId: option.kind === "service" ? option.instanceIds?.[0] || null : null,
      instanceIds: option.instanceIds || [],
    })
  );
};
const toggleSelectedSource = (sourceId, checked) => {
  const p = selectedPath.value;
  if (!p) return;
  const node = getNodeAtPath(activeScreen.value.layout, p);
  if (!node || node.kind === "service") return;
  const cur = new Set(node.instanceIds || []);
  if (checked) cur.add(sourceId);
  else cur.delete(sourceId);
  updateActiveLayout(
    setRegionContentAtPath(cloneLayout(), p, { kind: node.kind, instanceIds: [...cur] })
  );
};
const clearSelectedSources = () => {
  const p = selectedPath.value;
  if (!p) return;
  const node = getNodeAtPath(activeScreen.value.layout, p);
  if (!node) return;
  updateActiveLayout(
    setRegionContentAtPath(cloneLayout(), p, { kind: node.kind, instanceIds: [] })
  );
};
const patchSelectedView = patch => {
  const region = selectedRegion.value;
  if (!region) return;
  emitScreens(
    setRegionView(JSON.parse(JSON.stringify(screens.value)), region.id, patch, activeScreenId.value)
  );
};

/* --- clock bar --- */
const setClockEnabled = enabled => {
  const cur = activeScreen.value.clockBar || {};
  patchActiveScreen({ clockBar: { ...cur, enabled } });
};
const setClockPosition = position => {
  const update = computeClockBarPositionUpdate(activeScreen.value, position, globalClock.value);
  if (!update) return;
  if (update.clear) return clearClock();
  const cur = activeScreen.value.clockBar || {};
  const merged = { ...cur, ...update.patch };
  Object.keys(merged).forEach(k => merged[k] == null && delete merged[k]);
  patchActiveScreen({ clockBar: Object.keys(merged).length ? merged : null });
};
const clearClock = () => patchActiveScreen({ clockBar: null });

/* --- clock bar drag-to-reposition (HTML5 DnD; keyboard users use the rail's
   Position picker, which enumerates every gap) --- */
const clockDrag = ref(false);
// HTML5 drag is not available to touch, and the compact/phone stage has no
// room for drop zones. Everywhere else Position in the inspector moves it.
const clockDraggable = computed(() => !coarsePointer.value && sizeClass.value === "wide");
const clockTitle = computed(() =>
  clockDraggable.value ? "Drag to reposition the clock bar" : "Tap to change the clock bar"
);
const clockAria = computed(() =>
  clockDraggable.value ? "Clock bar — drag to reposition" : "Clock bar — tap to change its position"
);
const beginClockDrag = event => {
  if (!clockDraggable.value) return;
  clockDrag.value = true;
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    // Firefox refuses to start a drag unless data is set.
    event.dataTransfer.setData("text/plain", "clock-bar");
  }
};
const endClockDrag = () => {
  clockDrag.value = false;
};
const dropClock = position => {
  setClockPosition(position);
  clockDrag.value = false;
};

/* --- resize --- */
// Unified handler for both top-level and nested resizers.
// Top-level resizers call this with containerId = null and el = the .sre-regions element.
// Nested resizers (from RegionNode) call via the @resize event with containerId = the
// split node's id and el = the RegionNode's containerEl (the .sre-subsplit div).
const onNodeResize = ({ containerId, firstIndex, event, direction, el }) => {
  if (event) event.preventDefault();
  const rect = el?.getBoundingClientRect();
  if (!rect) return;
  const containerPath = containerId ? getPathById(activeScreen.value.layout, containerId) : [];
  dragState.value = { containerPath, firstIndex, direction, rect };
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", stopResize, { once: true });
};
const startResize = (firstIndex, event) => {
  event.preventDefault();
  const el = regionsEl.value;
  if (!el) return;
  onNodeResize({ containerId: null, firstIndex, event: null, direction: layoutDir.value, el });
};
const onResizeMove = event => {
  const s = dragState.value;
  if (!s) return;
  const isColumn = s.direction === "column";
  const offset = isColumn ? event.clientY - s.rect.top : event.clientX - s.rect.left;
  const axis = isColumn ? s.rect.height : s.rect.width;
  // Compute the cumulative size of regions before firstIndex in the container.
  const containerRegions =
    s.containerPath.length === 0
      ? activeScreen.value.layout.regions
      : (getNodeAtPath(activeScreen.value.layout, s.containerPath)?.split?.regions ?? []);
  const prev = containerRegions.slice(0, s.firstIndex).reduce((a, r) => a + r.size, 0);
  const nextSize = (offset / axis) * 100 - prev;
  updateActiveLayout(resizePairAtPath(cloneLayout(), s.containerPath, s.firstIndex, nextSize));
};
const stopResize = () => {
  dragState.value = null;
  window.removeEventListener("pointermove", onResizeMove);
};

const setPreviewScreen = id => {
  previewScreenId.value = id;
  showItError.value = "";
  if (id === ANY_BROWSER) anyBrowserOrientation.value = orientationConfig.value;
};
// Add the active page to the previewed screen's allowlist (GET, merge, PUT).
// No allowlist means it already shows every page, so there is nothing to save.
const showItOnScreen = async () => {
  const kiosk = previewKiosk.value;
  if (!kiosk) return;
  showItBusy.value = true;
  showItError.value = "";
  try {
    const fresh = await kiosksStore.fetchOverrides(kiosk.id);
    const next = { ...fresh };
    if (
      !Array.isArray(fresh.availableScreens) ||
      fresh.availableScreens.includes(activeScreenId.value)
    ) {
      // It already shows every page (or this one): only the local copy was stale.
      kiosksStore.setKioskOverrides(kiosk.id, next);
      return;
    }
    next.availableScreens = [...fresh.availableScreens, activeScreenId.value];
    await kiosksStore.saveOverrides(kiosk.id, next);
    kiosksStore.setKioskOverrides(kiosk.id, next);
  } catch (err) {
    logError("[ScreenRegionEditor]", "Failed to assign page to screen:", err);
    showItError.value = `Couldn't update ${previewScreenName.value}. Try again.`;
  } finally {
    showItBusy.value = false;
  }
};

/* --- opening: on a kiosk → that screen; from Edit pages → that screen --- */
const applyInitialPreview = () => {
  setPreviewScreen(props.initialPreviewKiosk || getKioskId() || ANY_BROWSER);
};
watch(
  () => props.open,
  async open => {
    if (open) {
      applyInitialPreview();
      await nextTick();
      startObserving();
    } else {
      stopObserving();
      modalSize.value = { width: 0, height: 0 };
      stageSize.value = { width: 0, height: 0 };
      sheetOpen.value = false;
    }
  }
);

/* keep selection valid when screen changes */
watch(activeScreenId, () => {
  if (pendingRegionId.value) {
    const id = pendingRegionId.value;
    pendingRegionId.value = null;
    selectDeepLinkedRegion(id);
    return;
  }
  selectedRegionId.value = null;
  clockSelected.value = false;
});
// Leaving the phone layout closes the sheet; it only exists there.
watch(isPhone, phone => {
  if (!phone) sheetOpen.value = false;
  else if (selectedRegionId.value) sheetOpen.value = true;
});

// The clock-bar stand-in shows the real time in the dashboard's format, not a
// frozen sample (F8). Minute resolution is plenty for a preview.
const configStore = useConfigStore();
const now = ref(new Date());
let clockTimer = null;
const previewTime = computed(() =>
  now.value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: configStore.timeFormat === "12h",
  })
);
const previewClock = computed(
  () => `${previewTime.value} · ${now.value.toLocaleDateString([], { weekday: "short" })}`
);

onMounted(async () => {
  if (props.open) {
    applyInitialPreview();
    startObserving();
  }
  clockTimer = setInterval(() => (now.value = new Date()), 30000);
  if (webServicesStore.services.length === 0 && !webServicesStore.loading)
    webServicesStore.fetchServices();
  if (calendarStore.sources.length === 0 && !calendarStore.loading) calendarStore.fetchSources();
  if (plugins.value.length === 0 && !loadingPlugins.value) loadPlugins();
  if (kiosksStore.kiosks.length === 0) kiosksStore.loadKiosks();
});
onUnmounted(() => {
  window.removeEventListener("pointermove", onResizeMove);
  window.removeEventListener("pointermove", onSheetDragMove);
  stopObserving();
  mediaCleanups.forEach(cleanup => cleanup());
  clearInterval(clockTimer);
});
</script>

<style scoped>
.sre-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5vh 2vw;
}
.sre-modal {
  position: relative;
  z-index: 1001;
  width: min(1240px, 100%);
  height: min(820px, 100%);
  display: grid;
  grid-template-rows: auto auto 1fr;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.4);
  animation: sre-rise 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes sre-rise {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sre-modal {
    animation: none;
  }
}

.sre-header {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-xl) var(--space-2xl);
  border-bottom: 1px solid var(--line);
}
.sre-title h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 650;
  color: var(--ink);
}
.sre-sub {
  margin: 0.15rem 0 0;
  font-size: var(--fs-xs);
  color: var(--ink-3);
}
.sre-close {
  margin-left: auto;
  font-size: 1.3rem;
  line-height: 1;
}

.sre-context {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-sm) var(--space-2xl);
  border-bottom: 1px solid var(--line);
  background: var(--bg-0);
}
.sre-tabs {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  overflow-x: auto;
}
.sre-tab {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2xs) var(--space-md);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink-2);
  font-size: var(--fs-sm);
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
}
.sre-tab:hover {
  background: var(--bg-2);
}
.sre-tab.is-active {
  background: var(--bg-1);
  border-color: var(--line);
  color: var(--ink);
  box-shadow: 0 1px 3px var(--shadow);
  font-weight: 650;
}
.sre-tab-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}
.sre-tab-name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
}
.sre-tab-screens {
  font-size: var(--fs-xs);
  font-weight: 400;
  color: var(--ink-3);
  white-space: nowrap;
}
.sre-tab.is-dimmed {
  opacity: 0.5;
}
.sre-tab-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--focus);
  opacity: 0.6;
}
.sre-tab.is-active .sre-tab-dot {
  opacity: 1;
}
.sre-tab-add {
  width: 30px;
  height: 30px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink-3);
  font-size: 1.05rem;
  cursor: pointer;
}
.sre-tab-add:hover {
  border-color: var(--focus);
  color: var(--focus);
}
.sre-preview-as {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--fs-xs);
  color: var(--ink-2);
}
.sre-preview-label {
  color: var(--ink-3);
}
.sre-orient-badge {
  font-size: var(--fs-2xs);
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: var(--bg-2);
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.sre-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  min-height: 0;
}

/* Place mode banner: the stage is a chooser while this is up. */
.sre-place {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1.25rem;
  background: color-mix(in srgb, var(--focus) 14%, var(--bg-1));
  border-top: 1px solid var(--focus-edge, var(--line));
  border-bottom: 1px solid var(--focus-edge, var(--line));
  font-family: var(--font-ui);
  font-size: 0.95rem;
  color: var(--ink);
}
.sre-place__cancel {
  min-height: var(--touch-target);
  padding: 0 1rem;
  background: var(--bg-1);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-family: var(--font-ui);
  font-weight: 600;
  cursor: pointer;
}
.sre-place__cancel:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.sre-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  overflow: hidden;
  background: radial-gradient(
    120% 120% at 50% 8%,
    var(--bg-0),
    color-mix(in srgb, var(--bg-0) 60%, #000 6%)
  );
}
.sre-stage-tag {
  position: absolute;
  top: var(--space-xl);
  left: var(--space-2xl);
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  font-size: var(--fs-2xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.sre-stage-tag .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
}
.sre-mismatch {
  position: absolute;
  top: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  max-width: 78%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  font-size: var(--fs-xs);
  line-height: 1.35;
  color: var(--ink);
  background: color-mix(in srgb, var(--warn) 16%, var(--bg-1));
  border: 1px solid color-mix(in srgb, var(--warn) 50%, transparent);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-sm);
}
.sre-mismatch__btn {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--focus) 55%, transparent);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--focus) 16%, transparent);
  color: var(--focus);
  font-size: var(--fs-xs);
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  cursor: pointer;
}
.sre-mismatch__btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--focus) 28%, transparent);
}
.sre-mismatch__btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.sre-mismatch__error {
  flex-basis: 100%;
  color: var(--ink-2);
  text-align: center;
}
.sre-preview-note {
  position: absolute;
  bottom: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--fs-2xs);
  color: var(--ink-3);
  background: var(--bg-1);
  border: 1px solid var(--line);
  padding: var(--space-2xs) var(--space-md);
  border-radius: var(--radius-pill);
}

.sre-device-wrap {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.sre-stage-focus {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  min-width: 0;
}
.sre-device-wrap.dimmed {
  opacity: 0.45;
  filter: saturate(0.6);
}
.sre-device {
  position: relative;
  padding: 12px;
  border-radius: 18px;
  background: linear-gradient(160deg, #33383f, #1b1e24);
  box-shadow:
    0 30px 50px -18px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition:
    width 0.5s cubic-bezier(0.16, 1, 0.3, 1),
    height 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.sre-screen {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 7px;
  background: #06070a;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    inset 0 0 22px rgba(0, 0, 0, 0.5);
}
.sre-regions {
  display: flex;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
  min-height: 0;
}
.sre-regions.dir-row {
  flex-direction: row;
}
.sre-regions.dir-column {
  flex-direction: column;
}

.sre-resizer {
  position: relative;
  flex: 0 0 6px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  padding: 0;
  touch-action: none;
}
.sre-resizer.col {
  cursor: col-resize;
}
.sre-resizer.row {
  cursor: row-resize;
  width: 100%;
  flex-basis: 6px;
}
.sre-resizer .grip {
  width: 4px;
  height: 34px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--focus) 55%, transparent);
}
.sre-resizer.row .grip {
  width: 34px;
  height: 4px;
}
.sre-resizer:hover .grip,
.sre-resizer:focus-visible .grip {
  background: var(--focus);
}
.sre-resizer .pill {
  position: absolute;
  top: -26px;
  left: 50%;
  transform: translateX(-50%);
  font-size: var(--fs-micro);
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  color: var(--bg-1);
  background: var(--ink);
  padding: 0.12rem 0.4rem;
  border-radius: 5px;
  opacity: 0;
  white-space: nowrap;
  pointer-events: none;
}
.sre-resizer:hover .pill {
  opacity: 1;
}

.sre-clockbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--focus) 14%, var(--bg-1));
  color: var(--focus);
  border: 1px solid color-mix(in srgb, var(--focus) 30%, transparent);
  border-radius: 5px;
  font-size: var(--fs-micro);
  font-variant-numeric: tabular-nums;
}
.sre-clockbar.h {
  width: 100%;
  height: 22px;
}
.sre-clockbar.v {
  width: 26px;
  align-self: stretch;
  writing-mode: vertical-rl;
}
.sre-clockbar.drag {
  cursor: grab;
  gap: 3px;
}
.sre-clockbar.drag:active {
  cursor: grabbing;
}
.sre-clock-grip {
  opacity: 0.55;
  letter-spacing: -1px;
}

/* --- clock bar drop zones (visible only while dragging) --- */
.sre-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: color-mix(in srgb, var(--focus) 9%, transparent);
  border: 1px dashed color-mix(in srgb, var(--focus) 50%, transparent);
  color: color-mix(in srgb, var(--focus) 85%, #fff 15%);
  font-size: var(--fs-micro);
  font-weight: 600;
  transition:
    background 0.12s,
    border-color 0.12s;
}
.sre-drop > span {
  pointer-events: none;
  opacity: 0.8;
}
.sre-drop:hover {
  background: color-mix(in srgb, var(--focus) 28%, transparent);
  border-style: solid;
  border-color: var(--focus);
}
.sre-drop.perim {
  position: absolute;
  z-index: 6;
}
.sre-drop.perim.top {
  top: 3px;
  left: 3px;
  right: 3px;
  height: 24px;
}
.sre-drop.perim.bottom {
  bottom: 3px;
  left: 3px;
  right: 3px;
  height: 24px;
}
.sre-drop.perim.left {
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: 26px;
}
.sre-drop.perim.right {
  top: 3px;
  bottom: 3px;
  right: 3px;
  width: 26px;
}
.sre-drop.perim.left > span,
.sre-drop.perim.right > span {
  writing-mode: vertical-rl;
}
.sre-drop.gap {
  flex: 0 0 24px;
  align-self: stretch;
  z-index: 3;
}
.sre-drop-plus {
  font-size: var(--fs-2xs);
  font-weight: 700;
}

.sre-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--line);
  background: var(--bg-0);
  overflow: hidden;
}
.sre-rail-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

/* --- size classes (§1) ----------------------------------------------------
   The class comes from the measured modal, never a viewport media query, so a
   kiosk whose on-screen keyboard shrinks the dialog re-evaluates it too. */
.sre-root.size-compact,
.sre-root.size-phone {
  padding: 0;
}
.sre-root.size-compact .sre-modal,
.sre-root.size-phone .sre-modal {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
}
.sre-root.size-compact .sre-body {
  grid-template-columns: 1fr 280px;
}
.sre-root.size-compact .sre-sub,
.sre-root.size-phone .sre-sub {
  display: none;
}
/* The orientation badge moves under the device as a caption in Compact. */
.sre-root.size-compact .sre-orient-badge,
.sre-root.size-phone .sre-orient-badge {
  display: none;
}
.sre-orient-caption {
  margin-top: var(--space-md);
  font-size: var(--fs-2xs);
  color: var(--ink-2);
  background: var(--bg-1);
  border: 1px solid var(--line);
  padding: var(--space-2xs) var(--space-md);
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}

/* Phone: one column, the inspector becomes a bottom sheet (§3). */
.sre-root.size-phone .sre-context {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
}
.sre-root.size-phone .sre-tab {
  min-height: 44px;
}
.sre-root.size-phone .sre-tab-add {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
}
.sre-root.size-phone .sre-preview-as {
  margin-left: 0;
  width: 100%;
  flex-wrap: wrap;
}
.sre-root.size-phone .sre-preview-label {
  white-space: nowrap;
}
.sre-root.size-phone .sre-body {
  position: relative;
  display: block;
  min-height: 0;
  --sre-sheet-height: 64px;
}
.sre-root.size-phone .sre-body.is-sheet-open {
  --sre-sheet-height: 65%;
}
.sre-root.size-phone .sre-stage {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: var(--sre-sheet-height);
  padding: var(--space-lg);
}
.sre-root.size-phone .sre-stage-tag {
  top: var(--space-md);
  left: var(--space-lg);
}
.sre-root.size-phone .sre-preview-note {
  display: none;
}
/* The mismatch banner stacks its button under the text. */
.sre-root.size-phone .sre-mismatch {
  flex-direction: column;
  max-width: 92%;
  top: var(--space-sm);
}
.sre-root.size-phone .sre-mismatch__btn {
  width: 100%;
}

/* The rail turns into the sheet: peek 64px, open 65% of the stage height. */
.sre-rail.is-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  height: 64px;
  border-left: 0;
  border-top: 1px solid var(--line);
  border-radius: 16px 16px 0 0;
  background: var(--bg-1);
  box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.35);
  transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.sre-rail.is-sheet.is-open {
  height: 65%;
}
.sre-rail.is-sheet.no-motion {
  transition: none;
}
.sre-sheet-peek {
  flex: 0 0 64px;
  height: 64px;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 0 var(--space-lg);
  cursor: pointer;
  touch-action: none;
}
.sre-sheet-handle {
  width: 40px;
  height: 4px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--line);
  cursor: grab;
}
.sre-sheet-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
}
.sre-sheet-chevron {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--bg-1);
  color: var(--ink-2);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.sre-sheet-chevron:hover {
  border-color: var(--focus);
  color: var(--focus);
}
.sre-rail.is-sheet .sre-rail-scroll {
  min-height: 0;
}

/* Region labels shrink under 320px (§2). */
.sre-device.is-narrow :deep(.sre-region-name) {
  font-size: var(--fs-xs);
}

/* Coarse pointer: bigger divider hit areas with the same 4x34 grip (§4). */
.sre-root.is-coarse .sre-resizer {
  flex: 0 0 28px;
}

.sre-sheet-chevron:focus-visible,
.sre-sheet-peek:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.sre-tab:focus-visible,
.sre-resizer:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
