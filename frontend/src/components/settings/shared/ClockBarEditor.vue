<template>
  <Dialog
    :model-value="open"
    size="full"
    :bleed="sizeClass !== 'wide'"
    label="Clock bar"
    close-label="Close clock bar editor"
    scrim-blur
    @close="$emit('close')"
  >
    <template #title>Clock bar</template>
    <template v-if="sizeClass === 'wide'" #subtitle>
      Drag the parts, or use the inspector · every change saves live
    </template>

    <div
      ref="modalEl"
      class="cbe-root"
      :class="[`size-${sizeClass}`, { 'is-coarse': coarsePointer }]"
    >
      <div class="cbe-context">
        <SegmentedControl
          :model-value="shape"
          :options="[
            { value: 'horizontal', label: 'Top / bottom bar' },
            { value: 'vertical', label: 'Side bar' },
          ]"
          aria-label="Bar shape"
          @update:model-value="setShape"
        />
        <div class="cbe-preview-as">
          <span class="cbe-preview-label">Previewing on</span>
          <SelectPill
            :model-value="previewScreenId"
            :options="screenOptions"
            aria-label="Preview on screen"
            @update:model-value="setPreviewScreen"
          />
          <SegmentedControl
            v-if="previewScreenId === ANY_BROWSER"
            :model-value="anyBrowserOrientation"
            :options="[
              { value: 'landscape', label: 'Landscape' },
              { value: 'portrait', label: 'Portrait' },
            ]"
            aria-label="Preview orientation"
            @update:model-value="value => (anyBrowserOrientation = value)"
          />
          <Tag v-else>{{ orientationBadge }}</Tag>
        </div>
        <div class="cbe-context-actions">
          <Button size="sm" data-test="clock-bar-reset" @click="confirmReset = true">
            Reset to default
          </Button>
          <Button variant="primary" size="sm" data-test="clock-bar-done" @click="$emit('close')">
            Done
          </Button>
        </div>
      </div>

      <div class="cbe-body" :class="{ 'is-sheet-open': isPhone && sheetOpen }">
        <div
          ref="stageEl"
          class="cbe-stage"
          :class="[
            dragState?.dragging ? 'is-dragging' : '',
            dropTarget?.zone ? `drop-${dropTarget.zone}` : '',
          ]"
          @pointerdown="startDrag"
        >
          <div class="cbe-legend" aria-hidden="true">
            <span v-for="zoneKey in zoneKeys" :key="zoneKey" class="cbe-legend-item">
              {{ zoneLabels[zoneKey] }}
            </span>
          </div>

          <div class="cbe-device" :class="`is-${orientation}`">
            <div class="cbe-page">
              <ClockBarHorizontal
                v-if="shape === 'horizontal'"
                position="top"
                :enabled="true"
                :always-show="true"
                :design="resolved.horizontal"
                :sample="true"
                :editable="true"
                :selected-part="selectedPart"
                @select-part="selectPart"
                @move-part="onMovePart"
              />
              <ClockBarVertical
                v-else
                position="left"
                :enabled="true"
                :always-show="true"
                :design="resolved.vertical"
                :sample="true"
                :editable="true"
                :selected-part="selectedPart"
                @select-part="selectPart"
                @move-part="onMovePart"
              />
              <div class="cbe-page-body" aria-hidden="true" />
            </div>
          </div>

          <div
            class="cbe-shelf"
            :class="{ 'is-drop-target': dropTarget?.zone === 'hidden' }"
            data-drop-zone="hidden"
          >
            <span class="cbe-shelf-title"> Not shown: drag here to hide, or drag up to show </span>
            <div class="cbe-shelf-chips">
              <button
                v-for="partId in hiddenParts"
                :key="partId"
                type="button"
                class="cbe-shelf-chip"
                :class="{ 'is-selected': selectedPart === partId }"
                :data-part-id="partId"
                data-zone="hidden"
                @click.stop="selectPart(partId)"
              >
                {{ labelFor(partId) }}
              </button>
              <span v-if="!hiddenParts.length" class="cbe-shelf-empty">
                Every part is on the bar.
              </span>
            </div>
            <span
              v-if="dropTarget?.zone === 'hidden' && selectedPart === 'status'"
              class="cbe-shelf-why"
            >
              Status &amp; menu is always shown, so Settings stays reachable.
            </span>
          </div>

          <div
            v-if="dropLine"
            class="cbe-drop-line"
            :class="{ vertical: dropLine.vertical }"
            :style="dropLineStyle"
          />

          <p class="cbe-sr-only" data-test="clock-bar-announcer" aria-live="polite">
            {{ announcement }}
          </p>

          <div v-if="undoState" class="cbe-toast" role="status" aria-live="polite">
            <span>Reset to the default clock bar.</span>
            <Button variant="link" size="sm" data-test="clock-bar-undo" @click="undoReset">
              Undo
            </Button>
          </div>
        </div>

        <aside
          class="cbe-rail"
          :class="{
            'is-sheet': isPhone,
            'is-open': isPhone && sheetOpen,
            'no-motion': isPhone && reduceMotion,
          }"
          :role="isPhone ? 'region' : null"
          :aria-label="isPhone ? 'Clock bar inspector' : null"
        >
          <div
            v-if="isPhone"
            class="cbe-sheet-peek"
            data-test="clock-bar-sheet-peek"
            @click="sheetOpen = !sheetOpen"
          >
            <span class="cbe-sheet-handle" aria-hidden="true" />
            <span class="cbe-sheet-label">{{ selectedLabel || "Whole bar" }}</span>
            <span class="cbe-sheet-chevron" aria-hidden="true">{{ sheetOpen ? "⌄" : "⌃" }}</span>
          </div>

          <div class="cbe-rail-scroll">
            <template v-if="selectedPart">
              <h3 class="cbe-rail-title">{{ selectedLabel }}</h3>

              <SettingRow
                v-if="selectedPart !== 'status'"
                label="Show"
                description="The same as dragging it on or off the bar."
              >
                <ToggleSwitch
                  :model-value="selectedVisible"
                  :aria-label="`Show ${selectedLabel}`"
                  @update:model-value="setShown"
                />
              </SettingRow>

              <SettingRow label="Zone">
                <SelectPill
                  :model-value="selectedZone"
                  :options="zoneOptions"
                  aria-label="Zone"
                  @update:model-value="setZone"
                />
              </SettingRow>

              <SettingRow label="Order">
                <div class="cbe-order">
                  <Button
                    size="sm"
                    :disabled="!canMoveEarlier"
                    :aria-label="`Move ${selectedLabel} earlier`"
                    @click="moveSelected(-1)"
                  >
                    Move earlier
                  </Button>
                  <Button
                    size="sm"
                    :disabled="!canMoveLater"
                    :aria-label="`Move ${selectedLabel} later`"
                    @click="moveSelected(1)"
                  >
                    Move later
                  </Button>
                </div>
              </SettingRow>

              <SettingRow v-if="partHasSize" :label="`Size${sizeCustomLabel}`" stacked>
                <template #description v-if="sizeCustom">
                  <InlineNote>
                    This size was set before the editor. Pick a step to leave Custom.
                  </InlineNote>
                </template>
                <div class="cbe-size-row">
                  <SegmentedControl
                    :model-value="sizeCustom ? '' : selectedPartData.size"
                    :options="sizeOptions"
                    :aria-label="`${selectedLabel} size`"
                    @update:model-value="setPartSize"
                  />
                  <Button v-if="sizeCustom" size="sm" @click="resetPartSize">
                    Use {{ nearestStepLabel }}
                  </Button>
                </div>
              </SettingRow>

              <template v-if="selectedPart === 'logo'">
                <InlineNote class="cbe-note">M matches today's wordmark.</InlineNote>
              </template>

              <template v-else-if="selectedPart === 'room'">
                <InlineNote class="cbe-note">
                  Shows this screen's Name; nothing on a browser that isn't a screen.
                </InlineNote>
              </template>

              <template v-else-if="selectedPart === 'pageDots'">
                <InlineNote class="cbe-note">
                  Only shows when the screen has more than one page.
                </InlineNote>
                <InlineNote class="cbe-note">Hidden on phones.</InlineNote>
              </template>

              <template v-else-if="selectedPart === 'time'">
                <SettingRow label="Show seconds" description="Costs a redraw every second.">
                  <ToggleSwitch
                    :model-value="!!selectedPartData.seconds"
                    aria-label="Show seconds"
                    @update:model-value="value => setPartOption('seconds', value)"
                  />
                </SettingRow>
                <SettingRow v-if="shape === 'vertical'" label="Style">
                  <SegmentedControl
                    :model-value="selectedPartData.style || 'upright'"
                    :options="[
                      { value: 'upright', label: 'Upright' },
                      { value: 'stacked', label: 'Stacked digits' },
                    ]"
                    aria-label="Time style"
                    @update:model-value="value => setPartOption('style', value)"
                  />
                </SettingRow>
              </template>

              <template v-else-if="selectedPart === 'date'">
                <SettingRow
                  v-if="shape === 'horizontal'"
                  label="Under the time"
                  description="Was “Two lines”. Only while Date directly follows Time."
                >
                  <ToggleSwitch
                    :model-value="!!selectedPartData.underTime"
                    :disabled="!dateAdjacent"
                    aria-label="Under the time"
                    @update:model-value="value => setPartOption('underTime', value)"
                  />
                </SettingRow>
                <SettingRow v-else label="Style">
                  <SegmentedControl
                    :model-value="selectedPartData.style || 'line'"
                    :options="[
                      { value: 'line', label: 'Line' },
                      { value: 'stacked', label: 'Stacked' },
                    ]"
                    aria-label="Date style"
                    @update:model-value="value => setPartOption('style', value)"
                  />
                </SettingRow>
                <InlineNote v-if="shape === 'horizontal' && !dateAdjacent" class="cbe-note">
                  Put Date right after Time to use Under the time.
                </InlineNote>
                <InlineNote class="cbe-note">Fixed size between regions.</InlineNote>
              </template>

              <template v-else-if="isTile(selectedPart)">
                <SettingRow
                  label="Source settings"
                  description="What this tile shows is set by its plugin."
                >
                  <Button size="sm" @click="openTileSource">Open source settings</Button>
                </SettingRow>
              </template>

              <template v-else-if="selectedPart === 'status'">
                <InlineNote class="cbe-note">
                  Always shown, so Settings stays reachable. Uses the compact cluster on the side
                  bar, wherever it is placed.
                </InlineNote>
              </template>
            </template>

            <h3 class="cbe-rail-title">{{ selectedPart ? "Whole bar" : "Clock bar" }}</h3>

            <SettingRow :label="`Bar height${barHeightCustomLabel}`" stacked>
              <template #description v-if="barHeightCustom">
                <InlineNote>
                  This padding was set before the editor. Pick a step to leave Custom.
                </InlineNote>
              </template>
              <div class="cbe-size-row">
                <SegmentedControl
                  :model-value="barHeightCustom ? '' : shapeDesign.barHeight"
                  :options="[
                    { value: 'slim', label: 'Slim' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'roomy', label: 'Roomy' },
                  ]"
                  aria-label="Bar height"
                  @update:model-value="v => setBarOption('barHeight', v)"
                />
                <Button v-if="barHeightCustom" size="sm" @click="resetBarHeight">
                  Use {{ nearestBarHeightLabel }}
                </Button>
              </div>
            </SettingRow>

            <SettingRow :label="`Tile size${tileSizeCustomLabel}`" stacked>
              <div class="cbe-size-row">
                <SegmentedControl
                  :model-value="tileSizeCustom ? '' : shapeDesign.tileSize"
                  :options="[
                    { value: 's', label: 'S' },
                    { value: 'm', label: 'M' },
                    { value: 'l', label: 'L' },
                  ]"
                  aria-label="Tile size"
                  @update:model-value="v => setBarOption('tileSize', v)"
                />
                <Button v-if="tileSizeCustom" size="sm" @click="resetTileSize">
                  Use {{ nearestTileSizeLabel }}
                </Button>
              </div>
            </SettingRow>

            <InlineNote class="cbe-note">
              Where the bar sits on each page is set in Pages &amp; regions.
              <template #action>
                <Button variant="link" size="sm" @click="openPagesRegions">
                  Open Pages &amp; regions
                </Button>
              </template>
            </InlineNote>
          </div>
        </aside>
      </div>

      <ConfirmModal
        :show="confirmReset"
        title="Reset the clock bar?"
        message="Both bar shapes go back to the default design. Your saved setup can be undone right after."
        confirm-text="Reset"
        danger
        @confirm="resetToDefault"
        @cancel="confirmReset = false"
      />
    </div>
  </Dialog>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useKiosksStore } from "@/stores/kiosks";
