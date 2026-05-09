<template>
  <div class="dashboard-layout-tab">
    <CollapsibleSection title="Screen Orientation" icon="🖥️">
      <SettingItem label="Orientation" help="Screen orientation" input-id="display-orientation">
        <select
          id="display-orientation"
          :value="configValue.orientation"
          aria-label="Screen orientation"
          @change="handleOrientationChange"
        >
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Flip Orientation (180°)"
        help="Rotate the display 180 degrees (useful for mounted displays)"
      >
        <label>
          <input
            :checked="configValue.orientationFlipped"
            type="checkbox"
            @change="handleOrientationFlippedChange"
          />
          Flip Orientation
        </label>
      </SettingItem>

      <SettingItem
        label="Apply Display Rotation (Raspberry Pi)"
        help="Physically rotate the display when orientation changes (RPi only)"
      >
        <label>
          <input
            :checked="configValue.applyDisplayRotation"
            type="checkbox"
            @change="handleApplyDisplayRotationChange"
          />
          Apply Display Rotation
        </label>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Screens" icon="📐">
      <div class="screen-stack" :class="`screen-stack-${configValue.orientation}`">
        <section
          v-for="(screen, screenIndex) in dashboardScreens.screens"
          :key="screen.id"
          class="screen-card"
        >
          <header class="screen-card-header">
            <button
              type="button"
              class="screen-collapse-toggle"
              :aria-expanded="expandedScreens.has(screen.id)"
              :aria-label="
                expandedScreens.has(screen.id)
                  ? `Collapse screen ${screenIndex + 1}`
                  : `Expand screen ${screenIndex + 1}`
              "
              @click="toggleScreenExpanded(screen.id)"
            >
              {{ expandedScreens.has(screen.id) ? "▾" : "▸" }}
            </button>
            <span class="screen-index">{{ screenIndex + 1 }}</span>
            <input
              :id="`screen-name-${screen.id}`"
              :value="screen.name"
              type="text"
              class="screen-name-input"
              :aria-label="`Screen ${screenIndex + 1} name`"
              @change="handleScreenNameChange(screenIndex, $event)"
            />
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
            <button
              type="button"
              class="direction-toggle"
              :aria-label="`Toggle screen ${screenIndex + 1} layout direction`"
              :title="`Direction: ${directionLabel(layoutDirectionFor(screen.layout))}`"
              @click="toggleLayoutDirection(screenIndex)"
            >
              {{ layoutDirectionFor(screen.layout) === "column" ? "▭▭" : "▯|▯" }}
            </button>
            <button
              v-if="dashboardScreens.screens.length > 1"
              type="button"
              class="screen-delete"
              :aria-label="`Delete screen ${screenIndex + 1}`"
              @click="deleteScreen(screenIndex)"
            >
              ×
            </button>
          </header>

          <div
            v-if="expandedScreens.has(screen.id)"
            :ref="el => setPreviewRef(screen.id, el)"
            class="screen-preview"
            :class="`screen-preview-${layoutDirectionFor(screen.layout)}`"
            :style="previewStyleFor(screen.layout)"
          >
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
                  <button
                    v-if="region.split"
                    type="button"
                    class="split-toggle"
                    :aria-label="`Toggle ${regionLabel(previewIndex)} split direction`"
                    :title="`Sub direction: ${directionLabel(splitDirectionFor(screen.layout, region))}`"
                    @click.stop="toggleSubDirection(screenIndex, previewIndex)"
                  >
                    {{ splitDirectionFor(screen.layout, region) === "column" ? "▭▭" : "▯|▯" }}
                  </button>
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
                  <button
                    v-if="screen.layout.regions.length > 1"
                    type="button"
                    class="region-delete"
                    :aria-label="`Delete ${regionLabel(previewIndex)}`"
                    @click.stop="removeRegion(screenIndex, previewIndex)"
                  >
                    ×
                  </button>
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
                          <button
                            v-if="region.split.regions.length > 1"
                            type="button"
                            class="region-delete"
                            :aria-label="`Delete ${regionLabel(previewIndex)} sub ${subIndex + 1}`"
                            @click.stop="removeSub(screenIndex, previewIndex, subIndex)"
                          >
                            ×
                          </button>
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
                              {{ option.label }}
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
                        <label class="preview-size-control">
                          Size
                          <input
                            :id="`region-size-${sub.id}`"
                            :value="sub.size"
                            type="number"
                            min="10"
                            max="90"
                            step="1"
                            :aria-label="`Sub ${subIndex + 1} size percentage`"
                            @change="
                              handleSubRegionSizeChange(
                                screenIndex,
                                previewIndex,
                                subIndex,
                                $event.target.value
                              )
                            "
                          />
                          %
                        </label>
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
                        {{ option.label }}
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
                  <label
                    v-if="screen.layout.regions.length > 1"
                    class="preview-size-control"
                    @click.stop
                  >
                    Size
                    <input
                      :id="`region-size-${region.id}`"
                      :value="region.size"
                      type="number"
                      min="10"
                      max="90"
                      step="1"
                      :aria-label="`${regionLabel(previewIndex)} size percentage`"
                      @change="
                        handleRegionSizeChange(screenIndex, previewIndex, $event.target.value)
                      "
                    />
                    %
                  </label>
                </template>
              </div>
              <button
                v-if="previewIndex < screen.layout.regions.length - 1"
                type="button"
                :class="['preview-resizer', `preview-resizer-${layoutDirectionFor(screen.layout)}`]"
                :aria-label="`Resize ${regionLabel(previewIndex)}`"
                @pointerdown="startResize(screenIndex, previewIndex, $event)"
              />
            </template>
          </div>
        </section>

        <button type="button" class="screen-add" @click="addScreen">
          <span class="screen-add-icon">+</span>
          <span>Add Screen</span>
        </button>
      </div>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useWebServicesStore } from "@/stores/webServices";
