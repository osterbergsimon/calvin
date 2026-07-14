<template>
  <teleport to="body">
    <div
      v-if="open"
      class="sre-root"
      role="dialog"
      aria-modal="true"
      aria-label="Screens and regions"
    >
      <DialogScrim blur @dismiss="$emit('close')" />
      <div class="sre-modal">
        <!-- Header -->
        <header class="sre-header">
          <div class="sre-title">
            <h2>Screens &amp; regions</h2>
            <p class="sre-sub">
              Design the layouts your kiosks display · drag a divider to resize · changes apply live
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

        <!-- Context strip: screen tabs + preview-as -->
        <div class="sre-context">
          <div class="sre-tabs" role="tablist" aria-label="Screens">
            <button
              v-for="screen in screens.screens"
              :key="screen.id"
              type="button"
              role="tab"
              class="sre-tab"
              :class="{ 'is-active': screen.id === activeScreenId }"
              :aria-selected="screen.id === activeScreenId"
              @click="selectScreen(screen.id)"
            >
              <span class="sre-tab-dot" />
              {{ screen.name }}
            </button>
            <button
              type="button"
              class="sre-tab-add"
              aria-label="Add screen"
              title="Add screen"
              @click="addScreen"
            >
              +
            </button>
          </div>
          <div class="sre-preview-as">
            <span class="sre-preview-label">Preview as</span>
            <SelectPill
              :model-value="previewKioskId"
              :options="kioskOptions"
              aria-label="Preview as kiosk"
              @update:model-value="setPreviewKiosk"
            />
            <span class="sre-orient-badge">{{ orientationBadge }}</span>
          </div>
        </div>

        <!-- Body: stage + rail -->
        <div class="sre-body">
          <!-- STAGE -->
          <div class="sre-stage">
            <div class="sre-stage-tag"><span class="dot" /> {{ stageTag }}</div>

            <div v-if="mismatch" class="sre-mismatch">
              ⚠️ <strong>{{ previewKioskName }}</strong> isn’t set to show “{{
                activeScreen.name
              }}”. You can still design it here — assign it in <span class="link">Kiosks</span> to
              make it appear.
            </div>

            <div class="sre-device-wrap" :class="{ dimmed: mismatch, flip: previewFlipped }">
              <div class="sre-device" :class="orientation" :style="deviceSize">
                <div
                  :ref="el => (screenEl = el)"
                  class="sre-screen"
                  :class="`dir-${layoutDir}`"
                  :style="clockAxisStyle"
                >
                  <!-- clock bar: top/left (leading perimeter) -->
                  <div
                    v-if="clock.enabled && clock.position === leadingPerimeter"
                    class="sre-clockbar"
                    :class="clock.mode === 'vertical' ? 'v' : 'h'"
                  >
                    12:45 · Tue
                  </div>

                  <div class="sre-regions" :class="`dir-${layoutDir}`">
                    <template v-for="(region, i) in activeScreen.layout.regions" :key="region.id">
                      <!-- clock bar between region i-1 and i -->
                      <div
                        v-if="clock.enabled && betweenIndex === i - 1"
                        class="sre-clockbar between"
                        :class="layoutDir === 'row' ? 'v' : 'h'"
                      >
                        12:45
                      </div>

                      <div
                        class="sre-region"
                        :class="[
                          region.split ? 'is-split' : `kind-${region.kind}`,
                          { 'is-active': isSelected(region) },
                        ]"
                        :style="regionFlex(region)"
                        tabindex="0"
                        @click="selectRegion(region.id)"
                        @keydown.enter.prevent="selectRegion(region.id)"
                        @keydown.space.prevent="selectRegion(region.id)"
                      >
                        <!-- nested split -->
                        <div
                          v-if="region.split"
                          :ref="el => setSubRef(region.id, el)"
                          class="sre-subsplit"
                          :class="`dir-${subDir(region)}`"
                        >
                          <template v-for="(sub, si) in region.split.regions" :key="sub.id">
                            <div
                              class="sre-region sub"
                              :class="[`kind-${sub.kind}`, { 'is-active': isSelected(sub) }]"
                              :style="regionFlex(sub)"
                              tabindex="0"
                              @click.stop="selectRegion(sub.id)"
                              @keydown.enter.prevent="selectRegion(sub.id)"
                            >
                              <div class="sre-region-face">
                                <span class="sre-region-emoji">{{ kindEmoji(sub.kind) }}</span>
                                <span class="sre-region-name">{{ regionTitle(sub) }}</span>
                                <span class="sre-region-size">{{ sub.size }}%</span>
                              </div>
                            </div>
                            <button
                              v-if="si < region.split.regions.length - 1"
                              type="button"
                              class="sre-resizer"
                              :class="subDir(region) === 'row' ? 'col' : 'row'"
                              aria-label="Resize sub-regions"
                              @pointerdown.stop="startSubResize(region, si, $event)"
                            >
                              <span class="grip" />
                            </button>
                          </template>
                        </div>
                        <!-- leaf face -->
                        <div v-else class="sre-region-face">
                          <span class="sre-region-emoji">{{ kindEmoji(region.kind) }}</span>
                          <span class="sre-region-name">{{ regionTitle(region) }}</span>
                          <span
                            v-if="activeScreen.layout.regions.length > 1"
                            class="sre-region-size"
                          >
                            {{ region.size }}%
                          </span>
                        </div>
                      </div>

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
                    class="sre-clockbar"
                    :class="clock.mode === 'vertical' ? 'v' : 'h'"
                  >
                    12:45 · Tue
                  </div>
                </div>
              </div>
            </div>

            <div v-if="!mismatch && previewKioskId !== GLOBAL" class="sre-preview-note">
              Previewing on {{ previewKioskName }} · edits save to the shared “{{
                activeScreen.name
              }}” screen
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
              @patch-view="patchSelectedView"
              @set-component="setSelectedComponent"
              @toggle-source="toggleSelectedSource"
              @clear-sources="clearSelectedSources"
              @toggle-split="toggleSplitSelected"
              @toggle-sub-direction="toggleSubDirSelected"
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
import { usePlugins } from "@/composables";
import { buildComponentOptions } from "@/utils/componentPicker";
import DialogScrim from "@/components/ui/DialogScrim.vue";
import IconButton from "@/components/ui/IconButton.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import ScreenInspector from "./regions/ScreenInspector.vue";
import RegionInspector from "./regions/RegionInspector.vue";
import {
  MAX_TOP_REGIONS,
  addTopRegion,
  computeClockBarPositionUpdate,
  createDashboardScreenFromPreset,
  createDashboardLayoutFromPreset,
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
  setRegionView,
  setSplitDirection,
  setSubRegionContent,
  splitTopRegion,
  unsplitTopRegion,
} from "@/utils/layout";