import { useWebServicesStore } from "@/stores/webServices";
import { getKioskId } from "@/utils/kioskId";
import { screenLabel } from "@/utils/screenLabel";
import { useEditorLayout } from "@/composables/useEditorLayout";
import Button from "@/components/ui/Button.vue";
import ConfirmModal from "@/components/ui/ConfirmModal.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import Tag from "@/components/ui/Tag.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import ClockBarVertical from "@/components/ClockBarVertical.vue";
import {
  CLOCK_BAR_DEFAULT_ZONE,
  CLOCK_BAR_SIZE_TABLES,
  CLOCK_BAR_ZONE_KEYS,
  CLOCK_BAR_ZONE_LABELS,
  buildClockBarDesign,
  clockBarPartSizeOptions,
  defaultClockBarDesign,
  isTilePart,
  partLabel,
  resolveClockBarDesign,
  tileInstanceId,
} from "@/utils/clockBarDesign";

defineOptions({ name: "ClockBarEditor" });

const props = defineProps({
  config: { type: Object, required: true },
  open: { type: Boolean, default: false },
  // The bar shape the caller was looking at (the region editor's panel).
  initialShape: {
    type: String,
    default: null,
    validator: value => value === null || ["horizontal", "vertical"].includes(value),
  },
  initialPreviewKiosk: { type: String, default: null },
});

