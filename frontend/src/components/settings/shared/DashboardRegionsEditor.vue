<template>
  <div class="dashboard-layout-tab">
    <div class="screen-stack" :class="`screen-stack-${configValue.orientation}`">
      <section
        v-for="(screen, screenIndex) in dashboardScreens.screens"
        :key="screen.id"
        class="screen-card"
      >
        <header class="screen-card-header">
          <div class="screen-header-identity">
            <IconButton
              variant="ghost"
              size="sm"
              :aria-expanded="expandedScreens.has(screen.id)"
              :label="
                expandedScreens.has(screen.id)
                  ? `Collapse screen ${screenIndex + 1}`
                  : `Expand screen ${screenIndex + 1}`
              "
              @click="toggleScreenExpanded(screen.id)"
            >
              {{ expandedScreens.has(screen.id) ? "▾" : "▸" }}
            </IconButton>
            <span class="screen-index">{{ screenIndex + 1 }}</span>
            <input
              :id="`screen-name-${screen.id}`"
              :value="screen.name"
              type="text"
              class="screen-name-input"
              :aria-label="`Screen ${screenIndex + 1} name`"
              @change="handleScreenNameChange(screenIndex, $event)"
            />
          </div>
          <div class="screen-header-actions">
            <button
              :id="`add-region-${screen.id}`"
              type="button"
              class="add-region-button"
              :disabled="screen.layout.regions.length >= MAX_TOP_REGIONS"
              :aria-label="`Add region to screen ${screenIndex + 1}`"
              @click="addRegion(screenIndex)"
            >
              + Region
            </button>
            <IconButton
              :label="`Toggle screen ${screenIndex + 1} layout direction`"
              variant="default"
              size="sm"
              :title="`Direction: ${directionLabel(layoutDirectionFor(screen.layout))}`"
              @click="toggleLayoutDirection(screenIndex)"
            >
              <DirectionSplitIcon :direction="layoutDirectionFor(screen.layout)" />
            </IconButton>
            <IconButton
              v-if="dashboardScreens.screens.length > 1"
              :label="`Delete screen ${screenIndex + 1}`"
              variant="danger"
              size="sm"
              @click="deleteScreen(screenIndex)"
            >
              ×
            </IconButton>
          </div>
        </header>

        <div v-if="expandedScreens.has(screen.id)" class="screen-clock-bar-controls">
          <span class="clock-bar-row-label">Clock bar</span>
          <div class="clock-bar-visibility">
            <ToggleSwitch
              :model-value="effectiveClockBarFor(screen).enabled"
              :aria-label="`Show clock bar on screen ${screenIndex + 1}`"
              @update:model-value="v => setScreenClockBarEnabled(screenIndex, v)"
            />
            <span class="clock-bar-visibility-label">{{
              effectiveClockBarFor(screen).enabled ? "Shown" : "Hidden"
            }}</span>
          </div>
          <button
            v-if="screenHasClockBarOverride(screen)"
            type="button"
            class="clock-bar-inherit"
            :aria-label="`Inherit global clock bar settings on screen ${screenIndex + 1}`"
            @click="clearScreenClockBar(screenIndex)"
          >
            Inherit global
          </button>
          <span v-else class="clock-bar-inherit-hint">Inherits global</span>
          <span v-if="effectiveClockBarFor(screen).enabled" class="clock-bar-drag-hint">
            Drag the bar in the preview to move it
          </span>
          <span class="clock-bar-summary">{{ clockBarSummary(screen) }}</span>
        </div>

        <div v-if="expandedScreens.has(screen.id)" class="screen-preview-frame">
          <div
            v-if="
              clockBarDragScreenId === screen.id && effectiveClockBarFor(screen).position !== 'top'
            "
            class="clock-bar-drop-zone clock-bar-drop-zone-horizontal"
            :class="{
              'clock-bar-drop-zone-mode-switch': effectiveClockBarFor(screen).mode !== 'horizontal',
            }"
            :title="dropZoneTooltip(screen, 'top')"
            @dragover.prevent
            @drop="handleClockBarDrop(screenIndex, 'top', $event)"
          >
            Top
          </div>
          <div
            v-if="
              effectiveClockBarFor(screen).enabled &&
              effectiveClockBarFor(screen).position === 'top'
            "
            class="clock-bar-token clock-bar-token-horizontal"
            draggable="true"
            :aria-label="`Clock bar on screen ${screenIndex + 1} — drag to reposition`"
            @dragstart="beginClockBarDrag(screen.id, $event)"
            @dragend="endClockBarDrag()"
          >
            <span class="clock-bar-token-label">⠿ Clock bar</span>
          </div>

          <div
            :ref="el => setPreviewRef(screen.id, el)"
            class="screen-preview"
            :class="`screen-preview-${layoutDirectionFor(screen.layout)}`"
            :style="previewStyleFor(screen.layout)"
          >
            <div
              v-if="
                clockBarDragScreenId === screen.id &&
                effectiveClockBarFor(screen).position !== 'left'
              "
              class="clock-bar-drop-zone clock-bar-drop-zone-vertical"
              :class="{
                'clock-bar-drop-zone-mode-switch': effectiveClockBarFor(screen).mode !== 'vertical',
              }"
              :title="dropZoneTooltip(screen, 'left')"
              @dragover.prevent
              @drop="handleClockBarDrop(screenIndex, 'left', $event)"
            >
              Left
            </div>
            <div
              v-if="
                effectiveClockBarFor(screen).enabled &&
                effectiveClockBarFor(screen).position === 'left'
              "
              class="clock-bar-token clock-bar-token-vertical"
              draggable="true"
              :aria-label="`Clock bar on screen ${screenIndex + 1} — drag to reposition`"
              @dragstart="beginClockBarDrag(screen.id, $event)"
              @dragend="endClockBarDrag()"
            >
              <span class="clock-bar-token-label">⠿</span>
            </div>
            <template v-for="(region, previewIndex) in screen.layout.regions" :key="region.id">
              <div
                :class="[
                  'preview-region',
                  region.split ? 'preview-region-split' : `preview-region-${region.kind}`,
                  { 'preview-region-active': region.id === screen.activeRegionId },
                ]"
                :style="getPreviewRegionStyle(region)"
              >
                <div class="preview-region-header">
                  <label v-if="!region.split" class="preview-primary-control" @click.stop>
                    <input
                      :id="`region-primary-${region.id}`"
                      type="radio"
                      :name="`dashboard-active-region-${screen.id}`"
                      :checked="region.id === screen.activeRegionId"
                      :aria-label="`Make ${regionLabel(previewIndex)} primary`"
                      @change="setActiveRegion(screenIndex, region.id)"
                    />
                    Primary
                  </label>
                  <div class="preview-region-label">{{ regionLabel(previewIndex) }}</div>
                  <IconButton
                    v-if="region.split"
                    :label="`Toggle ${regionLabel(previewIndex)} split direction`"
                    variant="default"
                    size="sm"
                    :title="`Sub direction: ${directionLabel(splitDirectionFor(screen.layout, region))}`"
                    @click.stop="toggleSubDirection(screenIndex, previewIndex)"
                  >
                    <DirectionSplitIcon :direction="splitDirectionFor(screen.layout, region)" />
                  </IconButton>
                  <button
                    v-if="region.split && region.split.regions.length < MAX_TOP_REGIONS"
                    type="button"
                    class="add-region-button add-region-button-small"
                    :aria-label="`Add sub-region to ${regionLabel(previewIndex)}`"
                    @click.stop="addSub(screenIndex, previewIndex)"
                  >
                    + Sub
                  </button>
                  <button
                    type="button"
                    class="split-toggle"
                    :aria-label="
                      region.split
                        ? `Unsplit ${regionLabel(previewIndex)}`
                        : `Split ${regionLabel(previewIndex)}`
                    "
                    @click.stop="toggleSplit(screenIndex, previewIndex)"
                  >
                    {{ region.split ? "Unsplit" : "Split" }}
                  </button>
                  <IconButton
                    v-if="screen.layout.regions.length > 1"
                    :label="`Delete ${regionLabel(previewIndex)}`"
                    variant="danger"
                    size="sm"
                    @click.stop="removeRegion(screenIndex, previewIndex)"
                  >
                    ×
                  </IconButton>
                </div>

                <template v-if="region.split">
                  <div
                    :ref="el => setSubPreviewRef(screen.id, region.id, el)"
                    class="preview-split-container"
                    :class="`preview-split-${splitDirectionFor(screen.layout, region)}`"
                  >
                    <template v-for="(sub, subIndex) in region.split.regions" :key="sub.id">
                      <div
                        :class="[
                          'preview-subregion',
                          `preview-region-${sub.kind}`,
                          { 'preview-region-active': sub.id === screen.activeRegionId },
                        ]"
                        :style="getSubRegionStyle(sub)"
                      >
                        <div class="preview-region-header">
                          <label class="preview-primary-control" @click.stop>
                            <input
                              :id="`region-primary-${sub.id}`"
                              type="radio"
                              :name="`dashboard-active-region-${screen.id}`"
                              :checked="sub.id === screen.activeRegionId"
                              :aria-label="`Make ${regionLabel(previewIndex)} sub ${subIndex + 1} primary`"
                              @change="setActiveRegion(screenIndex, sub.id)"
                            />
                            Primary
                          </label>
                          <div class="preview-region-label">
                            {{ regionLabel(previewIndex) }}.{{ subIndex + 1 }}
                          </div>
                          <IconButton
                            v-if="region.split.regions.length > 1"
                            :label="`Delete ${regionLabel(previewIndex)} sub ${subIndex + 1}`"
                            variant="danger"
                            size="sm"
                            @click.stop="removeSub(screenIndex, previewIndex, subIndex)"
                          >
                            ×
                          </IconButton>
                        </div>
                        <div class="preview-component-picker" @click.stop>
                          <button
                            :id="`region-component-${sub.id}`"
                            type="button"
                            class="preview-component-select"
                            :aria-expanded="openComponentPickerKey === `${screen.id}:${sub.id}`"
                            :aria-label="`${regionLabel(previewIndex)} sub ${subIndex + 1} component`"
                            @click="toggleComponentPicker(screen.id, sub.id)"
                          >
                            {{ regionKindLabel(sub) }}
                          </button>
                          <div
                            v-if="openComponentPickerKey === `${screen.id}:${sub.id}`"
                            class="component-menu"
                          >
                            <input
                              v-model="componentSearch"
                              class="component-search"
                              type="search"
                              placeholder="Filter components"
                              autocomplete="off"
                            />
                            <button
                              v-for="option in filteredComponentOptions"
                              :key="option.value"
                              type="button"
                              class="component-option"
                              @click="
                                selectSubRegionComponent(
                                  screenIndex,
                                  previewIndex,
                                  subIndex,
                                  option
                                )
                              "
                            >
                              <span class="component-option__label">{{ option.label }}</span>
                              <span
                                v-if="option.pluginName && option.pluginName !== option.label"
                                class="component-option__type"
                              >
                                {{ option.pluginName }}
                              </span>
                            </button>
                            <div
                              v-if="sourceOptionsFor(sub.kind).length > 0"
                              class="source-options"
                            >
                              <button
                                type="button"
                                class="component-option"
                                @click="clearSubRegionSources(screenIndex, previewIndex, subIndex)"
                              >
                                {{ sourceSelectionLabel({ ...sub, instanceIds: [] }) }}
                              </button>
                              <label
                                v-for="source in sourceOptionsFor(sub.kind)"
                                :key="source.id"
                                class="source-option"
                              >
                                <input
                                  type="checkbox"
                                  :checked="(sub.instanceIds || []).includes(source.id)"
                                  @change="
                                    toggleSubRegionSource(
                                      screenIndex,
                                      previewIndex,
                                      subIndex,
                                      source.id,
                                      $event.target.checked
                                    )
                                  "
                                />
                                {{ source.name }}
                              </label>
                            </div>
                            <div
                              v-if="filteredComponentOptions.length === 0"
                              class="component-empty"
                            >
                              No matches
                            </div>
                          </div>
                        </div>
                        <div class="preview-size-control">
                          <span class="preview-size-label">Size</span>
                          <span class="preview-size-value">{{ sub.size }}%</span>
                        </div>
                      </div>
                      <button
                        v-if="subIndex < region.split.regions.length - 1"
                        type="button"
                        :class="[
                          'preview-resizer',
                          `preview-resizer-${splitDirectionFor(screen.layout, region)}`,
                        ]"
                        :aria-label="`Resize ${regionLabel(previewIndex)} sub-regions`"
                        @pointerdown.stop="
                          startSubResize(screenIndex, previewIndex, subIndex, $event)
                        "
                      />
                    </template>
                  </div>
                </template>
                <template v-else>
                  <div class="preview-component-picker" @click.stop>
                    <button
                      :id="`region-component-${region.id}`"
                      type="button"
                      class="preview-component-select"
                      :aria-expanded="openComponentPickerKey === `${screen.id}:${region.id}`"
                      :aria-label="`${regionLabel(previewIndex)} component`"
                      @click="toggleComponentPicker(screen.id, region.id)"
                    >
                      {{ regionKindLabel(region) }}
                    </button>
                    <div
                      v-if="openComponentPickerKey === `${screen.id}:${region.id}`"
                      class="component-menu"
                    >
                      <input
                        v-model="componentSearch"
                        class="component-search"
                        type="search"
                        placeholder="Filter components"
                        autocomplete="off"
                      />
                      <button
                        v-for="option in filteredComponentOptions"
                        :key="option.value"
                        type="button"
                        class="component-option"
                        @click="selectRegionComponent(screenIndex, previewIndex, option)"
                      >
                        <span class="component-option__label">{{ option.label }}</span>
                        <span
                          v-if="option.pluginName && option.pluginName !== option.label"
                          class="component-option__type"
                        >
                          {{ option.pluginName }}
                        </span>
                      </button>
                      <div v-if="sourceOptionsFor(region.kind).length > 0" class="source-options">
                        <button
                          type="button"
                          class="component-option"
                          @click="clearRegionSources(screenIndex, previewIndex)"
                        >
                          {{ sourceSelectionLabel({ ...region, instanceIds: [] }) }}
                        </button>
                        <label
                          v-for="source in sourceOptionsFor(region.kind)"
                          :key="source.id"
                          class="source-option"
                        >
                          <input
                            type="checkbox"
                            :checked="(region.instanceIds || []).includes(source.id)"
                            @change="
                              toggleRegionSource(
                                screenIndex,
                                previewIndex,
                                source.id,
                                $event.target.checked
                              )
                            "
                          />
                          {{ source.name }}
                        </label>
                      </div>
                      <div v-if="filteredComponentOptions.length === 0" class="component-empty">
                        No matches
                      </div>
                    </div>
                  </div>
                  <div v-if="screen.layout.regions.length > 1" class="preview-size-control">
                    <span class="preview-size-label">Size</span>
                    <span class="preview-size-value">{{ region.size }}%</span>
                  </div>
                </template>
              </div>
              <template v-if="previewIndex < screen.layout.regions.length - 1">
                <div
                  v-if="
                    clockBarDragScreenId === screen.id &&
                    getClockBarBetweenIndex(effectiveClockBarFor(screen).position) !== previewIndex
                  "
                  class="clock-bar-drop-zone"
                  :class="`clock-bar-drop-zone-between-${layoutDirectionFor(screen.layout) === 'row' ? 'vertical' : 'horizontal'}`"
                  title="Drop here to place the bar between these regions"
                  @dragover.prevent
                  @drop="
                    handleClockBarDrop(
                      screenIndex,
                      previewIndex === 0 ? 'between' : `between:${previewIndex}`,
                      $event
                    )
                  "
                >
                  Between region {{ previewIndex + 1 }} & {{ previewIndex + 2 }}
                </div>
                <div
                  v-if="
                    effectiveClockBarFor(screen).enabled &&
                    getClockBarBetweenIndex(effectiveClockBarFor(screen).position) === previewIndex
                  "
                  class="clock-bar-token"
                  :class="`clock-bar-token-${layoutDirectionFor(screen.layout) === 'row' ? 'vertical' : 'horizontal'}`"
                  draggable="true"
                  :aria-label="`Clock bar on screen ${screenIndex + 1} — drag to reposition`"
                  @dragstart="beginClockBarDrag(screen.id, $event)"
                  @dragend="endClockBarDrag()"
                >
                  <span class="clock-bar-token-label">⠿</span>
                </div>
                <button
                  type="button"
                  :class="[
                    'preview-resizer',
                    `preview-resizer-${layoutDirectionFor(screen.layout)}`,
                  ]"
                  :aria-label="`Resize ${regionLabel(previewIndex)}`"
                  @pointerdown="startResize(screenIndex, previewIndex, $event)"
                />
              </template>
            </template>
            <div
              v-if="
                effectiveClockBarFor(screen).enabled &&
                effectiveClockBarFor(screen).position === 'right'
              "
              class="clock-bar-token clock-bar-token-vertical"
              draggable="true"
              :aria-label="`Clock bar on screen ${screenIndex + 1} — drag to reposition`"
              @dragstart="beginClockBarDrag(screen.id, $event)"
              @dragend="endClockBarDrag()"
            >
              <span class="clock-bar-token-label">⠿</span>
            </div>
            <div
              v-if="
                clockBarDragScreenId === screen.id &&
                effectiveClockBarFor(screen).position !== 'right'
              "
              class="clock-bar-drop-zone clock-bar-drop-zone-vertical"
              :class="{
                'clock-bar-drop-zone-mode-switch': effectiveClockBarFor(screen).mode !== 'vertical',
              }"
              :title="dropZoneTooltip(screen, 'right')"
              @dragover.prevent
              @drop="handleClockBarDrop(screenIndex, 'right', $event)"
            >
              Right
            </div>
          </div>

          <div
            v-if="
              effectiveClockBarFor(screen).enabled &&
              effectiveClockBarFor(screen).position === 'bottom'
            "
            class="clock-bar-token clock-bar-token-horizontal"
            draggable="true"
            :aria-label="`Clock bar on screen ${screenIndex + 1} — drag to reposition`"
            @dragstart="beginClockBarDrag(screen.id, $event)"
            @dragend="endClockBarDrag()"
          >
            <span class="clock-bar-token-label">⠿ Clock bar</span>
          </div>
          <div
            v-if="
              clockBarDragScreenId === screen.id &&
              effectiveClockBarFor(screen).position !== 'bottom'
            "
            class="clock-bar-drop-zone clock-bar-drop-zone-horizontal"
            :class="{
              'clock-bar-drop-zone-mode-switch': effectiveClockBarFor(screen).mode !== 'horizontal',
            }"
            :title="dropZoneTooltip(screen, 'bottom')"
            @dragover.prevent
            @drop="handleClockBarDrop(screenIndex, 'bottom', $event)"
          >
            Bottom
          </div>
        </div>
      </section>

      <button type="button" class="screen-add" @click="addScreen">
        <span class="screen-add-icon">+</span>
        <span>Add Screen</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useWebServicesStore } from "@/stores/webServices";