import { useCalendarStore } from "@/stores/calendar";
import { usePlugins } from "@/composables";
import {
  MAX_TOP_REGIONS,
  addSubRegion,
  addTopRegion,
  createDashboardScreenFromPreset,
  getLayoutDirection,
  getSplitDirection,
  normalizeDashboardScreens,
  removeSubRegion,
  removeTopRegion,
  resizeAdjacentRegions,
  resizeSubRegion,
  resizeSubRegionPair,
  setLayoutDirection,
  setSplitDirection,
  setSubRegionContent,
  splitTopRegion,
  unsplitTopRegion,
} from "@/utils/layout";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

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
const openComponentPickerKey = ref(null);
const componentSearch = ref("");

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
    dashboardScreens: normalizeDashboardScreens(config.dashboardScreens),
  };
});

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
const componentOptions = computed(() => [
  { value: "calendar", label: "Calendar", kind: "calendar", instanceIds: [] },
  { value: "photos", label: "Photos", kind: "photos", instanceIds: [] },
  ...services.value.map(service => ({
    value: `service:${service.id}`,
    label: service.name,
    kind: "service",
    instanceIds: [service.id],
  })),
]);
const filteredComponentOptions = computed(() => {
  const query = componentSearch.value.trim().toLowerCase();
  if (!query) return componentOptions.value;
  return componentOptions.value.filter(option => option.label.toLowerCase().includes(query));
});

const handleOrientationChange = event => {
  emit("update:config", { orientation: event.target.value });
};

const handleOrientationFlippedChange = event => {
  emit("update:config", { orientationFlipped: event.target.checked });
};

const handleApplyDisplayRotationChange = event => {
  emit("update:config", { applyDisplayRotation: event.target.checked });
};

const handleRegionSizeChange = (screenIndex, regionIndex, rawValue) => {
  const value = parseInt(rawValue, 10);
  if (isNaN(value)) return;
  const clamped = Math.max(10, Math.min(90, value));
  const layout = cloneLayout(screenIndex);
  layout.regions = resizeRegionAtIndex(layout.regions, regionIndex, clamped);
  updateScreen(screenIndex, { layout });
};

const handleSubRegionSizeChange = (screenIndex, regionIndex, subIndex, rawValue) => {
  const value = parseInt(rawValue, 10);
  if (isNaN(value)) return;
  const clamped = Math.max(10, Math.min(90, value));
  const layout = resizeSubRegion(cloneLayout(screenIndex), regionIndex, subIndex, clamped);
  updateScreen(screenIndex, { layout });
};

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

const resizeRegionAtIndex = (regions, index, size) => {
  if (regions.length <= 1) return regions;
  if (index >= regions.length - 1) {
    const resizeIndex = index - 1;
    const pairTotal = Number(regions[resizeIndex].size) + Number(regions[index].size);
    return resizeAdjacentRegions(regions, resizeIndex, pairTotal - size);
  }
  return resizeAdjacentRegions(regions, index, size);
};

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
}

.screen-stack {
  display: flex;
  gap: 1rem;
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
  gap: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.85rem;
  background: var(--bg-secondary);
  overflow-x: auto;
}