const emit = defineEmits(["update:config", "close"]);

const ANY_BROWSER = "__global";
const router = useRouter();
const kiosksStore = useKiosksStore();
const webServicesStore = useWebServicesStore();

const {
  modalEl,
  stageEl,
  sizeClass,
  isPhone,
  coarsePointer,
  reduceMotion,
  startObserving,
  stopObserving,
  resetLayout,
} = useEditorLayout();

const shape = ref("horizontal");
const selectedPart = ref(null);
const sheetOpen = ref(false);
const confirmReset = ref(false);
const undoState = ref(null);
const previewScreenId = ref(ANY_BROWSER);
const anyBrowserOrientation = ref("landscape");

const zoneKeys = computed(() => CLOCK_BAR_ZONE_KEYS[shape.value]);
const zoneLabels = computed(() => CLOCK_BAR_ZONE_LABELS[shape.value]);

const services = computed(() => webServicesStore.services);
const resolveOptions = () => ({ servicesLoaded: webServicesStore.loaded });
const clonedShape = source => ({
  zones: Object.fromEntries(
    CLOCK_BAR_ZONE_KEYS[source.shape].map(key => [key, [...(source.zones[key] || [])]])
  ),
  hidden: [...(source.hidden || [])],
  parts: JSON.parse(JSON.stringify(source.parts || {})),
  barHeight: source.barHeight,
  tileSize: source.tileSize,
  tiles: [...(source.tiles || [])],
  tileIds: [...(source.tileIds || [])],
});
const cloneDesign = design => ({
  horizontal: clonedShape(design.horizontal),
  vertical: clonedShape(design.vertical),
});