import { useCalendarStore } from "@/stores/calendar";
import { usePlugins } from "@/composables";
import { buildComponentOptions, filterComponentOptions } from "@/utils/componentPicker";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import IconButton from "@/components/ui/IconButton.vue";
import DirectionSplitIcon from "@/components/settings/shared/DirectionSplitIcon.vue";
import {
  MAX_TOP_REGIONS,
  addSubRegion,
  addTopRegion,
  computeClockBarPositionUpdate,
  createDashboardScreenFromPreset,
  getClockBarBetweenIndex,
  getGlobalClockBarSettings,
  getLayoutDirection,
  getSplitDirection,
  normalizeDashboardScreens,
  removeSubRegion,
  removeTopRegion,
  resizeAdjacentRegions,
  resizeSubRegionPair,
  resolveClockBarForScreen,
  setLayoutDirection,
  setSplitDirection,
  setSubRegionContent,
  splitTopRegion,
  unsplitTopRegion,
} from "@/utils/layout";

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

const emit = defineEmits(["update:config"]);
const webServicesStore = useWebServicesStore();
const calendarStore = useCalendarStore();
const { plugins, pluginInstances, loadingPlugins, loadPlugins } = usePlugins();
const previewRefs = new Map();
const subPreviewRefs = new Map();
const dragState = ref(null);
const clockBarDragScreenId = ref(null);
const openComponentPickerKey = ref(null);
const componentSearch = ref("");

