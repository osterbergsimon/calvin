<template>
  <Dialog
    :model-value="open"
    size="full"
    :bleed="isPhone"
    label="Clock bar editor"
    close-label="Close clock bar editor"
    scrim-blur
    @close="$emit('close')"
  >
    <template #title>Clock bar</template>

    <div ref="rootEl" class="cbe-root" :class="{ 'is-phone': isPhone }">
      <div class="cbe-context">
        <SegmentedControl
          :model-value="shapeTab"
          :options="shapeOptions"
          aria-label="Bar shape"
          @update:model-value="selectShape"
        />
        <div class="cbe-preview-as">
          <span class="cbe-preview-label">Preview on</span>
          <SelectPill
            :model-value="previewScreenId"
            :options="screenOptions"
            aria-label="Preview on screen"
            @update:model-value="previewScreenId = $event"
          />
          <SegmentedControl
            v-if="previewScreenId === ANY_BROWSER"
            :model-value="anyBrowserOrientation"
            :options="[
              { value: 'landscape', label: 'Landscape' },
              { value: 'portrait', label: 'Portrait' },
            ]"
            aria-label="Preview orientation"
            @update:model-value="anyBrowserOrientation = $event"
          />
          <Tag v-else data-test="orientation-badge">{{ orientationBadge }}</Tag>
        </div>
        <div class="cbe-actions">
          <Button
            variant="secondary"
            size="sm"
            data-test="reset-clock-bar"
            @click="resetConfirm = true"
          >
            Reset to default
          </Button>
          <Button variant="primary" size="sm" data-test="done-clock-bar" @click="$emit('close')">
            Done
          </Button>
        </div>
      </div>

      <div v-if="draft" class="cbe-body">
        <div class="cbe-workarea" @pointerdown="onPointerDown" @keydown="onStageKeydown">
          <div ref="stageEl" class="cbe-stage">
            <div class="cbe-device" :class="`is-${shapeTab}`" :style="deviceStyle">
              <ClockBarHorizontal
                v-if="shapeTab === 'horizontal'"
                class="cbe-bar"
                position="top"
                :show-in-non-kiosk="true"
                :show-in-kiosk="true"
                :enabled="true"
                :design="draft"
                :sample="true"
                :editable="true"
                :selected-part-id="selectedPartId"
                @select-part="selectPart"
              />
              <ClockBarVertical
                v-else
                class="cbe-bar"
                position="left"
                :show-in-non-kiosk="true"
                :show-in-kiosk="true"
                :enabled="true"
                :design="draft"
                :sample="true"
                :editable="true"
                :selected-part-id="selectedPartId"
                @select-part="selectPart"
              />
              <div class="cbe-page">
                <span class="cbe-page-label">Page</span>
              </div>
            </div>

            <div
              v-if="dropMarkerStyle"
              class="cbe-drop-marker"
              data-test="drop-indicator"
              :style="dropMarkerStyle"
            />

            <p class="cbe-hint">
              {{
                draggable
                  ? "Drag a chip between the zones to move it, or onto the shelf to hide it."
                  : "Tap a chip, then use Zone and Order in the panel to move it."
              }}
            </p>
          </div>

          <div class="cbe-shelf" data-shelf :class="{ 'is-drop-target': dropTarget === 'hidden' }">
            <span class="cbe-shelf-title"> Not shown: drag here to hide, or drag up to show </span>
            <div class="cbe-shelf-chips">
              <ClockBarPartChip
                v-for="partId in shelfParts"
                :key="partId"
                :part-id="partId"
                kind="shelf"
                :label="partName(partId)"
                :selected="selectedPartId === partId"
                editable
                @select="selectPart"
              >
                <span class="cbe-chip-label">{{ partName(partId) }}</span>
              </ClockBarPartChip>
              <span v-if="!shelfParts.length" class="cbe-shelf-empty">Every part is shown.</span>
            </div>
          </div>
        </div>

        <aside class="cbe-rail" :aria-label="isPhone ? 'Clock bar settings' : null">
          <div v-if="isPhone" class="cbe-sheet-handle" aria-hidden="true" />
          <div class="cbe-rail-scroll">
            <section v-if="selectedPart" class="cbe-rail-section" data-test="part-panel">
              <div class="cbe-rail-heading">
                <h3 class="cbe-rail-title">{{ partName(selectedPartId) }}</h3>
                <Button
                  v-if="selectedPartId.startsWith('tile:')"
                  variant="link"
                  size="sm"
                  data-test="tile-source"
                  @click="openTileSource(selectedPartId)"
                >
                  Source settings
                </Button>
              </div>

              <SettingRow
                v-if="selectedPartId !== 'status'"
                label="Show"
                description="The same as dragging it to or from the shelf."
              >
                <ToggleSwitch
                  :model-value="partIsShown(selectedPartId)"
                  :aria-label="`Show ${partName(selectedPartId)}`"
                  @update:model-value="togglePartShown(selectedPartId, $event)"
                />
              </SettingRow>

              <SettingRow label="Zone">
                <SelectPill
                  :model-value="partZone(selectedPartId) || ''"
                  :options="zoneOptions"
                  :aria-label="`Zone for ${partName(selectedPartId)}`"
                  @update:model-value="movePartToZone(selectedPartId, $event)"
                />
              </SettingRow>

              <SettingRow label="Order">
                <div class="cbe-order">
                  <Button
                    size="sm"
                    :disabled="!canMoveEarlier"
                    data-test="move-earlier"
                    @click="moveEarlier"
                  >
                    Move earlier
                  </Button>
                  <Button
                    size="sm"
                    :disabled="!canMoveLater"
                    data-test="move-later"
                    @click="moveLater"
                  >
                    Move later
                  </Button>
                </div>
              </SettingRow>

              <template v-if="selectedPartId === 'logo'">
                <SettingRow label="Size" stacked>
                  <SegmentedControl
                    :model-value="partSize('logo')"
                    :options="logoSizeOptions"
                    aria-label="Calvin logo size"
                    @update:model-value="setPartSize('logo', $event)"
                  />
                </SettingRow>
                <InlineNote v-if="partSizeIsCustom('logo')">
                  Custom ({{ partSizePx("logo") }} px)
                  <template #action>
                    <Button variant="link" size="sm" @click="resetPartSize('logo')">
                      Reset to M
                    </Button>
                  </template>
                </InlineNote>
              </template>

              <template v-else-if="selectedPartId === 'room'">
                <SettingRow label="Size" stacked>
                  <SegmentedControl
                    :model-value="partSize('room')"
                    :options="logoSizeOptions"
                    aria-label="Room name size"
                    @update:model-value="setPartSize('room', $event)"
                  />
                </SettingRow>
                <InlineNote v-if="partSizeIsCustom('room')">
                  Custom ({{ partSizePx("room") }} px)
                  <template #action>
                    <Button variant="link" size="sm" @click="resetPartSize('room')">
                      Reset to M
                    </Button>
                  </template>
                </InlineNote>
                <InlineNote>
                  Shows this screen’s Name; nothing on a browser that isn’t a screen.
                </InlineNote>
              </template>

              <template v-else-if="selectedPartId === 'pageDots'">
                <InlineNote>Only shows when the screen has more than one page.</InlineNote>
              </template>

              <template v-else-if="selectedPartId === 'time'">
                <SettingRow label="Size" stacked>
                  <SegmentedControl
                    :model-value="partSize('time')"
                    :options="CLOCK_BAR_SIZE_OPTIONS"
                    aria-label="Time size"
                    @update:model-value="setPartSize('time', $event)"
                  />
                </SettingRow>
                <InlineNote v-if="partSizeIsCustom('time')">
                  Custom ({{ partSizePx("time") }} px)
                  <template #action>
                    <Button variant="link" size="sm" @click="resetPartSize('time')">
                      Reset to M
                    </Button>
                  </template>
                </InlineNote>
                <SettingRow label="Show seconds" description="Costs a redraw every second.">
                  <ToggleSwitch
                    :model-value="state.parts.time.seconds"
                    aria-label="Show seconds"
                    @update:model-value="setPartValue('time', { seconds: $event })"
                  />
                </SettingRow>
                <SettingRow
                  v-if="shapeTab === 'vertical'"
                  label="Style"
                  description="Upright reads along the bar; stacked digits read across it."
                >
                  <SegmentedControl
                    :model-value="state.parts.time.style"
                    :options="[
                      { value: 'upright', label: 'Upright' },
                      { value: 'stacked', label: 'Stacked digits' },
                    ]"
                    aria-label="Time style"
                    @update:model-value="setPartValue('time', { style: $event })"
                  />
                </SettingRow>
              </template>

              <template v-else-if="selectedPartId === 'date'">
                <SettingRow label="Size" stacked>
                  <SegmentedControl
                    :model-value="partSize('date')"
                    :options="logoSizeOptions"
                    aria-label="Date size"
                    @update:model-value="setPartSize('date', $event)"
                  />
                </SettingRow>
                <InlineNote v-if="partSizeIsCustom('date')">
                  Custom ({{ partSizePx("date") }} px)
                  <template #action>
                    <Button variant="link" size="sm" @click="resetPartSize('date')">
                      Reset to M
                    </Button>
                  </template>
                </InlineNote>
                <SettingRow
                  v-if="shapeTab === 'horizontal'"
                  label="Under the time"
                  :description="
                    dateAdjacentToTime
                      ? 'Stacks the date under the time (today’s “Two lines”).'
                      : 'Put Date right after Time to use this.'
                  "
                >
                  <ToggleSwitch
                    :model-value="state.parts.date.underTime"
                    :disabled="!dateAdjacentToTime"
                    aria-label="Under the time"
                    @update:model-value="setPartValue('date', { underTime: $event })"
                  />
                </SettingRow>
                <SettingRow
                  v-else
                  label="Style"
                  description="Line reads along the bar; stacked splits weekday / date / year."
                >
                  <SegmentedControl
                    :model-value="state.parts.date.style"
                    :options="[
                      { value: 'line', label: 'Line' },
                      { value: 'stacked', label: 'Stacked' },
                    ]"
                    aria-label="Date style"
                    @update:model-value="setPartValue('date', { style: $event })"
                  />
                </SettingRow>
              </template>

              <template v-else-if="selectedPartId === 'status'">
                <InlineNote>Always shown, so Settings stays reachable.</InlineNote>
              </template>
            </section>

            <SettingGroup title="Whole bar">
              <SettingRow label="Bar height" stacked>
                <SegmentedControl
                  :model-value="state.barHeight"
                  :options="CLOCK_BAR_BAR_HEIGHT_OPTIONS"
                  aria-label="Bar height"
                  @update:model-value="setBarHeight"
                />
              </SettingRow>
              <InlineNote v-if="barHeightIsCustom">
                Custom ({{ barHeightPx }} px)
                <template #action>
                  <Button variant="link" size="sm" @click="resetBarHeight">Reset to Normal</Button>
                </template>
              </InlineNote>
              <SettingRow label="Tile size" stacked>
                <SegmentedControl
                  :model-value="state.tileSize"
                  :options="logoSizeOptions"
                  aria-label="Tile size"
                  @update:model-value="setTileSize"
                />
              </SettingRow>
              <InlineNote v-if="tileSizeIsCustom">
                Custom ({{ tileSizePx }} px)
                <template #action>
                  <Button variant="link" size="sm" @click="resetTileSize">Reset to M</Button>
                </template>
              </InlineNote>
              <InlineNote>
                Where the bar sits on each page is set in Pages &amp; regions.
                <template #action>
                  <Button variant="link" size="sm" data-test="open-regions" @click="openRegions">
                    Open Pages &amp; regions
                  </Button>
                </template>
              </InlineNote>
            </SettingGroup>
          </div>
        </aside>
      </div>
    </div>

    <ConfirmModal
      :show="resetConfirm"
      title="Reset the clock bar?"
      message="Every part returns to today’s default layout and sizes. You can undo this."
      confirm-text="Reset"
      @confirm="doReset"
      @cancel="resetConfirm = false"
    />

    <div v-if="undoDesign" class="cbe-undo" role="status" data-test="reset-undo">
      Clock bar reset.
      <Button variant="link" size="sm" @click="undoReset">Undo</Button>
    </div>
    <p class="cbe-sr-only" aria-live="polite">{{ liveMessage }}</p>
  </Dialog>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { isPhoneWidth, isWideWidth } from "@/styles/breakpoints.js";