const designState = ref(null);
const resolved = computed(() => {
  const design = designState.value ? buildClockBarDesign(designState.value) : null;
  return resolveClockBarDesign(
    { ...props.config, clockBarDesign: design },
    services.value,
    resolveOptions()
  );
});
const shapeDesign = computed(() => resolved.value[shape.value]);
const hiddenParts = computed(() => shapeDesign.value.hidden || []);

const resetDraft = () => {
  designState.value = cloneDesign(
    resolveClockBarDesign(props.config, services.value, resolveOptions())
  );
  selectedPart.value = null;
  undoState.value = null;
  sheetOpen.value = false;
};

const persist = () => {
  if (!designState.value) return;
  emit("update:config", { clockBarDesign: buildClockBarDesign(designState.value) });
};

const labelFor = partId => partLabel(partId, services.value);
const isTile = partId => isTilePart(partId);

/* --- preview on ---------------------------------------------------------- */
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
const orientation = computed(() => {
  if (previewScreenId.value === ANY_BROWSER) return anyBrowserOrientation.value;
  return previewKiosk.value?.overrides?.orientation || props.config.orientation || "landscape";
});
const orientationBadge = computed(() =>
  orientation.value === "portrait" ? "Portrait" : "Landscape"
);

const setPreviewScreen = value => {
  previewScreenId.value = value;
};
const setShape = value => {
  shape.value = value;
  selectedPart.value = null;
  sheetOpen.value = false;
};

/* --- state edits --------------------------------------------------------- */
const currentShapeState = () => designState.value?.[shape.value];

const DATE = "date";
const TIME = "time";
const DEFAULT_ZONE = computed(() => CLOCK_BAR_DEFAULT_ZONE[shape.value]);

const removeEverywhere = (state, partId) => {
  for (const key of CLOCK_BAR_ZONE_KEYS[shape.value]) {
    state.zones[key] = state.zones[key].filter(entry => entry !== partId);
  }
  state.hidden = state.hidden.filter(entry => entry !== partId);
};

/* Moves are announced (spec section 6): the position is read after the move. */
const announcement = ref("");
const announceMove = partId => {
  const state = currentShapeState();
  if (!state) return;
  const label = labelFor(partId);
  if (state.hidden.includes(partId)) {
    announcement.value = `${label} moved to Not shown.`;
    return;
  }
  const zone = zoneKeys.value.find(key => state.zones[key].includes(partId));
  if (!zone) return;
  const list = state.zones[zone];
  announcement.value = `${label} moved to ${zoneLabels.value[zone]}, ${list.indexOf(partId) + 1} of ${list.length}.`;
};

const movePart = (partId, zone, index = null) => {
  const state = currentShapeState();
  if (!state) return;
  if (partId === "status" && zone === "hidden") return;
  removeEverywhere(state, partId);
  if (zone === "hidden") {
    state.hidden.push(partId);
  } else if (state.zones[zone]) {
    const list = state.zones[zone];
    const at = index == null ? list.length : Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, partId);
  }
  persist();
  announceMove(partId);
};

const selectPart = partId => {
  selectedPart.value = partId;
  if (isPhone.value) sheetOpen.value = true;
};

const selectedZone = computed(() => {
  const state = currentShapeState();
  if (!state || !selectedPart.value) return null;
  if (state.hidden.includes(selectedPart.value)) return "hidden";
  return zoneKeys.value.find(key => state.zones[key].includes(selectedPart.value)) || null;
});
const selectedVisible = computed(
  () => selectedZone.value !== "hidden" && selectedZone.value !== null
);
const selectedLabel = computed(() => (selectedPart.value ? labelFor(selectedPart.value) : ""));