const beginClockBarDrag = (screenId, event) => {
  clockBarDragScreenId.value = screenId;
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    // Some browsers require setData for drag to start.
    event.dataTransfer.setData("text/plain", `clock-bar:${screenId}`);
  }
};

const endClockBarDrag = () => {
  clockBarDragScreenId.value = null;
};

const handleClockBarDrop = (screenIndex, position, event) => {
  event?.preventDefault?.();
  if (clockBarDragScreenId.value === null) return;
  setScreenClockBarPosition(screenIndex, position);
  endClockBarDrag();
};

const setPreviewRef = (screenId, el) => {
  if (el) previewRefs.set(screenId, el);
  else previewRefs.delete(screenId);
};

const setSubPreviewRef = (screenId, regionId, el) => {
  const key = `${screenId}:${regionId}`;
  if (el) subPreviewRefs.set(key, el);
  else subPreviewRefs.delete(key);
};

const configValue = computed(() => {
  const config = props.config || {};
  return {
    orientation: config.orientation ?? "landscape",
    orientationFlipped: config.orientationFlipped ?? false,
    applyDisplayRotation: config.applyDisplayRotation ?? true,
    calendarSplit: config.calendarSplit ?? 70,
    clockBarMode: config.clockBarMode ?? "horizontal",
    clockBarPosition: config.clockBarPosition ?? "top",
    dashboardScreens: normalizeDashboardScreens(config.dashboardScreens),
  };
});