import { screenLabel } from "@/utils/screenLabel";
import { getKioskId } from "@/utils/kioskId";
import {
  CLOCK_BAR_BAR_HEIGHT_OPTIONS,
  CLOCK_BAR_BAR_HEIGHT_TABLE,
  CLOCK_BAR_SIZE_OPTIONS,
  CLOCK_BAR_SIZE_TABLE,
  deriveClockBarDesign,
  expandClockBarZone,
  resolveClockBarDesign,
  toStoredClockBarDesign,
  unplacedClockBarTiles,
} from "@/utils/clockBarDesign";
import { useKiosksStore } from "@/stores/kiosks";
import { useWebServicesStore } from "@/stores/webServices";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import ConfirmModal from "@/components/ui/ConfirmModal.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingGroup from "@/components/ui/SettingGroup.vue";
import Tag from "@/components/ui/Tag.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import ClockBarVertical from "@/components/ClockBarVertical.vue";
import ClockBarPartChip from "@/components/ClockBarPartChip.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  config: { type: Object, required: true },
  shape: {
    type: String,
    default: "horizontal",
    validator: value => ["horizontal", "vertical"].includes(value),
  },
  previewScreenId: { type: String, default: null },
});
const emit = defineEmits(["close", "update:config", "open-regions"]);