const selectedPartData = computed(() => {
  if (!selectedPart.value) return {};
  return shapeDesign.value.parts?.[selectedPart.value] || {};
});
const partHasSize = computed(() => ["logo", "room", "time", "date"].includes(selectedPart.value));
const sizeOptions = computed(() => clockBarPartSizeOptions(selectedPart.value));
const sizeCustom = computed(
  () => partHasSize.value && typeof selectedPartData.value.size === "number"
);
const sizeCustomLabel = computed(() =>
  sizeCustom.value ? ` · Custom (${selectedPartData.value.size} px)` : ""
);
const nearestStep = computed(() => {
  const kind = selectedPart.value;
  const table = CLOCK_BAR_SIZE_TABLES[shape.value]?.[kind];
  if (!table) return "m";
  const px = Number(selectedPartData.value.size) || 0;
  return Object.entries(table).reduce(
    (best, [step, value]) => (Math.abs(value - px) < Math.abs(table[best] - px) ? step : best),
    "m"
  );
});
const nearestStepLabel = computed(
  () => ({ s: "S", m: "M", l: "L", xl: "XL" })[nearestStep.value] || "M"
);

const dateAdjacent = computed(() => {
  const state = currentShapeState();
  if (!state) return false;
  for (const key of zoneKeys.value) {
    const list = state.zones[key];
    const timeIndex = list.indexOf(TIME);
    if (timeIndex >= 0 && list[timeIndex + 1] === DATE) return true;
  }
  return false;
});

const canMoveEarlier = computed(() => {
  if (selectedZone.value === "hidden") return false;
  const state = currentShapeState();
  if (!state) return false;
  const list = state.zones[selectedZone.value] || [];
  const index = list.indexOf(selectedPart.value);
  if (index > 0) return true;
  const zoneIndex = zoneKeys.value.indexOf(selectedZone.value);
  return zoneIndex > 0;
});
const canMoveLater = computed(() => {
  if (selectedZone.value === "hidden") return false;
  const state = currentShapeState();
  if (!state) return false;
  const list = state.zones[selectedZone.value] || [];
  const index = list.indexOf(selectedPart.value);
  if (index >= 0 && index < list.length - 1) return true;
  const zoneIndex = zoneKeys.value.indexOf(selectedZone.value);
  return zoneIndex >= 0 && zoneIndex < zoneKeys.value.length - 1;
});

const zoneOptions = computed(() => {
  const options = zoneKeys.value.map(key => ({ value: key, label: zoneLabels.value[key] }));
  if (selectedPart.value !== "status") options.push({ value: "hidden", label: "Not shown" });
  return options;
});

const setShown = shown => {
  if (!selectedPart.value) return;
  if (shown) showPart(selectedPart.value);
  else movePart(selectedPart.value, "hidden");
};

const showPart = partId => {
  const state = currentShapeState();
  if (!state) return;
  const timeZone = zoneKeys.value.find(key => state.zones[key].includes(TIME));
  const zone = partId === DATE && timeZone ? timeZone : DEFAULT_ZONE.value;
  const list = state.zones[zone];
  const index = partId === DATE && timeZone ? list.indexOf(TIME) + 1 : null;
  movePart(partId, zone, index > 0 ? index : null);
};

const setZone = zone => {
  if (!selectedPart.value) return;
  if (zone === "hidden") {
    if (selectedPart.value !== "status") movePart(selectedPart.value, "hidden");
    return;
  }
  movePart(selectedPart.value, zone);
};

const moveSelected = delta => {
  if (!selectedPart.value || selectedZone.value === "hidden") return;
  const state = currentShapeState();
  const zone = selectedZone.value;
  const list = state.zones[zone];
  const index = list.indexOf(selectedPart.value);
  const target = index + delta;
  if (target >= 0 && target < list.length) {
    list.splice(index, 1);
    list.splice(target, 0, selectedPart.value);
    persist();
    announceMove(selectedPart.value);
    return;
  }
  const zoneIndex = zoneKeys.value.indexOf(zone);
  const nextZone = zoneKeys.value[zoneIndex + delta];
  if (!nextZone) return;
  movePart(selectedPart.value, nextZone, delta < 0 ? 0 : null);
};

// A keyboard move re-renders the bar; keep the keyboard on the chip it moved
// so the next arrow key still lands on it.
const focusChip = async partId => {
  await nextTick();
  stageEl.value?.querySelector(`[data-part-id="${CSS.escape(partId)}"]`)?.focus();
};

const onMovePart = ({ partId, direction }) => {
  const earlier = shape.value === "horizontal" ? direction === "left" : direction === "up";
  const later = shape.value === "horizontal" ? direction === "right" : direction === "down";
  if (selectedPart.value !== partId) selectedPart.value = partId;
  if (!earlier && !later) return;
  moveSelected(earlier ? -1 : 1);
  focusChip(partId);
};