const props = defineProps({
  config: { type: Object, required: true, default: () => ({}) },
  open: { type: Boolean, default: false },
});
const emit = defineEmits(["update:config", "close"]);

const GLOBAL = "__global";
const webServicesStore = useWebServicesStore();
const calendarStore = useCalendarStore();
const kiosksStore = useKiosksStore();
const { plugins, pluginInstances, loadingPlugins, loadPlugins } = usePlugins();

const selectedRegionId = ref(null);
const previewKioskId = ref(GLOBAL);
const screenEl = ref(null);
const subRefs = new Map();
const dragState = ref(null);

const setSubRef = (id, el) => {
  if (el) subRefs.set(id, el);
  else subRefs.delete(id);
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

/* --- preview-as kiosk --- */
const kioskOptions = computed(() => [
  { value: GLOBAL, label: "Global default" },
  ...kiosksStore.kiosks.map(k => ({
    value: k.id,
    label: k.hostname || k.id,
  })),
]);
const previewKiosk = computed(
  () => kiosksStore.kiosks.find(k => k.id === previewKioskId.value) || null
);
const previewKioskName = computed(
  () => previewKiosk.value?.hostname || previewKiosk.value?.id || ""
);
const orientation = computed(
  () => previewKiosk.value?.overrides?.orientation || orientationConfig.value
);
const previewFlipped = computed(
  () =>
    previewKiosk.value?.overrides?.orientationFlipped ??
    configValue.value.orientationFlipped ??
    false
);
const orientationBadge = computed(
  () =>
    orientation.value.charAt(0).toUpperCase() +
    orientation.value.slice(1) +
    (previewFlipped.value ? " · 180°" : "")
);
const mismatch = computed(() => {
  const avail = previewKiosk.value?.overrides?.availableScreens;
  return Array.isArray(avail) && !avail.includes(activeScreenId.value);
});
const stageTag = computed(() =>
  previewKioskId.value === GLOBAL
    ? `Live preview · “${activeScreen.value.name}”`
    : `Preview on ${previewKioskName.value} · “${activeScreen.value.name}”`
);

/* --- layout direction + clock bar --- */
const layoutDir = computed(() => getLayoutDirection(activeScreen.value.layout, orientation.value));
const subDir = region => getSplitDirection(region.split, layoutDir.value);
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
const deviceSize = computed(() =>
  orientation.value === "landscape"
    ? { width: "560px", height: "336px" }
    : { width: "352px", height: "580px" }
);

/* --- selection --- */
const findRegion = id => {
  for (const r of activeScreen.value.layout.regions) {
    if (r.id === id) return r;
    if (r.split) {
      const sub = r.split.regions.find(s => s.id === id);
      if (sub) return sub;
    }
  }
  return null;
};
const selectedRegion = computed(() =>
  selectedRegionId.value ? findRegion(selectedRegionId.value) : null
);
const isSelected = region => region.id === selectedRegionId.value;
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
    name: `Screen ${next.screens.length + 1}`,
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
const topIndexOf = region =>
  activeScreen.value.layout.regions.findIndex(
    r => r.id === region.id || r.split?.regions.some(s => s.id === region.id)
  );
const removeSelected = () => {
  const region = selectedRegion.value;
  if (!region) return;
  const ti = topIndexOf(region);
  const top = activeScreen.value.layout.regions[ti];
  if (top.split && top.id !== region.id) {
    const si = top.split.regions.findIndex(s => s.id === region.id);
    updateActiveLayout(removeSubRegion(cloneLayout(), ti, si));
  } else {
    if (activeScreen.value.layout.regions.length <= 1) return;
    updateActiveLayout(removeTopRegion(cloneLayout(), ti));
  }
  selectedRegionId.value = null;
};
const toggleSplitSelected = () => {
  const region = selectedRegion.value;
  if (!region) return;
  const ti = topIndexOf(region);
  const top = activeScreen.value.layout.regions[ti];
  updateActiveLayout(
    top.split ? unsplitTopRegion(cloneLayout(), ti) : splitTopRegion(cloneLayout(), ti)
  );
};
const toggleSubDirSelected = () => {
  const region = selectedRegion.value;
  if (!region) return;
  const ti = topIndexOf(region);
  const top = activeScreen.value.layout.regions[ti];
  if (!top.split) return;
  const cur = getSplitDirection(top.split, layoutDir.value);
  updateActiveLayout(setSplitDirection(cloneLayout(), ti, cur === "column" ? "row" : "column"));
};
const setSelectedComponent = option => {
  const region = selectedRegion.value;
  if (!region) return;
  const ti = topIndexOf(region);
  const top = activeScreen.value.layout.regions[ti];
  const patch = {
    kind: option.kind,
    serviceId: option.kind === "service" ? option.instanceIds?.[0] || null : null,
    instanceIds: option.instanceIds || [],
  };
  if (top.split && top.id !== region.id) {
    const si = top.split.regions.findIndex(s => s.id === region.id);
    updateActiveLayout(setSubRegionContent(cloneLayout(), ti, si, patch));
  } else {
    const layout = cloneLayout();
    layout.regions[ti] = { ...layout.regions[ti], ...patch };
    updateActiveLayout(layout);
  }
};
const toggleSelectedSource = (sourceId, checked) => {
  const region = selectedRegion.value;
  if (!region || region.kind === "service") return;
  const cur = new Set(region.instanceIds || []);
  if (checked) cur.add(sourceId);
  else cur.delete(sourceId);
  applySourceIds(region, [...cur]);
};
const clearSelectedSources = () => {
  const region = selectedRegion.value;
  if (region) applySourceIds(region, []);
};
const applySourceIds = (region, ids) => {
  const ti = topIndexOf(region);
  const top = activeScreen.value.layout.regions[ti];
  if (top.split && top.id !== region.id) {
    const si = top.split.regions.findIndex(s => s.id === region.id);
    const layout = cloneLayout();
    layout.regions[ti].split.regions[si] = {
      ...layout.regions[ti].split.regions[si],
      instanceIds: ids,
      serviceId: null,
    };
    updateActiveLayout(layout);
  } else {
    const layout = cloneLayout();
    layout.regions[ti] = { ...layout.regions[ti], instanceIds: ids, serviceId: null };
    updateActiveLayout(layout);
  }
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

/* --- resize (ported from DashboardRegionsEditor) --- */
const startResize = (firstIndex, event) => {
  event.preventDefault();
  const rect = screenEl.value?.querySelector(".sre-regions")?.getBoundingClientRect();
  if (!rect) return;
  dragState.value = { kind: "top", firstIndex, direction: layoutDir.value, rect };
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", stopResize, { once: true });
};
const startSubResize = (region, firstIndex, event) => {
  event.preventDefault();
  const rect = subRefs.get(region.id)?.getBoundingClientRect();
  if (!rect) return;
  dragState.value = {
    kind: "sub",
    topIndex: topIndexOf(region),
    firstIndex,
    direction: subDir(region),
    rect,
  };
  window.addEventListener("pointermove", onResizeMove);
  window.addEventListener("pointerup", stopResize, { once: true });
};
const onResizeMove = event => {
  const s = dragState.value;
  if (!s) return;
  const isColumn = s.direction === "column";
  const offset = isColumn ? event.clientY - s.rect.top : event.clientX - s.rect.left;
  const axis = isColumn ? s.rect.height : s.rect.width;
  if (s.kind === "top") {
    const prev = activeScreen.value.layout.regions
      .slice(0, s.firstIndex)
      .reduce((a, r) => a + r.size, 0);
    const nextSize = (offset / axis) * 100 - prev;
    const layout = cloneLayout();
    layout.regions = resizeAdjacentRegions(layout.regions, s.firstIndex, nextSize);
    updateActiveLayout(layout);
  } else {
    const top = activeScreen.value.layout.regions[s.topIndex];
    if (!top?.split) return;
    const prev = top.split.regions.slice(0, s.firstIndex).reduce((a, r) => a + r.size, 0);
    const nextSize = (offset / axis) * 100 - prev;
    updateActiveLayout(resizeSubRegionPair(cloneLayout(), s.topIndex, s.firstIndex, nextSize));
  }
};
const stopResize = () => {
  dragState.value = null;
  window.removeEventListener("pointermove", onResizeMove);
};

/* --- labels --- */
const kindEmoji = kind => (kind === "calendar" ? "📅" : kind === "photos" ? "🖼️" : "🌐");
const regionTitle = region => {
  if (region.kind === "service") {
    const svc = services.value.find(s => s.id === (region.instanceIds?.[0] || region.serviceId));
    return svc?.name || "Service";
  }
  return region.kind === "calendar" ? "Calendar" : "Photos";
};
const regionFlex = region => ({ flex: `${region.size} ${region.size} 0` });

const setPreviewKiosk = id => (previewKioskId.value = id);

/* keep selection valid when screen changes */
watch(activeScreenId, () => (selectedRegionId.value = null));

onMounted(async () => {
  if (webServicesStore.services.length === 0 && !webServicesStore.loading)
    webServicesStore.fetchServices();
  if (calendarStore.sources.length === 0 && !calendarStore.loading) calendarStore.fetchSources();
  if (plugins.value.length === 0 && !loadingPlugins.value) loadPlugins();
  if (kiosksStore.kiosks.length === 0) kiosksStore.loadKiosks();
});
onUnmounted(() => window.removeEventListener("pointermove", onResizeMove));
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
  gap: var(--space-2xs);
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
.sre-tab-dot {
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
  font-size: var(--fs-xs);
  line-height: 1.35;
  color: var(--ink);
  background: color-mix(in srgb, var(--warn) 16%, var(--bg-1));
  border: 1px solid color-mix(in srgb, var(--warn) 50%, transparent);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-sm);
}
.sre-mismatch .link {
  color: var(--focus);
  font-weight: 600;
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
.sre-device-wrap.flip {
  transform: rotate(180deg);
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

.sre-region {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  border-radius: 5px;
  cursor: pointer;
  overflow: hidden;
  transition:
    box-shadow 0.15s,
    filter 0.15s;
}
.sre-region.kind-calendar {
  background: color-mix(in srgb, var(--region-calendar) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--region-calendar) 55%, transparent);
}
.sre-region.kind-photos {
  background: color-mix(in srgb, var(--region-photos) 15%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--region-photos) 55%, transparent);
}
.sre-region.kind-service {
  background: color-mix(in srgb, var(--region-service) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--region-service) 55%, transparent);
}
.sre-region.is-split {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-soft);
}
.sre-region.is-active {
  filter: brightness(1.08);
  box-shadow:
    inset 0 0 0 2px var(--focus),
    0 0 0 2px var(--focus-glow);
  z-index: 2;
}
.sre-region-face {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.3rem;
  text-align: center;
  pointer-events: none;
}
/* The device screen is always a dark, lit surface regardless of the app theme,
   so on-screen text is fixed light rather than theme-driven --ink. */
.sre-region-emoji {
  font-size: 1.2rem;
  filter: saturate(1.05);
}
.sre-region-name {
  font-size: var(--fs-2xs);
  font-weight: 600;
  color: rgba(240, 244, 248, 0.92);
  letter-spacing: 0.01em;
}
.sre-region-size {
  position: absolute;
  right: 5px;
  bottom: 4px;
  font-size: var(--fs-micro);
  color: rgba(240, 244, 248, 0.55);
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
.sre-subsplit {
  display: flex;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
  min-height: 0;
  padding: 2px;
}
.sre-subsplit.dir-row {
  flex-direction: row;
}
.sre-subsplit.dir-column {
  flex-direction: column;
}
.sre-region.sub {
  background: var(--bg-2);
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

.sre-rail {
  border-left: 1px solid var(--line);
  background: var(--bg-0);
  overflow-y: auto;
}

.sre-region:focus-visible,
.sre-tab:focus-visible,
.sre-resizer:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