const ANY_BROWSER = "__global";
const router = useRouter();
const kiosksStore = useKiosksStore();
const webServicesStore = useWebServicesStore();
const services = computed(() => webServicesStore.services);

const shapeTab = ref(props.shape);
const previewScreenId = ref(props.previewScreenId || getKioskId() || ANY_BROWSER);
const anyBrowserOrientation = ref(props.config.orientation || "landscape");
const selectedPartId = ref("");
const draft = ref(null);
const resetConfirm = ref(false);
const undoDesign = ref(null);
const liveMessage = ref("");
const rootEl = ref(null);
const stageEl = ref(null);

const shapeOptions = [
  { value: "horizontal", label: "Top / bottom bar" },
  { value: "vertical", label: "Side bar" },
];

const screenOptions = computed(() => {
  const options = [
    { value: ANY_BROWSER, label: "Browsers & new screens" },
    ...kiosksStore.kiosks.map(kiosk => ({ value: kiosk.id, label: screenLabel(kiosk) })),
  ];
  if (
    previewScreenId.value !== ANY_BROWSER &&
    !options.some(option => option.value === previewScreenId.value)
  ) {
    options.push({ value: previewScreenId.value, label: previewScreenId.value });
  }
  return options;
});

const previewKiosk = computed(
  () => kiosksStore.kiosks.find(kiosk => kiosk.id === previewScreenId.value) || null
);
const previewOrientation = computed(() =>
  previewScreenId.value === ANY_BROWSER
    ? anyBrowserOrientation.value
    : previewKiosk.value?.overrides?.orientation || props.config.orientation || "landscape"
);
const previewViewport = computed(() => {
  const viewport = previewKiosk.value?.viewport;
  return viewport?.w > 0 && viewport?.h > 0 ? viewport : null;
});
const deviceRatio = computed(() => {
  if (previewViewport.value) return previewViewport.value.w / previewViewport.value.h;
  return previewOrientation.value === "portrait" ? 9 / 16 : 16 / 9;
});
const deviceStyle = computed(() => ({
  aspectRatio: String(deviceRatio.value),
  maxWidth: `calc(46vh * ${deviceRatio.value})`,
}));
const orientationBadge = computed(() =>
  [
    previewOrientation.value === "portrait" ? "Portrait" : "Landscape",
    previewViewport.value ? `${previewViewport.value.w}×${previewViewport.value.h}` : "",
  ]
    .filter(Boolean)
    .join(" · ")
);