const setPartOption = (key, value) => {
  const state = currentShapeState();
  if (!state || !selectedPart.value) return;
  const part = state.parts[selectedPart.value] || {};
  state.parts[selectedPart.value] = { ...part, [key]: value };
  persist();
};

const setPartSize = value => {
  if (!value) return;
  setPartOption("size", value);
};
const resetPartSize = () => setPartOption("size", nearestStep.value);

const setBarOption = (key, value) => {
  const state = currentShapeState();
  if (!state || !value) return;
  state[key] = value;
  persist();
};

const barHeightCustom = computed(() => typeof shapeDesign.value.barHeight === "number");
const barHeightCustomLabel = computed(() =>
  barHeightCustom.value ? ` · Custom (${shapeDesign.value.barHeight} px)` : ""
);
const nearestBarHeightLabel = computed(() => {
  const table = CLOCK_BAR_SIZE_TABLES[shape.value].padding;
  const px = Number(shapeDesign.value.barHeight) || 0;
  const step = Object.entries(table).reduce(
    (best, [name, value]) => (Math.abs(value - px) < Math.abs(table[best] - px) ? name : best),
    "normal"
  );
  return step.charAt(0).toUpperCase() + step.slice(1);
});
const resetBarHeight = () => {
  const table = CLOCK_BAR_SIZE_TABLES[shape.value].padding;
  const px = Number(shapeDesign.value.barHeight) || 0;
  const step = Object.entries(table).reduce(
    (best, [name, value]) => (Math.abs(value - px) < Math.abs(table[best] - px) ? name : best),
    "normal"
  );
  setBarOption("barHeight", step);
};

const tileSizeCustom = computed(() => typeof shapeDesign.value.tileSize === "number");
const tileSizeCustomLabel = computed(() =>
  tileSizeCustom.value ? ` · Custom (${shapeDesign.value.tileSize} px)` : ""
);
const nearestTileSizeLabel = computed(() => {
  const table = CLOCK_BAR_SIZE_TABLES[shape.value].tile;
  const px = Number(shapeDesign.value.tileSize) || 0;
  const step = Object.entries(table).reduce(
    (best, [name, value]) => (Math.abs(value - px) < Math.abs(table[best] - px) ? name : best),
    "m"
  );
  return step.toUpperCase();
});
const resetTileSize = () => {
  const table = CLOCK_BAR_SIZE_TABLES[shape.value].tile;
  const px = Number(shapeDesign.value.tileSize) || 0;
  const step = Object.entries(table).reduce(
    (best, [name, value]) => (Math.abs(value - px) < Math.abs(table[best] - px) ? name : best),
    "m"
  );
  setBarOption("tileSize", step);
};

/* --- reset / undo -------------------------------------------------------- */
let undoTimer = null;
const resetToDefault = () => {
  const previous = designState.value ? buildClockBarDesign(designState.value) : null;
  designState.value = cloneDesign(
    resolveClockBarDesign(
      { clockBarDesign: defaultClockBarDesign() },
      services.value,
      resolveOptions()
    )
  );
  selectedPart.value = null;
  confirmReset.value = false;
  persist();
  undoState.value = { previous };
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoState.value = null;
    undoTimer = null;
  }, 8000);
};
const undoReset = () => {
  if (!undoState.value?.previous) return;
  designState.value = cloneDesign(
    resolveClockBarDesign(
      { ...props.config, clockBarDesign: undoState.value.previous },
      services.value,
      resolveOptions()
    )
  );
  undoState.value = null;
  if (undoTimer) clearTimeout(undoTimer);
  persist();
};

/* --- pointer drag (touch and fine pointers) ----------------------------- */
const dragState = ref(null);
const dropTarget = ref(null);
const dropLine = ref(null);

const dropLineStyle = computed(() =>
  dropLine.value
    ? {
        left: `${dropLine.value.left}px`,
        top: `${dropLine.value.top}px`,
        width: dropLine.value.vertical ? "2px" : `${dropLine.value.width}px`,
        height: dropLine.value.vertical ? `${dropLine.value.height}px` : "2px",
      }
    : null
);