.screen-stack-portrait .screen-card {
  flex: 0 0 auto;
}

.screen-card-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.screen-collapse-toggle {
  flex: 0 0 auto;
  width: 1.6rem;
  height: 1.6rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
}

.screen-collapse-toggle:hover,
.screen-collapse-toggle:focus {
  color: var(--text-primary);
  background: var(--bg-primary);
}

.screen-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 1.75rem;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  background: var(--accent-primary);
  color: #fff;
  font-weight: 700;
}

.screen-name-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.4rem 0.55rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 600;
}

.add-region-button {
  flex: 0 0 auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.4rem 0.65rem;
  background: var(--bg-primary);
  color: var(--accent-primary);
  cursor: pointer;
  font-weight: 600;
}

.add-region-button:hover:not(:disabled),
.add-region-button:focus:not(:disabled) {
  border-color: var(--accent-primary);
}

.add-region-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.region-delete {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0 0.4rem;
  background: var(--bg-primary);
  color: var(--color-red);
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1.4;
}

.region-delete:hover,
.region-delete:focus {
  border-color: var(--color-red);
}

.direction-toggle {
  flex: 0 0 auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
}

.direction-toggle:hover,
.direction-toggle:focus {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.screen-delete {
  flex: 0 0 auto;
  width: 1.9rem;
  height: 1.9rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--color-red);
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
}

.screen-delete:hover,
.screen-delete:focus {
  background: var(--bg-secondary);
}

.screen-preview {
  display: flex;
  margin: 0;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
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
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-sizing: border-box;
  gap: 0.5rem;
}

.preview-region-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.75rem;
  flex: 0 0 auto;
}

.preview-primary-control {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.split-toggle {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
}

.split-toggle:hover,
.split-toggle:focus {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.preview-component-select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.45rem 0.55rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
  box-sizing: border-box;
  cursor: pointer;
  text-align: left;
}

.preview-component-select:focus {
  outline: 2px solid var(--accent-primary);
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
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  box-shadow: 0 8px 24px var(--shadow);
}

.component-search {
  width: calc(100% - 0.75rem);
  margin: 0.375rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-sizing: border-box;
}

.component-option {
  display: block;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 0;
  border-top: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.component-option:hover,
.component-option:focus {
  background: var(--bg-secondary);
  outline: none;
}

.source-options {
  border-top: 1px solid var(--border-color);
  padding: 0.35rem 0;
}

.source-option {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.65rem;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
}

.source-option:hover {
  background: var(--bg-secondary);
}

.component-empty {
  padding: 0.65rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.preview-size-control {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.preview-size-control input {
  width: 4rem;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.35rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.preview-resizer {
  flex: 0 0 14px;
  border: 0;
  border-radius: 4px;
  background: var(--border-color);
  cursor: col-resize;
  padding: 0;
}

.preview-resizer:hover,
.preview-resizer:focus {
  background: var(--accent-primary);
}

.preview-resizer-column {
  cursor: row-resize;
}

.preview-resizer-row {
  cursor: col-resize;
}

.preview-region-active {
  outline: 2px solid var(--accent-primary);
  outline-offset: -2px;
}

.preview-region-calendar {
  border-left: 6px solid #4caf50;
}

.preview-region-photos {
  border-left: 6px solid #2196f3;
}

.preview-region-service {
  border-left: 6px solid #ff9800;
}

.preview-region-split {
  border-left: 6px solid var(--accent-primary);
}

.preview-region-label {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.preview-split-container {
  display: flex;
  flex: 1 1 auto;
  gap: 0;
  min-height: 0;
  min-width: 0;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  padding: 0.35rem;
}

.preview-split-row {
  flex-direction: row;
}

.preview-split-column {
  flex-direction: column;
}

.add-region-button-small {
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 500;
}

.preview-subregion {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.6rem;
  background: var(--bg-primary);
  box-sizing: border-box;
  cursor: pointer;
}

.preview-subregion .preview-region-header {
  min-height: 1.75rem;
}

.screen-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 96px;
  border: 1px dashed var(--accent-primary);
  border-radius: 8px;
  padding: 1rem;
  background: transparent;
  color: var(--accent-primary);
  font-weight: 600;
  cursor: pointer;
}

.screen-stack-portrait .screen-add {
  align-self: stretch;
  min-width: 220px;
}

.screen-add:hover,
.screen-add:focus {
  background: var(--bg-secondary);
}

.screen-add-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px dashed var(--accent-primary);
  border-radius: 999px;
  font-size: 1.6rem;
  line-height: 1;
}
</style>