const state = computed(() => draft.value?.[shapeTab.value] || null);
const zoneKeys = computed(() =>
  shapeTab.value === "horizontal" ? ["left", "center", "right"] : ["top", "middle", "bottom"]
);
const zoneNames = computed(() =>
  shapeTab.value === "horizontal"
    ? { left: "Left", center: "Centre", right: "Right" }
    : { top: "Top", middle: "Middle", bottom: "Bottom" }
);
const zoneOptions = computed(() =>
  zoneKeys.value.map(zone => ({ value: zone, label: zoneNames.value[zone] }))
);

const clone = value => JSON.parse(JSON.stringify(value));

function syncDraft() {
  draft.value = clone(resolveClockBarDesign(props.config, services.value));
}

function refreshTiles() {
  if (!draft.value) return;
  draft.value = clone(
    resolveClockBarDesign({ clockBarDesign: toStoredClockBarDesign(draft.value) }, services.value)
  );
}

watch(
  () => props.open,
  open => {
    if (!open) return;
    shapeTab.value = props.shape;
    previewScreenId.value = props.previewScreenId || getKioskId() || ANY_BROWSER;
    anyBrowserOrientation.value = props.config.orientation || "landscape";
    selectedPartId.value = "";
    syncDraft();
  },
  { immediate: true }
);

onMounted(async () => {
  if (!kiosksStore.kiosks.length) {
    try {
      await kiosksStore.loadKiosks();
    } catch {
      // Preview-on falls back to the browser option.
    }
  }
  if (!services.value.length) {
    try {
      await webServicesStore.fetchServices();
    } catch {
      // The editor still arranges the core parts.
    }
    refreshTiles();
  }
  watchMedia("(any-pointer: coarse)", coarsePointer);
  window.addEventListener("resize", onResize);
});

/* --- viewport class (wide drag, phone sheet) ----------------------------- */
const coarsePointer = ref(false);
const viewportWidth = ref(typeof window === "undefined" ? 1280 : window.innerWidth);
const mediaCleanups = [];
function watchMedia(query, target) {
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
}
const onResize = () => {
  viewportWidth.value = window.innerWidth;
};
const isPhone = computed(() => isPhoneWidth(viewportWidth.value));
const draggable = computed(() => !coarsePointer.value && isWideWidth(viewportWidth.value));

onUnmounted(() => {
  window.removeEventListener("resize", onResize);
  mediaCleanups.forEach(cleanup => cleanup());
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
  if (undoTimer) clearTimeout(undoTimer);
});

function selectShape(next) {
  shapeTab.value = next;
  selectedPartId.value = "";
  liveMessage.value = `Editing the ${next === "horizontal" ? "top / bottom" : "side"} bar.`;
}

/* --- part names + positions --------------------------------------------- */
const PART_LABELS = {
  logo: "Calvin logo",
  room: "Room name",
  pageDots: "Page dots",
  time: "Time",
  date: "Date",
  status: "Status & menu",
};

function partName(partId) {
  if (!partId) return "";
  if (partId.startsWith("tile:")) {
    const id = partId.slice("tile:".length);
    return services.value.find(service => service.id === id)?.name || "Plugin tile";
  }
  return PART_LABELS[partId] || partId;
}