const startDrag = event => {
  if (event.button != null && event.button !== 0) return;
  const element = event.target?.closest?.("[data-part-id]");
  if (!element) return;
  dragState.value = {
    partId: element.dataset.partId,
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", cancelDrag);
};

const updateDropTarget = event => {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  const zoneEl = element?.closest?.("[data-drop-zone]");
  if (!zoneEl) {
    dropTarget.value = null;
    dropLine.value = null;
    return;
  }
  const zone = zoneEl.dataset.dropZone;
  if (zone === "hidden") {
    dropTarget.value = { zone, index: null };
    dropLine.value = null;
    return;
  }
  const horizontal = shape.value === "horizontal";
  const chips = [...zoneEl.querySelectorAll("[data-part-id]")].filter(
    chip => chip.dataset.partId !== dragState.value?.partId
  );
  const point = horizontal ? event.clientX : event.clientY;
  let index = 0;
  for (const chip of chips) {
    const rect = chip.getBoundingClientRect();
    const middle = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    if (point > middle) index += 1;
  }
  dropTarget.value = { zone, index };

  const stageRect = stageEl.value?.getBoundingClientRect() || { left: 0, top: 0 };
  const rootRect = {
    left: stageRect.left - (stageEl.value?.scrollLeft || 0),
    top: stageRect.top - (stageEl.value?.scrollTop || 0),
  };
  const before = chips[index];
  if (before) {
    const rect = before.getBoundingClientRect();
    dropLine.value = horizontal
      ? {
          left: rect.left - rootRect.left - 3,
          top: rect.top - rootRect.top,
          height: rect.height,
          vertical: true,
        }
      : {
          left: rect.left - rootRect.left,
          top: rect.top - rootRect.top - 3,
          width: rect.width,
          vertical: false,
        };
    return;
  }
  const last = chips[chips.length - 1];
  if (last) {
    const rect = last.getBoundingClientRect();
    dropLine.value = horizontal
      ? {
          left: rect.right - rootRect.left + 3,
          top: rect.top - rootRect.top,
          height: rect.height,
          vertical: true,
        }
      : {
          left: rect.left - rootRect.left,
          top: rect.bottom - rootRect.top + 3,
          width: rect.width,
          vertical: false,
        };
    return;
  }
  const rect = zoneEl.getBoundingClientRect();
  dropLine.value = horizontal
    ? {
        left: rect.left - rootRect.left + 8,
        top: rect.top - rootRect.top,
        height: rect.height,
        vertical: true,
      }
    : {
        left: rect.left - rootRect.left,
        top: rect.top - rootRect.top + 8,
        width: rect.width,
        vertical: false,
      };
};

const onPointerMove = event => {
  if (!dragState.value) return;
  const dx = event.clientX - dragState.value.startX;
  const dy = event.clientY - dragState.value.startY;
  if (!dragState.value.dragging && Math.hypot(dx, dy) < 6) return;
  dragState.value.dragging = true;
  event.preventDefault();
  updateDropTarget(event);
};

const endDrag = () => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopDrag);
  window.removeEventListener("pointercancel", cancelDrag);
  dragState.value = null;
  dropTarget.value = null;
  dropLine.value = null;
};

const stopDrag = () => {
  const state = dragState.value;
  const target = dropTarget.value;
  endDrag();
  if (state?.dragging && target) movePart(state.partId, target.zone, target.index);
};

// The system took the pointer (a scroll, a call): that is no drop.
const cancelDrag = () => endDrag();

/* --- links --------------------------------------------------------------- */
const openTileSource = () => {
  const id = tileInstanceId(selectedPart.value);
  emit("close");
  router.push({ path: "/settings", query: { setting: "content-clock-bar", source: id } });
};
const openPagesRegions = () => {
  emit("close");
  router.push({ path: "/settings", query: { setting: "dashboard-regions" } });
};

/* --- open ---------------------------------------------------------------- */
const applyInitialPreview = () => {
  previewScreenId.value = props.initialPreviewKiosk || getKioskId() || ANY_BROWSER;
};
const initialShape = () =>
  props.initialShape || (props.config.clockBarMode === "vertical" ? "vertical" : "horizontal");

watch(
  () => props.open,
  async open => {
    if (open) {
      shape.value = initialShape();
      applyInitialPreview();
      anyBrowserOrientation.value = props.config.orientation || "landscape";
      resetDraft();
      await nextTick();
      startObserving();
    } else {
      stopObserving();
      resetLayout();
      selectedPart.value = null;
      sheetOpen.value = false;
      undoState.value = null;
    }
  },
  { immediate: true }
);

watch(isPhone, phone => {
  if (!phone) sheetOpen.value = false;
});

onMounted(() => {
  if (webServicesStore.services.length === 0 && !webServicesStore.loading) {
    webServicesStore.fetchServices();
  }
  if (kiosksStore.kiosks.length === 0) kiosksStore.loadKiosks();
});
</script>

<style scoped>
.cbe-root {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.cbe-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-3);
  padding: var(--panel-pad-y) var(--panel-pad-x);
  border-bottom: 1px solid var(--line);
  background: var(--bg-1);
}

.cbe-preview-as {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  min-width: 0;
}

.cbe-preview-label {
  color: var(--ink-3);
  font-size: var(--text-meta);
}

.cbe-context-actions {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  margin-left: auto;
}

.cbe-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}

.cbe-stage {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--gap-3);
  min-width: 0;
  min-height: 0;
  padding: var(--panel-pad-y) var(--panel-pad-x);
  overflow: auto;
  background: var(--bg-2);
}

.cbe-legend {
  display: flex;
  gap: var(--gap-3);
  color: var(--ink-3);
  font-size: var(--text-meta);
}

.cbe-legend-item {
  flex: 1;
}

.cbe-device {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: center;
  min-height: 0;
}

