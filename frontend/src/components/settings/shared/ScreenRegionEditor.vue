<template>
  <teleport to="body">
    <div
      v-if="open"
      class="sre-root"
      role="dialog"
      aria-modal="true"
      aria-label="Pages and regions"
    >
      <DialogScrim blur @dismiss="$emit('close')" />
      <div class="sre-modal">
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
        <div class="sre-body">
          <!-- STAGE -->
          <div class="sre-stage">
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

            <div class="sre-device-wrap" :class="{ dimmed: mismatch }">
              <div class="sre-device" :class="orientation" :style="deviceSize">
                <div
                  :ref="el => (screenEl = el)"
                  class="sre-screen"
                  :class="`dir-${layoutDir}`"
                  :style="clockAxisStyle"
                >
                  <!-- perimeter drop zones (only while dragging the clock bar) -->
                  <template v-if="clock.enabled && clockDrag">
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
                    draggable="true"
                    title="Drag to reposition the clock bar"
                    aria-label="Clock bar — drag to reposition"
                    @dragstart="beginClockDrag"
                    @dragend="endClockDrag"
                  >
                    <span class="sre-clock-grip" aria-hidden="true">⠿</span> {{ previewClock }}
                  </div>

                  <div
                    :ref="el => (regionsEl = el)"
                    class="sre-regions"
                    :class="`dir-${layoutDir}`"
                  >
                    <template v-for="(region, i) in activeScreen.layout.regions" :key="region.id">
                      <!-- clock drop zone at the gap before region i -->
                      <div
                        v-if="clock.enabled && clockDrag && i > 0 && betweenIndex !== i - 1"
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
                        draggable="true"
                        title="Drag to reposition the clock bar"
                        aria-label="Clock bar — drag to reposition"
                        @dragstart="beginClockDrag"
                        @dragend="endClockDrag"
                      >
                        <span class="sre-clock-grip" aria-hidden="true">⠿</span> {{ previewTime }}
                      </div>

                      <RegionNode
                        :region="region"
                        :path="[i]"
                        :parent-direction="layoutDir"
                        :selected-id="selectedRegionId"
                        :layout-dir="layoutDir"
                        @select="selectRegion"
                        @resize="onNodeResize"
                      />

                      <button
                        v-if="i < activeScreen.layout.regions.length - 1"
                        type="button"
                        class="sre-resizer"
                        :class="layoutDir === 'row' ? 'col' : 'row'"
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
                    draggable="true"
                    title="Drag to reposition the clock bar"
                    aria-label="Clock bar — drag to reposition"
                    @dragstart="beginClockDrag"
                    @dragend="endClockDrag"
                  >
                    <span class="sre-clock-grip" aria-hidden="true">⠿</span> {{ previewClock }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="!mismatch && previewScreenId !== ANY_BROWSER" class="sre-preview-note">
              Previewing on {{ previewScreenName }} · edits change the shared “{{
                activeScreen.name
              }}” page
            </div>
          </div>

          <!-- RAIL -->
          <aside class="sre-rail">
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
          </aside>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
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
});
const emit = defineEmits(["update:config", "close"]);

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
// one; otherwise a 16:9 / 9:16 stand-in for its orientation.
const DEVICE_MAX = 560;
const deviceSize = computed(() => {
  const vp = previewViewport.value;
  const aspect = vp ? vp.w / vp.h : orientation.value === "portrait" ? 9 / 16 : 16 / 9;
  return aspect >= 1
    ? { width: `${DEVICE_MAX}px`, height: `${Math.round(DEVICE_MAX / aspect)}px` }
    : { width: `${Math.round(DEVICE_MAX * aspect)}px`, height: `${DEVICE_MAX}px` };
});

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
const selectRegion = id => {
  selectedRegionId.value = selectedRegionId.value === id ? null : id;
};
const selectScreen = id => {
  selectedRegionId.value = null;
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
const beginClockDrag = event => {
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
  open => {
    if (open) applyInitialPreview();
  }
);

/* keep selection valid when screen changes */
watch(activeScreenId, () => (selectedRegionId.value = null));

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
  if (props.open) applyInitialPreview();
  clockTimer = setInterval(() => (now.value = new Date()), 30000);
  if (webServicesStore.services.length === 0 && !webServicesStore.loading)
    webServicesStore.fetchServices();
  if (calendarStore.sources.length === 0 && !calendarStore.loading) calendarStore.fetchSources();
  if (plugins.value.length === 0 && !loadingPlugins.value) loadPlugins();
  if (kiosksStore.kiosks.length === 0) kiosksStore.loadKiosks();
});
onUnmounted(() => {
  window.removeEventListener("pointermove", onResizeMove);
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
  width: min(1240px, 97vw);
  height: min(820px, 95vh);
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
  border-left: 1px solid var(--line);
  background: var(--bg-0);
  overflow-y: auto;
}

.sre-tab:focus-visible,
.sre-resizer:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