function partZone(partId) {
  if (!partId || !draft.value) return null;
  for (const zone of zoneKeys.value) {
    if (expandClockBarZone(draft.value, shapeTab.value, zone).includes(partId)) return zone;
  }
  return null;
}
function partIsShown(partId) {
  return partZone(partId) !== null;
}
const selectedPart = computed(() =>
  draft.value && selectedPartId.value ? selectedPartId.value : ""
);

const shelfParts = computed(() => {
  if (!draft.value) return [];
  const placed = new Set(
    zoneKeys.value.flatMap(zone => expandClockBarZone(draft.value, shapeTab.value, zone))
  );
  const hidden = draft.value[shapeTab.value].hidden || [];
  const result = [...hidden];
  for (const part of ["logo", "room", "pageDots", "time", "date"]) {
    if (!placed.has(part) && !result.includes(part)) result.push(part);
  }
  for (const tile of draft.value.tileIds || []) {
    if (!placed.has(tile) && !result.includes(tile)) result.push(tile);
  }
  return [...new Set(result)];
});

function selectPart(partId) {
  selectedPartId.value = partId;
  liveMessage.value = `${partName(partId)} selected.`;
}

/* --- writes -------------------------------------------------------------- */
function commit(nextDraft) {
  const resolved = resolveClockBarDesign(
    { clockBarDesign: toStoredClockBarDesign(nextDraft) },
    services.value
  );
  draft.value = clone(resolved);
  emit("update:config", { clockBarDesign: toStoredClockBarDesign(resolved) });
}

function setPartValue(partId, patch) {
  const next = clone(draft.value);
  next[shapeTab.value].parts[partId] = {
    ...next[shapeTab.value].parts[partId],
    ...patch,
  };
  commit(next);
}

const partSize = partId => state.value?.parts?.[partId]?.size ?? "m";
const partSizeIsCustom = partId => typeof partSize(partId) === "number";
const partSizePx = partId => {
  const value = partSize(partId);
  if (typeof value === "number") return value;
  return CLOCK_BAR_SIZE_TABLE[shapeTab.value]?.[partId]?.[value] ?? 16;
};
const logoSizeOptions = CLOCK_BAR_SIZE_OPTIONS.filter(option => option.value !== "xl");

function setPartSize(partId, value) {
  setPartValue(partId, { size: value });
}
function nearestStep(partId, px, table = CLOCK_BAR_SIZE_TABLE[shapeTab.value]?.[partId]) {
  const entries = Object.entries(table || {});
  return entries.reduce(
    (best, [step, value]) => (Math.abs(value - px) < Math.abs(table[best] - px) ? step : best),
    entries[0]?.[0] || "m"
  );
}
function resetPartSize(partId) {
  setPartSize(partId, nearestStep(partId, partSizePx(partId)));
}

const barHeightIsCustom = computed(() => typeof state.value?.barHeight === "number");
const barHeightPx = computed(() => {
  const value = state.value?.barHeight;
  if (typeof value === "number") return value;
  return CLOCK_BAR_BAR_HEIGHT_TABLE[shapeTab.value]?.[value] ?? 8;
});
function setBarHeight(value) {
  const next = clone(draft.value);
  next[shapeTab.value].barHeight = value;
  commit(next);
}
function resetBarHeight() {
  const table = CLOCK_BAR_BAR_HEIGHT_TABLE[shapeTab.value];
  setBarHeight(nearestStepValue(table, barHeightPx.value, "normal"));
}

const tileSizeIsCustom = computed(() => typeof state.value?.tileSize === "number");
const tileSizePx = computed(() => {
  const value = state.value?.tileSize;
  if (typeof value === "number") return value;
  return CLOCK_BAR_SIZE_TABLE[shapeTab.value]?.tile?.[value] ?? 16;
});
function setTileSize(value) {
  const next = clone(draft.value);
  next[shapeTab.value].tileSize = value;
  commit(next);
}
function resetTileSize() {
  setTileSize(nearestStepValue(CLOCK_BAR_SIZE_TABLE[shapeTab.value]?.tile, tileSizePx.value, "m"));
}
function nearestStepValue(table, px, fallback) {
  const entries = Object.entries(table || {});
  if (!entries.length) return fallback;
  return entries.reduce(
    (best, [step, value]) => (Math.abs(value - px) < Math.abs(table[best] - px) ? step : best),
    entries[0][0]
  );
}

/* --- placement ----------------------------------------------------------- */
const DEFAULT_ZONE = {
  horizontal: {
    logo: "left",
    room: "left",
    pageDots: "left",
    time: "center",
    date: "center",
  },
  vertical: { logo: "top", room: "top", pageDots: "top", time: "middle", date: "middle" },
};
const defaultZoneFor = partId => {
  if (partId.startsWith("tile:")) return shapeTab.value === "horizontal" ? "right" : "bottom";
  return DEFAULT_ZONE[shapeTab.value][partId] || zoneKeys.value[0];
};