.cbe-device.is-portrait {
  max-width: 24rem;
  margin: 0 auto;
  width: 100%;
}

.cbe-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 14rem;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--bg-1);
}

.cbe-device.is-portrait .cbe-page {
  min-height: 28rem;
}

/* A short wall panel keeps the shelf in view: the page placeholder is scenery,
   not a full page preview. */
.size-compact .cbe-page {
  min-height: 0;
}

.size-compact .cbe-page-body {
  min-height: 1.5rem;
}

.size-phone .cbe-page {
  min-height: 10rem;
}

.cbe-page-body {
  flex: 1 1 auto;
  min-height: 8rem;
  background:
    linear-gradient(var(--line-soft), var(--line-soft)) padding-box,
    var(--bg-2);
  opacity: 0.5;
}

.cbe-shelf {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: var(--gap-2);
  padding: var(--gap-3);
  border: 1px dashed var(--line);
  border-radius: var(--radius-control);
  background: var(--bg-1);
}

.cbe-shelf.is-drop-target {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 25%, transparent);
}

.cbe-shelf-title {
  color: var(--ink-3);
  font-size: var(--text-meta);
}

.cbe-shelf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-2);
}

.cbe-shelf-chip {
  min-height: var(--touch-target);
  padding: 0 var(--gap-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--bg-2);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  cursor: grab;
  touch-action: none;
}

.cbe-shelf-chip.is-selected {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 30%, transparent);
}

.cbe-shelf-empty {
  color: var(--ink-3);
  font-size: var(--text-meta);
}

.cbe-shelf-why {
  color: var(--ink-2);
  font-size: var(--text-meta);
}

.cbe-drop-line {
  position: absolute;
  z-index: var(--z-toast);
  background: var(--focus);
  border-radius: var(--radius-round);
  pointer-events: none;
}

.cbe-stage :deep([data-drop-zone]) {
  transition: background var(--dur);
}

.cbe-stage.is-dragging :deep([data-drop-zone]) {
  background: color-mix(in srgb, var(--focus) 7%, transparent);
}

.cbe-stage.drop-left :deep([data-drop-zone="left"]),
.cbe-stage.drop-center :deep([data-drop-zone="center"]),
.cbe-stage.drop-right :deep([data-drop-zone="right"]),
.cbe-stage.drop-top :deep([data-drop-zone="top"]),
.cbe-stage.drop-middle :deep([data-drop-zone="middle"]),
.cbe-stage.drop-bottom :deep([data-drop-zone="bottom"]) {
  background: color-mix(in srgb, var(--focus) 15%, transparent);
  outline: 1px dashed var(--focus);
}

.cbe-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.cbe-toast {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--gap-3);
  align-self: flex-start;
  padding: var(--gap-2) var(--gap-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--bg-1);
  box-shadow: var(--elev-2);
}

.cbe-rail {
  display: flex;
  flex: 0 0 20rem;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--line);
  background: var(--bg-1);
}

.cbe-rail-scroll {
  overflow: auto;
  padding-bottom: var(--panel-pad-y);
}

.cbe-rail-title {
  margin: 0;
  padding: var(--panel-pad-y) var(--panel-pad-x) var(--gap-2);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-title);
}

.cbe-order,
.cbe-size-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-2);
}

.cbe-note {
  padding: 0 var(--panel-pad-x) var(--gap-3);
}

.cbe-sheet-peek {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  min-height: var(--touch-target);
  padding: var(--gap-1) var(--panel-pad-x);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}

.cbe-sheet-handle {
  width: 2.5rem;
  height: 4px;
  border-radius: var(--radius-round);
  background: var(--line);
}

.cbe-sheet-label {
  flex: 1;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--text-body);
}

.cbe-sheet-chevron {
  color: var(--ink-3);
}

/* Phone: the rail becomes a bottom sheet, like Pages & regions. */
.size-phone .cbe-body {
  position: relative;
}

.size-phone .cbe-rail.is-sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-raised);
  max-height: 60%;
  flex: 0 0 auto;
  border-top: 1px solid var(--line);
  border-left: none;
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: var(--elev-2);
  transform: translateY(calc(100% - var(--touch-target) - 4px));
  transition: transform var(--dur) var(--ease);
}

.size-phone .cbe-rail.is-sheet.is-open {
  transform: translateY(0);
}

.size-phone .cbe-rail.is-sheet.no-motion {
  transition: none;
}

/* Compact (a short wall panel): stage and inspector side by side, like Pages &
   regions. */
.size-compact .cbe-rail {
  flex: 0 0 280px;
  max-height: none;
  border-top: none;
  border-left: 1px solid var(--line);
}

.size-phone .cbe-stage,
.size-phone .cbe-context {
  padding-right: var(--gap-3);
  padding-left: var(--gap-3);
}

@media (prefers-reduced-motion: reduce) {
  .cbe-rail.is-sheet {
    transition: none;
  }
}
</style>