const globalClockBarSettings = computed(() => getGlobalClockBarSettings(configValue.value));

const effectiveClockBars = computed(() => {
  const map = new Map();
  for (const screen of configValue.value.dashboardScreens.screens) {
    map.set(screen.id, resolveClockBarForScreen(screen, globalClockBarSettings.value));
  }
  return map;
});

const effectiveClockBarFor = screen =>
  effectiveClockBars.value.get(screen.id) ||
  resolveClockBarForScreen(screen, globalClockBarSettings.value);

const screenHasClockBarOverride = screen => Boolean(screen?.clockBar);

const clockBarSummary = screen => {
  const resolved = effectiveClockBarFor(screen);
  const positionLabel = clockBarPositionLabel(resolved.position, screen);
  const modeLabel = resolved.mode === "vertical" ? "Vertical" : "Horizontal";
  const enabledLabel = resolved.enabled ? "" : " · Hidden";
  return `${modeLabel} · ${positionLabel}${enabledLabel}`;
};

const clockBarPositionLabel = (position, screen) => {
  if (position === "top") return "Top";
  if (position === "bottom") return "Bottom";
  if (position === "left") return "Left";
  if (position === "right") return "Right";
  const index = getClockBarBetweenIndex(position);
  if (index !== null) {
    const regions = screen?.layout?.regions || [];
    const before = regions[index];
    const after = regions[index + 1];
    if (before && after) {
      return `Between region ${index + 1} & ${index + 2}`;
    }
    return "Between regions";
  }
  return "—";
};

const dropZoneTooltip = (screen, position) => {
  const resolved = effectiveClockBarFor(screen);
  const targetMode =
    position === "top" || position === "bottom"
      ? "horizontal"
      : position === "left" || position === "right"
        ? "vertical"
        : resolved.mode;
  if (targetMode !== resolved.mode) {
    return `Drop here to move the bar — switches to ${targetMode} orientation`;
  }
  return "Drop here to move the bar";
};

const updateScreenClockBar = (screenIndex, patch) => {
  const screens = cloneScreens();
  const target = screens.screens[screenIndex];
  const next = { ...(target.clockBar || {}), ...patch };
  // Drop fields explicitly set to undefined or null so override stays minimal.
  Object.keys(next).forEach(key => {
    if (next[key] === undefined || next[key] === null) delete next[key];
  });
  target.clockBar = Object.keys(next).length ? next : null;
  emitScreensUpdate(screens);
};