function removePart(next, partId) {
  const st = next[shapeTab.value];
  for (const zone of zoneKeys.value) {
    st.zones[zone] = st.zones[zone].filter(id => id !== partId);
  }
  st.hidden = st.hidden.filter(id => id !== partId);
}

function rawInsertIndex(st, zone, expandedIndex) {
  const raw = st.zones[zone];
  const unplaced = unplacedClockBarTiles(
    { ...draft.value, [shapeTab.value]: st },
    shapeTab.value
  ).length;
  let count = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const id = raw[index];
    const size = id === "tiles" ? unplaced : 1;
    if (expandedIndex <= count) return index;
    if (id === "tiles" && expandedIndex < count + size) return index + 1;
    count += size;
  }
  return raw.length;
}

function currentExpandedIndex(st, partId) {
  for (const zone of zoneKeys.value) {
    const ids = expandClockBarZone({ ...draft.value, [shapeTab.value]: st }, shapeTab.value, zone);
    const index = ids.indexOf(partId);
    if (index >= 0) return { zone, index };
  }
  return null;
}

function movePart(partId, zone, expandedIndex) {
  if (!draft.value) return;
  const next = clone(draft.value);
  const st = next[shapeTab.value];
  const previous = currentExpandedIndex(st, partId);
  removePart(next, partId);
  let index = expandedIndex;
  if (previous && previous.zone === zone && previous.index < expandedIndex) index -= 1;
  const rawIndex = rawInsertIndex(st, zone, Math.max(0, index));
  st.zones[zone].splice(rawIndex, 0, partId);
  commit(next);
  liveMessage.value = `${partName(partId)} moved to ${zoneNames.value[zone]}, ${
    Math.max(0, index) + 1
  }.`;
}

function hidePart(partId) {
  if (partId === "status") {
    liveMessage.value = "Status & menu is always shown, so Settings stays reachable.";
    return;
  }
  const next = clone(draft.value);
  removePart(next, partId);
  next[shapeTab.value].hidden.push(partId);
  commit(next);
  liveMessage.value = `${partName(partId)} moved to Not shown.`;
}

function showPart(partId) {
  const zone = defaultZoneFor(partId);
  const ids = expandClockBarZone(draft.value, shapeTab.value, zone).filter(id => id !== partId);
  movePart(partId, zone, ids.length);
}

function togglePartShown(partId, shown) {
  if (shown) showPart(partId);
  else hidePart(partId);
}
function movePartToZone(partId, zone) {
  if (!zone) return;
  const ids = expandClockBarZone(draft.value, shapeTab.value, zone).filter(id => id !== partId);
  movePart(partId, zone, ids.length);
}

const orderInfo = computed(() => {
  if (!selectedPartId.value || !draft.value) return null;
  const zone = partZone(selectedPartId.value);
  if (!zone) return null;
  const ids = expandClockBarZone(draft.value, shapeTab.value, zone);
  return { zone, index: ids.indexOf(selectedPartId.value), count: ids.length };
});
const canMoveEarlier = computed(() => Boolean(orderInfo.value && orderInfo.value.index > 0));
const canMoveLater = computed(() =>
  Boolean(orderInfo.value && orderInfo.value.index < orderInfo.value.count - 1)
);
function moveEarlier() {
  if (orderInfo.value)
    movePart(selectedPartId.value, orderInfo.value.zone, orderInfo.value.index - 1);
}
function moveLater() {
  if (!orderInfo.value) return;
  const { zone, index, count } = orderInfo.value;
  // A one-step-later move lands after the next part (index + 2 in the list
  // before this part is removed).
  movePart(selectedPartId.value, zone, index + 2 <= count ? index + 2 : index + 1);
}

const dateAdjacentToTime = computed(() => {
  if (!draft.value) return false;
  return zoneKeys.value.some(zone => {
    const ids = expandClockBarZone(draft.value, shapeTab.value, zone);
    const index = ids.indexOf("date");
    return index > 0 && ids[index - 1] === "time";
  });
});

function moveByArrow(partId, direction) {
  const zone = partZone(partId);
  if (!zone) {
    // On the shelf: → / ↓ returns it to its home zone, ← / ↑ keeps it hid.
    if (direction > 0) showPart(partId);
    return;
  }
  const ids = expandClockBarZone(draft.value, shapeTab.value, zone);
  const index = ids.indexOf(partId);
  const zoneIndex = zoneKeys.value.indexOf(zone);
  if (direction < 0 && index === 0) {
    const previous = zoneKeys.value[zoneIndex - 1];
    if (previous) {
      const target = expandClockBarZone(draft.value, shapeTab.value, previous).length;
      movePart(partId, previous, target);
    }
    return;
  }
  if (direction > 0 && index === ids.length - 1) {
    const nextZone = zoneKeys.value[zoneIndex + 1];
    if (nextZone) movePart(partId, nextZone, 0);
    return;
  }
  movePart(partId, zone, direction > 0 ? index + 2 : index - 1);
}

function onStageKeydown(event) {
  const chip = event.target?.closest?.("[data-part-id]");
  if (!chip) return;
  const partId = chip.dataset.partId;
  if (!partId) return;
  const horizontal = shapeTab.value === "horizontal";
  const forward = horizontal ? "ArrowRight" : "ArrowDown";
  const backward = horizontal ? "ArrowLeft" : "ArrowUp";
  if (event.key === forward) {
    event.preventDefault();
    moveByArrow(partId, 1);
  } else if (event.key === backward) {
    event.preventDefault();
    moveByArrow(partId, -1);
  }
}

/* --- pointer drag -------------------------------------------------------- */
let dragState = null;
const dropTarget = ref(null);
const dropMarkerStyle = ref(null);

function onPointerDown(event) {
  if (!props.open) return;
  if (event.button !== undefined && event.button !== 0) return;
  const chip = event.target?.closest?.("[data-part-id]");
  if (!chip) return;
  const partId = chip.dataset.partId;
  if (!partId) return;
  selectPart(partId);
  if (!draggable.value) return;
  dragState = {
    partId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
}

function chipRects(zoneEl) {
  return [...zoneEl.querySelectorAll("[data-part-id]")].filter(
    chip => chip.dataset.partId && chip.dataset.partId !== "tiles"
  );
}

function markerFor(zoneEl, index) {
  const stage = stageEl.value?.getBoundingClientRect();
  if (!stage) return null;
  const zoneRect = zoneEl.getBoundingClientRect();
  const chips = chipRects(zoneEl);
  const horizontal = shapeTab.value === "horizontal";
  if (horizontal) {
    let left;
    if (!chips.length) left = zoneRect.left + 4;
    else if (index <= 0) left = chips[0].getBoundingClientRect().left - 2;
    else if (index >= chips.length)
      left = chips[chips.length - 1].getBoundingClientRect().right + 1;
    else {
      const before = chips[index - 1].getBoundingClientRect();
      const after = chips[index].getBoundingClientRect();
      left = (before.right + after.left) / 2;
    }
    return {
      left: `${left - stage.left}px`,
      top: `${zoneRect.top - stage.top}px`,
      height: `${zoneRect.height}px`,
      width: "2px",
    };
  }
  let top;
  if (!chips.length) top = zoneRect.top + 4;
  else if (index <= 0) top = chips[0].getBoundingClientRect().top - 2;
  else if (index >= chips.length) top = chips[chips.length - 1].getBoundingClientRect().bottom + 1;
  else {
    const before = chips[index - 1].getBoundingClientRect();
    const after = chips[index].getBoundingClientRect();
    top = (before.bottom + after.top) / 2;
  }
  return {
    top: `${top - stage.top}px`,
    left: `${zoneRect.left - stage.left}px`,
    width: `${zoneRect.width}px`,
    height: "2px",
  };
}

function onPointerMove(event) {
  if (!dragState) return;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (!dragState.moved && distance < 6) return;
  dragState.moved = true;
  event.preventDefault();
  const elements = document.elementsFromPoint?.(event.clientX, event.clientY) || [];
  const zoneEl = elements.find(element => element.matches?.(".clock-bar-zone[data-zone]"));
  const shelfEl = elements.find(element => element.matches?.("[data-shelf]"));
  if (zoneEl) {
    const zone = zoneEl.dataset.zone;
    const chips = chipRects(zoneEl);
    const horizontal = shapeTab.value === "horizontal";
    let index = 0;
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect();
      const center = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      const pointer = horizontal ? event.clientX : event.clientY;
      if (pointer > center) index += 1;
    }
    dropTarget.value = zone;
    dropMarkerStyle.value = markerFor(zoneEl, index);
    dragState.drop = { type: "zone", zone, index };
  } else if (shelfEl) {
    dropTarget.value = "hidden";
    dropMarkerStyle.value = null;
    dragState.drop = { type: "hidden" };
  } else {
    dropTarget.value = null;
    dropMarkerStyle.value = null;
    dragState.drop = null;
  }
}

function onPointerUp() {
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
  const drag = dragState;
  dragState = null;
  dropTarget.value = null;
  dropMarkerStyle.value = null;
  if (!drag?.moved || !drag.drop) return;
  if (drag.drop.type === "hidden") hidePart(drag.partId);
  else movePart(drag.partId, drag.drop.zone, drag.drop.index);
}

/* --- reset / undo -------------------------------------------------------- */
let undoTimer = null;
function doReset() {
  const previous = toStoredClockBarDesign(draft.value);
  const derived = deriveClockBarDesign(props.config, services.value);
  const next = resolveClockBarDesign(
    { clockBarDesign: toStoredClockBarDesign(derived) },
    services.value
  );
  draft.value = clone(next);
  emit("update:config", { clockBarDesign: toStoredClockBarDesign(next) });
  resetConfirm.value = false;
  undoDesign.value = previous;
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoDesign.value = null;
  }, 8000);
  liveMessage.value = "Clock bar reset to today’s default.";
}
function undoReset() {
  if (!undoDesign.value) return;
  const previous = undoDesign.value;
  const next = resolveClockBarDesign({ clockBarDesign: previous }, services.value);
  draft.value = clone(next);
  emit("update:config", { clockBarDesign: toStoredClockBarDesign(next) });
  undoDesign.value = null;
  if (undoTimer) clearTimeout(undoTimer);
  liveMessage.value = "Clock bar reset undone.";
}