const clearScreenClockBar = screenIndex => {
  const screens = cloneScreens();
  screens.screens[screenIndex].clockBar = null;
  emitScreensUpdate(screens);
};

const setScreenClockBarPosition = (screenIndex, position) => {
  const screen = dashboardScreens.value.screens[screenIndex];
  const update = computeClockBarPositionUpdate(screen, position, globalClockBarSettings.value);
  if (!update) return;
  if (update.clear) {
    clearScreenClockBar(screenIndex);
    return;
  }
  updateScreenClockBar(screenIndex, update.patch);
};

const setScreenClockBarEnabled = (screenIndex, enabled) => {
  updateScreenClockBar(screenIndex, { enabled });
};

const dashboardScreens = computed(() => configValue.value.dashboardScreens);

const expandedScreens = reactive(new Set([dashboardScreens.value.activeScreenId]));

const toggleScreenExpanded = screenId => {
  if (expandedScreens.has(screenId)) expandedScreens.delete(screenId);
  else expandedScreens.add(screenId);
};

const layoutDirectionFor = layout => getLayoutDirection(layout, configValue.value.orientation);

const splitDirectionFor = (layout, region) =>
  getSplitDirection(region.split, layoutDirectionFor(layout));

const directionLabel = direction => (direction === "column" ? "Stacked" : "Side-by-side");

const LEAF_PX = 220;
const PREVIEW_FLOOR = 320;

const regionPerpSpan = (region, direction) => {
  if (!region.split) return LEAF_PX;
  const subDir = getSplitDirection(region.split, direction);
  if (subDir !== direction) return region.split.regions.length * LEAF_PX;
  return LEAF_PX;
};

const regionParallelSpan = (region, direction) => {
  if (!region.split) return LEAF_PX;
  const subDir = getSplitDirection(region.split, direction);
  if (subDir === direction) return region.split.regions.length * LEAF_PX;
  return LEAF_PX;
};

const previewStyleFor = layout => {
  const direction = layoutDirectionFor(layout);
  if (direction === "row") {
    // Width fills the card; height grows only with vertically-stacked sub-regions.
    const cross = layout.regions.reduce(
      (max, region) => Math.max(max, regionPerpSpan(region, "row")),
      PREVIEW_FLOOR
    );
    return { minHeight: `${cross}px` };
  }
  // Column: height grows with the stack; width fills the card.
  const main = layout.regions.reduce(
    (sum, region) => sum + regionParallelSpan(region, "column"),
    0
  );
  return { minHeight: `${Math.max(PREVIEW_FLOOR, main)}px` };
};

const services = computed(() => webServicesStore.services);
const calendarSources = computed(() =>
  (calendarStore.sources || []).filter(source => source.enabled !== false)
);
const imageInstances = computed(() =>
  plugins.value
    .filter(plugin => plugin.type === "image" && plugin.enabled)
    .flatMap(plugin => pluginInstances.value[plugin.id] || [])
    .filter(instance => instance.enabled !== false)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
);
const componentOptions = computed(() => buildComponentOptions(services.value));
const filteredComponentOptions = computed(() =>
  filterComponentOptions(componentOptions.value, componentSearch.value)
);

const addRegion = screenIndex => {
  const layout = addTopRegion(cloneLayout(screenIndex));
  updateScreen(screenIndex, { layout });
};

const addSub = (screenIndex, regionIndex) => {
  const layout = addSubRegion(cloneLayout(screenIndex), regionIndex);
  updateScreen(screenIndex, { layout });
};

const removeSub = (screenIndex, regionIndex, subIndex) => {
  const screen = dashboardScreens.value.screens[screenIndex];
  const region = screen.layout.regions[regionIndex];
  if (!region?.split) return;
  const removedSub = region.split.regions[subIndex];
  const layout = removeSubRegion(cloneLayout(screenIndex), regionIndex, subIndex);
  const updates = { layout };
  if (screen.activeRegionId === removedSub?.id) {
    updates.activeRegionId = layout.regions[regionIndex]?.id || layout.regions[0]?.id;
  }
  updateScreen(screenIndex, updates);
};

const removeRegion = (screenIndex, regionIndex) => {
  const screen = dashboardScreens.value.screens[screenIndex];
  if (screen.layout.regions.length <= 1) return;
  const removedRegion = screen.layout.regions[regionIndex];
  const layout = removeTopRegion(cloneLayout(screenIndex), regionIndex);
  const updates = { layout };
  if (
    screen.activeRegionId === removedRegion.id ||
    removedRegion.split?.regions.some(sub => sub.id === screen.activeRegionId)
  ) {
    updates.activeRegionId = layout.regions[0]?.id || "region-1";
  }
  updateScreen(screenIndex, updates);
};

const selectRegionComponent = (screenIndex, regionIndex, option) => {
  const layout = cloneLayout(screenIndex);
  layout.regions[regionIndex] = {
    ...layout.regions[regionIndex],
    kind: option.kind,
    serviceId: option.kind === "service" ? option.instanceIds?.[0] || null : null,
    instanceIds: option.instanceIds || [],
  };
  openComponentPickerKey.value = null;
  componentSearch.value = "";
  updateScreen(screenIndex, { layout });
};

const selectSubRegionComponent = (screenIndex, regionIndex, subIndex, option) => {
  const layout = setSubRegionContent(cloneLayout(screenIndex), regionIndex, subIndex, {
    kind: option.kind,
    serviceId: option.instanceIds?.[0] || null,
    instanceIds: option.instanceIds || [],
  });
  openComponentPickerKey.value = null;
  componentSearch.value = "";
  updateScreen(screenIndex, { layout });
};

const toggleLayoutDirection = screenIndex => {
  const screen = dashboardScreens.value.screens[screenIndex];
  const current = layoutDirectionFor(screen.layout);
  const next = current === "column" ? "row" : "column";
  updateScreen(screenIndex, { layout: setLayoutDirection(cloneLayout(screenIndex), next) });
};