function openTileSource(partId) {
  const id = partId.slice("tile:".length);
  emit("close");
  router.push({ path: "/settings", query: { setting: "content-clock-bar", source: id } });
}
function openRegions() {
  emit("open-regions");
}
</script>

<style scoped>
.cbe-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-0);
  color: var(--ink);
}

.cbe-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline);
  padding: var(--gap-inline) var(--panel-pad-x);
  border-bottom: 1px solid var(--line);
  background: var(--bg-1);
}

.cbe-preview-as {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
  min-width: 0;
}

.cbe-preview-label {
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-3);
}

.cbe-actions {
  display: flex;
  gap: var(--gap-inline);
  margin-left: auto;
}

.cbe-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  min-height: 0;
  flex: 1 1 auto;
}

.cbe-workarea {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--gap-inline);
}

.cbe-stage {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  min-height: 0;
}

.cbe-device {
  display: flex;
  width: 100%;
  min-height: 10rem;
  max-height: 46vh;
  overflow: hidden;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-raised, 0 8px 24px color-mix(in srgb, var(--ink) 10%, transparent));
}

.cbe-device.is-horizontal {
  flex-direction: column;
}

.cbe-device.is-vertical {
  flex-direction: row;
}

.cbe-bar {
  flex: 0 0 auto;
}

.cbe-page {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}

.cbe-page-label {
  font-family: var(--font-ui);
  font-size: var(--text-caption);
  color: var(--ink-3);
  letter-spacing: 0.08em;
}

.cbe-hint {
  margin: var(--gap-inline) 0 0;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-3);
  text-align: center;
}

.cbe-drop-marker {
  position: absolute;
  z-index: var(--z-raised);
  background: var(--focus);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 25%, transparent);
  pointer-events: none;
}

.cbe-shelf {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: var(--gap-inline);
  padding: var(--gap-inline);
  border: 1px dashed var(--line);
  border-radius: var(--radius-card);
}

.cbe-shelf.is-drop-target {
  border-color: var(--focus);
  background: color-mix(in srgb, var(--focus) 8%, transparent);
}

.cbe-shelf-title {
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-3);
}

.cbe-shelf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-inline);
  min-height: 2.25rem;
  align-items: center;
}

.cbe-shelf-empty {
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-3);
}

.cbe-chip-label {
  padding: 0.25rem 0.5rem;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  white-space: nowrap;
}

.cbe-rail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--line);
  background: var(--bg-1);
}

.cbe-rail-scroll {
  min-height: 0;
  overflow: auto;
}

.cbe-rail-section {
  padding-bottom: var(--gap-inline);
  border-bottom: 1px solid var(--line-soft);
}

.cbe-rail-heading {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
  padding: var(--panel-pad-y) var(--panel-pad-x) 0;
}

.cbe-rail-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.cbe-order {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-inline);
}

.cbe-sheet-handle {
  flex: 0 0 auto;
  width: 2.5rem;
  height: 0.25rem;
  margin: var(--gap-2) auto 0;
  border-radius: var(--radius-pill);
  background: var(--line);
}

.cbe-undo {
  position: sticky;
  bottom: var(--gap-inline);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--gap-inline);
  margin: var(--gap-inline) auto 0;
  padding: var(--gap-inline) var(--gap-3);
  width: fit-content;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-raised, 0 8px 24px color-mix(in srgb, var(--ink) 10%, transparent));
}

.cbe-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Phone/compact: the rail is a bottom sheet, the stage keeps the width. */
.cbe-root.is-phone .cbe-body {
  display: flex;
  flex-direction: column;
}

.cbe-root.is-phone .cbe-context {
  padding-inline: var(--gap-inline);
}

.cbe-root.is-phone .cbe-actions {
  margin-left: 0;
}

.cbe-root.is-phone .cbe-workarea {
  flex: 1 1 auto;
}

.cbe-root.is-phone .cbe-device {
  max-height: none;
}

.cbe-root.is-phone .cbe-preview-label,
.cbe-root.is-phone .cbe-hint {
  display: none;
}

.cbe-root.is-phone .cbe-rail {
  flex: 0 0 auto;
  max-height: 36vh;
  border-left: 0;
  border-top: 1px solid var(--line);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: 0 -8px 24px color-mix(in srgb, var(--ink) 12%, transparent);
}

.cbe-root.is-phone .cbe-rail-scroll {
  padding-bottom: env(safe-area-inset-bottom, 0);
}
</style>