const toggleSubDirection = (screenIndex, regionIndex) => {
  const screen = dashboardScreens.value.screens[screenIndex];
  const region = screen.layout.regions[regionIndex];
  if (!region?.split) return;
  const current = splitDirectionFor(screen.layout, region);
  const next = current === "column" ? "row" : "column";
  updateScreen(screenIndex, {
    layout: setSplitDirection(cloneLayout(screenIndex), regionIndex, next),
  });
};

const toggleSplit = (screenIndex, regionIndex) => {
  const layout = cloneLayout(screenIndex);
  const target = layout.regions[regionIndex];
  const next = target?.split
    ? unsplitTopRegion(layout, regionIndex)
    : splitTopRegion(layout, regionIndex);
  updateScreen(screenIndex, { layout: next });
};

const toggleComponentPicker = (screenId, regionId) => {
  const key = `${screenId}:${regionId}`;
  openComponentPickerKey.value = openComponentPickerKey.value === key ? null : key;
  componentSearch.value = "";
};

const sourceOptionsFor = kind => {
  if (kind === "calendar") {
    return calendarSources.value.map(source => ({ id: source.id, name: source.name }));
  }
  if (kind === "photos") {
    return imageInstances.value.map(instance => ({ id: instance.id, name: instance.name }));
  }
  return [];
};

const sourceSelectionLabel = region => {
  const ids = region.instanceIds || [];
  if (region.kind !== "calendar" && region.kind !== "photos") return "";
  if (ids.length === 0) return "All sources";
  if (ids.length === 1) {
    const source = sourceOptionsFor(region.kind).find(option => option.id === ids[0]);
    return source?.name || "1 source";
  }
  return `${ids.length} sources`;
};

const toggleRegionSource = (screenIndex, regionIndex, sourceId, checked) => {
  const layout = cloneLayout(screenIndex);
  const region = layout.regions[regionIndex];
  if (!region || region.kind === "service") return;
  const current = new Set(region.instanceIds || []);
  if (checked) current.add(sourceId);
  else current.delete(sourceId);
  region.instanceIds = [...current];
  region.serviceId = null;
  updateScreen(screenIndex, { layout });
};

const toggleSubRegionSource = (screenIndex, regionIndex, subIndex, sourceId, checked) => {
  const layout = cloneLayout(screenIndex);
  const sub = layout.regions[regionIndex]?.split?.regions?.[subIndex];
  if (!sub || sub.kind === "service") return;
  const current = new Set(sub.instanceIds || []);
  if (checked) current.add(sourceId);
  else current.delete(sourceId);
  sub.instanceIds = [...current];
  sub.serviceId = null;
  updateScreen(screenIndex, { layout });
};

const clearRegionSources = (screenIndex, regionIndex) => {
  const layout = cloneLayout(screenIndex);
  const region = layout.regions[regionIndex];
  if (!region || region.kind === "service") return;
  region.instanceIds = [];
  region.serviceId = null;
  updateScreen(screenIndex, { layout });
};

const clearSubRegionSources = (screenIndex, regionIndex, subIndex) => {
  const layout = cloneLayout(screenIndex);
  const sub = layout.regions[regionIndex]?.split?.regions?.[subIndex];
  if (!sub || sub.kind === "service") return;
  sub.instanceIds = [];
  sub.serviceId = null;
  updateScreen(screenIndex, { layout });
};

const cloneLayout = screenIndex => {
  const screen = dashboardScreens.value.screens[screenIndex];
  return {
    ...screen.layout,
    regions: screen.layout.regions.map(region => ({
      ...region,
      instanceIds: [...(region.instanceIds || [])],
      split: region.split
        ? {
            ...region.split,
            regions: region.split.regions.map(sub => ({
              ...sub,
              instanceIds: [...(sub.instanceIds || [])],
            })),
          }
        : null,
    })),
  };
};

const cloneScreens = () => ({
  ...dashboardScreens.value,
  screens: dashboardScreens.value.screens.map((screen, index) => ({
    ...screen,
    layout: cloneLayout(index),
  })),
});

const emitScreensUpdate = screens => {
  emit("update:config", {
    dashboardScreens: normalizeDashboardScreens(screens),
  });
};

const updateScreen = (screenIndex, updates) => {
  const screens = cloneScreens();
  screens.screens[screenIndex] = {
    ...screens.screens[screenIndex],
    ...updates,
  };
  emitScreensUpdate(screens);
};

const handleScreenNameChange = (screenIndex, event) => {
  updateScreen(screenIndex, { name: event.target.value || "Screen" });
};

const setActiveRegion = (screenIndex, regionId) => {
  updateScreen(screenIndex, { activeRegionId: regionId });
};

const startResize = (screenIndex, previewIndex, event) => {
  event.preventDefault();
  const screen = dashboardScreens.value.screens[screenIndex];
  const beforeRegion = screen.layout.regions[previewIndex];
  const afterRegion = screen.layout.regions[previewIndex + 1];
  const rect = previewRefs.get(screen.id)?.getBoundingClientRect();
  if (!beforeRegion || !afterRegion || !rect) return;

  dragState.value = {
    kind: "top",
    screenIndex,
    firstIndex: previewIndex,
    direction: layoutDirectionFor(screen.layout),
    rect,
  };
  window.addEventListener("pointermove", handleResizeMove);
  window.addEventListener("pointerup", stopResize, { once: true });
};

const startSubResize = (screenIndex, regionIndex, firstIndex, event) => {
  event.preventDefault();
  const screen = dashboardScreens.value.screens[screenIndex];
  const region = screen.layout.regions[regionIndex];
  if (!region?.split) return;
  const rect = subPreviewRefs.get(`${screen.id}:${region.id}`)?.getBoundingClientRect();
  if (!rect) return;

  dragState.value = {
    kind: "sub",
    screenIndex,
    regionIndex,
    firstIndex,
    direction: splitDirectionFor(screen.layout, region),
    rect,
  };
  window.addEventListener("pointermove", handleResizeMove);
  window.addEventListener("pointerup", stopResize, { once: true });
};

const handleResizeMove = event => {
  if (!dragState.value) return;
  const state = dragState.value;
  const isColumn = state.direction === "column";
  const pointerOffset = isColumn ? event.clientY - state.rect.top : event.clientX - state.rect.left;
  const axisSize = isColumn ? state.rect.height : state.rect.width;
  if (state.kind === "top") {
    const screen = dashboardScreens.value.screens[state.screenIndex];
    const previousSize = screen.layout.regions
      .slice(0, state.firstIndex)
      .reduce((sum, region) => sum + region.size, 0);
    const nextFirstSize = (pointerOffset / axisSize) * 100 - previousSize;
    const layout = cloneLayout(state.screenIndex);
    layout.regions = resizeAdjacentRegions(layout.regions, state.firstIndex, nextFirstSize);
    updateScreen(state.screenIndex, { layout });
  } else if (state.kind === "sub") {
    const screen = dashboardScreens.value.screens[state.screenIndex];
    const region = screen.layout.regions[state.regionIndex];
    if (!region?.split) return;
    const previousSize = region.split.regions
      .slice(0, state.firstIndex)
      .reduce((sum, sub) => sum + sub.size, 0);
    const nextFirstSize = (pointerOffset / axisSize) * 100 - previousSize;
    const layout = resizeSubRegionPair(
      cloneLayout(state.screenIndex),
      state.regionIndex,
      state.firstIndex,
      nextFirstSize
    );
    updateScreen(state.screenIndex, { layout });
  }
};

const stopResize = () => {
  dragState.value = null;
  window.removeEventListener("pointermove", handleResizeMove);
};

const addScreen = () => {
  const screens = cloneScreens();
  const screen = createDashboardScreenFromPreset("split_two", {
    name: `Screen ${screens.screens.length + 1}`,
  });
  screens.screens.push(screen);
  screens.activeScreenId = screen.id;
  expandedScreens.add(screen.id);
  emitScreensUpdate(screens);
};

const deleteScreen = screenIndex => {
  if (dashboardScreens.value.screens.length <= 1) return;
  const screens = cloneScreens();
  const removed = screens.screens.splice(screenIndex, 1)[0];
  expandedScreens.delete(removed.id);
  if (screens.activeScreenId === removed.id) {
    screens.activeScreenId = screens.screens[Math.min(screenIndex, screens.screens.length - 1)].id;
  }
  emitScreensUpdate(screens);
};

const regionLabel = previewIndex => `Region ${previewIndex + 1}`;

const regionKindLabel = region => {
  if (region.kind === "calendar") return `Calendar - ${sourceSelectionLabel(region)}`;
  if (region.kind === "photos") return `Photos - ${sourceSelectionLabel(region)}`;
  if (region.kind === "service") {
    const service = services.value.find(
      item => item.id === (region.instanceIds?.[0] || region.serviceId)
    );
    return service?.name || "Service";
  }
  return "Region";
};

const getPreviewRegionStyle = region => ({
  flex: `${region.size} ${region.size} 0`,
});

const getSubRegionStyle = sub => ({
  flex: `${sub.size} ${sub.size} 0`,
});

onMounted(async () => {
  if (webServicesStore.services.length === 0 && !webServicesStore.loading) {
    await webServicesStore.fetchServices();
  }
  if (calendarStore.sources.length === 0 && !calendarStore.loading) {
    await calendarStore.fetchSources();
  }
  if (plugins.value.length === 0 && !loadingPlugins.value) {
    await loadPlugins();
  }
});

onUnmounted(() => {
  window.removeEventListener("pointermove", handleResizeMove);
});
</script>

<style scoped>
.dashboard-layout-tab {
  width: 100%;
  /* Sits directly inside a SettingsSection panel (no SettingRow padding). */
  padding: var(--space-xl) var(--space-2xl) var(--space-2xl);
}

.screen-stack {
  display: flex;
  gap: var(--space-xl);
  margin: 0;
}

.screen-stack-landscape {
  flex-direction: column;
}

.screen-stack-portrait {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
}

.screen-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0.85rem;
  background: var(--bg-2);
  overflow-x: auto;
}

.screen-stack-portrait .screen-card {
  flex: 0 0 auto;
}

.screen-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}
.screen-header-identity {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  flex: 1 1 auto;
  min-width: 0;
}
.screen-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  flex: 0 0 auto;
  padding-left: var(--space-md);
  border-left: 1px solid var(--line);
}

.screen-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 1.75rem;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-pill);
  background: var(--focus);
  color: var(--focus-ink);
  font-weight: 700;
}

.screen-name-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  padding: 0.4rem 0.55rem;
  background: var(--bg-1);
  color: var(--ink);
  font-weight: 600;
}

.add-region-button {
  flex: 0 0 auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  padding: 0.4rem 0.65rem;
  background: var(--bg-1);
  color: var(--focus);
  cursor: pointer;
  font-weight: 600;
}

.add-region-button:hover:not(:disabled),
.add-region-button:focus:not(:disabled) {
  border-color: var(--focus);
}

.add-region-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.screen-preview {
  display: flex;
  margin: 0;
  padding: var(--space-lg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  box-sizing: border-box;
  width: 100%;
}

.screen-preview-row {
  flex-direction: row;
}

.screen-preview-column {
  flex-direction: column;
}

.preview-region {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  background: var(--bg-2);
  color: var(--ink);
  box-sizing: border-box;
  gap: var(--space-sm);
}

.preview-region-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  /* Wrap the control cluster so split/remove/etc. stay reachable in a thin
     (small-size) region instead of overflowing and being clipped. */
  flex-wrap: wrap;
  gap: var(--space-2xs);
  min-height: 1.75rem;
  flex: 0 0 auto;
}
.preview-region-label {
  margin-right: auto;
}

.preview-primary-control {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  font-size: var(--fs-sm);
  color: var(--ink-2);
  cursor: pointer;
}

.split-toggle {
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  padding: 0.2rem 0.5rem;
  background: var(--bg-1);
  color: var(--ink-2);
  cursor: pointer;
  font-size: var(--fs-xs);
}

.split-toggle:hover,
.split-toggle:focus {
  border-color: var(--focus);
  color: var(--ink);
}

.preview-component-select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.55rem;
  background: var(--bg-1);
  color: var(--ink);
  font-size: var(--fs-base);
  font-weight: 600;
  box-sizing: border-box;
  cursor: pointer;
  text-align: left;
}

.preview-component-select:focus {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.preview-component-picker {
  position: relative;
}

.component-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--bg-1);
  box-shadow: 0 12px 32px var(--focus-glow);
}

.component-search {
  width: 100%;
  margin: 0 0 6px;
  padding: 0.55rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-2);
  color: var(--ink);
  box-sizing: border-box;
}

.component-option {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 100%;
  min-height: 44px;
  padding: 0.55rem 0.65rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}

.component-option__type {
  font-size: 0.75rem;
  color: var(--ink-2);
}

.component-option:hover,
.component-option:focus {
  background: var(--bg-2);
  outline: none;
}

.source-options {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--line-soft);
}

.source-option {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border-radius: var(--radius-sm);
  color: var(--ink);
  cursor: pointer;
  font-size: var(--fs-md);
}

.source-option:hover {
  background: var(--bg-2);
}

.component-empty {
  padding: 0.65rem;
  color: var(--ink-2);
  font-size: var(--fs-sm);
}

.preview-size-control {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--ink-2);
  font-size: var(--fs-sm);
}

.preview-size-value {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--ink);
}

.preview-resizer {
  flex: 0 0 14px;
  border: 0;
  border-radius: var(--radius-xs);
  background: var(--line);
  cursor: col-resize;
  padding: 0;
}

.preview-resizer:hover,
.preview-resizer:focus {
  background: var(--focus);
}

.preview-resizer-column {
  cursor: row-resize;
}

.preview-resizer-row {
  cursor: col-resize;
}

.preview-region-active {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.preview-region-calendar {
  border-left: 6px solid var(--region-calendar);
}

.preview-region-photos {
  border-left: 6px solid var(--region-photos);
}

.preview-region-service {
  border-left: 6px solid var(--region-service);
}

.preview-region-split {
  border-left: 6px solid var(--focus);
}

.preview-region-label {
  color: var(--ink-2);
  font-size: var(--fs-sm);
}

.preview-split-container {
  display: flex;
  flex: 1 1 auto;
  gap: 0;
  min-height: 0;
  min-width: 0;
  border: 1px dashed var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-2xs);
}

.preview-split-row {
  flex-direction: row;
}

.preview-split-column {
  flex-direction: column;
}

.add-region-button-small {
  padding: 0.2rem 0.5rem;
  font-size: var(--fs-xs);
  font-weight: 500;
}

.preview-subregion {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-md);
  background: var(--bg-1);
  box-sizing: border-box;
  cursor: pointer;
}

.preview-subregion .preview-region-header {
  min-height: 1.75rem;
}

.screen-clock-bar-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

.clock-bar-row-label {
  font-weight: 600;
  color: var(--ink);
}

.clock-bar-visibility {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--ink);
}

.clock-bar-visibility-label {
  min-width: 3rem;
  font-size: var(--fs-sm);
}

.clock-bar-inherit {
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  padding: var(--space-3xs) var(--space-sm);
  background: var(--bg-2);
  color: var(--ink);
  cursor: pointer;
}

.clock-bar-inherit:hover,
.clock-bar-inherit:focus {
  border-color: var(--focus);
}

.clock-bar-inherit-hint {
  font-style: italic;
  font-size: var(--fs-xs);
}

.clock-bar-drag-hint {
  font-style: italic;
  font-size: var(--fs-xs);
  color: var(--ink-3);
}

.clock-bar-summary {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

.screen-preview-frame {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.clock-bar-token {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  /* A quiet accent-tinted band, not a solid fill: it represents the clock
     bar's footprint without competing with the solid --focus that marks the
     active screen/region. */
  background: color-mix(in srgb, var(--focus) 14%, var(--bg-1));
  color: var(--focus);
  border: 1px solid color-mix(in srgb, var(--focus) 30%, transparent);
  border-radius: var(--radius-xs);
  font-size: var(--fs-xs);
  font-weight: 500;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}

.clock-bar-token:hover {
  background: color-mix(in srgb, var(--focus) 20%, var(--bg-1));
}

.clock-bar-token:active {
  cursor: grabbing;
}

.clock-bar-token-horizontal {
  width: 100%;
  height: 1.6rem;
  padding: 0 var(--space-sm);
}

.clock-bar-token-vertical {
  width: 1.6rem;
  align-self: stretch;
  writing-mode: vertical-rl;
  padding: var(--space-sm) 0;
}

.clock-bar-token-label {
  white-space: nowrap;
}

.clock-bar-drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--focus);
  border-radius: var(--radius-xs);
  background: rgba(0, 0, 0, 0.05);
  color: var(--focus);
  font-size: var(--fs-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.clock-bar-drop-zone-horizontal {
  width: 100%;
  height: 1.4rem;
}

.clock-bar-drop-zone-vertical {
  width: 1.4rem;
  align-self: stretch;
  writing-mode: vertical-rl;
}

.clock-bar-drop-zone-between-horizontal {
  width: 100%;
  height: 1.4rem;
}

.clock-bar-drop-zone-between-vertical {
  width: 1.4rem;
  align-self: stretch;
  writing-mode: vertical-rl;
}

.clock-bar-drop-zone-mode-switch {
  border-style: dotted;
  border-color: var(--focus);
  background: rgba(255, 165, 0, 0.08);
}

.screen-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-height: 96px;
  border: 1px dashed var(--focus);
  border-radius: var(--radius-sm);
  padding: var(--space-xl);
  background: transparent;
  color: var(--focus);
  font-weight: 600;
  cursor: pointer;
}

.screen-stack-portrait .screen-add {
  align-self: stretch;
  min-width: 220px;
}

.screen-add:hover,
.screen-add:focus {
  background: var(--bg-2);
}

.screen-add-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px dashed var(--focus);
  border-radius: var(--radius-pill);
  font-size: 1.6rem;
  line-height: 1;
}
</style>
