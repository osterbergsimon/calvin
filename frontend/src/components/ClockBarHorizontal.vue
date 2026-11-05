<template>
  <div
    v-if="shouldShow"
    class="clock-bar-horizontal"
    :class="[`position-${position}`]"
    :style="{ padding: barPaddingStyle }"
    role="status"
    aria-label="Status bar"
    aria-live="polite"
  >
    <div class="clock-bar-outer">
      <div
        v-for="zoneKey in zoneKeys"
        :key="zoneKey"
        class="clock-bar-zone"
        :class="[
          `clock-bar-${zoneKey}`,
          { 'clock-bar-content': zoneKey === 'center', 'clock-bar-side': zoneKey !== 'center' },
        ]"
        :data-drop-zone="zoneKey"
      >
        <template v-for="item in zoneItems[zoneKey]" :key="itemKey(item)">
          <div v-if="item.kind === 'pair'" class="clock-bar-time-stack">
            <ClockBarPart
              part-id="time"
              :part="partFor('time')"
              :orientation="'horizontal'"
              :sample="sample"
              :editable="editable"
              :selected="selectedPart === 'time'"
              :zone="zoneKey"
              :index="zoneMeta(zoneKey, 'time').index"
              :count="zoneMeta(zoneKey, 'time').count"
              :label="partAria('time', zoneKey)"
              :time-data="timeData"
              @select="$emit('select-part', $event)"
              @move="$emit('move-part', $event)"
            />
            <ClockBarPart
              part-id="date"
              :part="partFor('date')"
              :orientation="'horizontal'"
              :sample="sample"
              :editable="editable"
              :selected="selectedPart === 'date'"
              :zone="zoneKey"
              :index="zoneMeta(zoneKey, 'date').index"
              :count="zoneMeta(zoneKey, 'date').count"
              :label="partAria('date', zoneKey)"
              :time-data="timeData"
              @select="$emit('select-part', $event)"
              @move="$emit('move-part', $event)"
            />
          </div>
          <ClockBarPart
            v-else
            :part-id="item.id"
            :part="partFor(item.id)"
            :tile-ids="item.ids || []"
            :orientation="'horizontal'"
            :sample="sample"
            :editable="editable"
            :selected="selectedPart === item.id"
            :zone="zoneKey"
            :index="zoneMeta(zoneKey, item.id).index"
            :count="zoneMeta(zoneKey, item.id).count"
            :label="partAria(item.id, zoneKey)"
            :time-data="timeData"
            :room-label="roomLabel"
            :screens="screens"
            :active-screen-id="activeScreenId"
            @select="$emit('select-part', $event)"
            @move="$emit('move-part', $event)"
            @select-screen="activateScreen"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useConfigStore } from "../stores/config";
import { useKiosksStore } from "../stores/kiosks";
import { useWebServicesStore } from "../stores/webServices";
import { useClockBar } from "../composables/useClockBar";
import { useBarServices } from "../composables/useBarServices";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { getActiveDashboardScreen } from "../utils/layout";
import { getKioskId } from "../utils/kioskId";
import {
  CLOCK_BAR_TILES,
  CLOCK_BAR_ZONE_LABELS,
  isTilePart,
  partLabel,
  resolveClockBarDesign,
  tileInstanceId,
} from "../utils/clockBarDesign";
import ClockBarPart from "./ClockBarPart.vue";

defineOptions({
  name: "ClockBarHorizontal",
});

const props = defineProps({
  position: {
    type: String,
    required: true,
    validator: value => ["top", "bottom", "between"].includes(value),
  },
  showInNonKiosk: {
    type: Boolean,
    default: false,
  },
  showInKiosk: {
    type: Boolean,
    default: false,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  alwaysShow: {
    type: Boolean,
    default: false,
  },
  // The editor draws the same component with its own resolved shape, sample
  // values and selectable chips.
  design: {
    type: Object,
    default: null,
  },
  sample: {
    type: Boolean,
    default: false,
  },
  editable: {
    type: Boolean,
    default: false,
  },
  selectedPart: {
    type: String,
    default: null,
  },
});

defineEmits(["select-part", "move-part"]);

const configStore = useConfigStore();
const webServicesStore = useWebServicesStore();
const zoneKeys = ["left", "center", "right"];

const bar = computed(
  () =>
    props.design ||
    resolveClockBarDesign(configStore.$state, webServicesStore.services, {
      servicesLoaded: webServicesStore.loaded,
    }).horizontal
);

const {
  shouldShow,
  formattedTime,
  compactTimeParts,
  formattedDate,
  compactDateParts,
  barPaddingStyle,
} = useClockBar({
  enabled: () => props.enabled,
  showInKiosk: () => props.showInKiosk,
  showInNonKiosk: () => props.showInNonKiosk,
  alwaysShow: () => props.alwaysShow,
  orientation: () => "horizontal",
  design: () => bar.value,
});

const timeData = computed(() => ({
  formattedTime: formattedTime.value,
  compactTimeParts: compactTimeParts.value,
  formattedDate: formattedDate.value,
  compactDateParts: compactDateParts.value,
}));

const { activateScreen } = useKeyboardActions();
const screensConfig = computed(() => configStore.effectiveDashboardScreens);
const screens = computed(() =>
  props.sample
    ? [
        { id: "sample-kitchen", name: "Kitchen" },
        { id: "sample-patio", name: "Patio" },
      ]
    : screensConfig.value.screens
);
const activeScreenId = computed(() => getActiveDashboardScreen(screensConfig.value)?.id ?? null);

// The room name is a screen's own Name (its displayName override), never a
// global value: a browser that is not a known screen shows nothing, and an
// unnamed screen shows nothing here too (CLV-84). The editor's sample fills it.
const kioskId = getKioskId();
const kiosksStore = useKiosksStore();
const roomLabel = computed(() => {
  if (props.sample) return "Kitchen";
  if (!kioskId) return "";
  const self = kiosksStore.kiosks.find(kiosk => kiosk.id === kioskId);
  return self?.overrides?.displayName || "";
});

const visiblePartIds = zoneKey =>
  (bar.value.zones?.[zoneKey] || []).filter(
    // "tiles" is the stored placeholder, kept only while services load.
    partId => partId !== CLOCK_BAR_TILES && (partId !== "room" || roomLabel.value)
  );

const zoneItems = computed(() => {
  const result = {};
  for (const zoneKey of zoneKeys) {
    const items = [];
    let tileRun = [];
    const flushTiles = () => {
      if (!tileRun.length) return;
      items.push({ kind: props.editable ? "part" : "tiles", id: "tiles", ids: [...tileRun] });
      tileRun = [];
    };
    for (const partId of visiblePartIds(zoneKey)) {
      if (isTilePart(partId)) {
        if (props.editable) {
          flushTiles();
          items.push({ kind: "part", id: partId });
        } else {
          tileRun.push(tileInstanceId(partId));
        }
        continue;
      }
      flushTiles();
      if (partId === "date" && bar.value.parts?.date?.underTime) {
        const previous = items[items.length - 1];
        if (previous?.kind === "part" && previous.id === "time") {
          previous.kind = "pair";
          continue;
        }
      }
      items.push({ kind: "part", id: partId });
    }
    flushTiles();
    result[zoneKey] = items;
  }
  return result;
});

// Keyed by the part so a reorder moves the element instead of remounting it
// (a remount drops keyboard focus). A run of tiles is keyed by its first tile.
const itemKey = item => (item.kind === "tiles" ? `tiles:${item.ids[0]}` : item.id);

const zoneMeta = (zoneKey, partId) => {
  const ids = visiblePartIds(zoneKey);
  const index = ids.indexOf(partId);
  return { index: index < 0 ? 0 : index, count: ids.length };
};

const partAria = (partId, zoneKey) => {
  const zoneName = CLOCK_BAR_ZONE_LABELS.horizontal[zoneKey] || zoneKey;
  const { index, count } = zoneMeta(zoneKey, partId);
  return `${partLabel(partId, webServicesStore.services)}, in ${zoneName}, ${index + 1} of ${count}`;
};

const partFor = partId => {
  if (partId === "tiles" || isTilePart(partId)) return { sizePx: bar.value.tileSizePx };
  return bar.value.parts?.[partId] || {};
};

useBarServices();

onMounted(() => {
  if (kioskId) kiosksStore.loadKiosks();
});
</script>

<style scoped>
.clock-bar-horizontal {
  width: 100%;
  background: var(--bg-1);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  /* Above the dashboard stage (--z-raised) so the bar never sits under a
     region's focus glow. */
  z-index: var(--z-sticky);
  user-select: none;
  flex: 0 0 auto;
  box-sizing: border-box;
  min-width: 0;
}

.clock-bar-horizontal.position-bottom {
  border-top: 1px solid var(--line);
  border-bottom: none;
}

.clock-bar-horizontal.position-between {
  z-index: var(--z-sticky);
  border: none;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  border-radius: var(--radius-control);
}

.clock-bar-time-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-1);
}

/* On a phone the bar cannot hold the wordmark, the room, the clock, the
   connection pill and the ⋯ menu on one line: the row ran past the screen and
   scrolled sideways, cutting the clock (CLV-66). The room name is the least
   load-bearing piece there and still shows in Settings. */
@media (--bp-phone) {
  .clock-bar-horizontal :deep(.clock-bar-room) {
    display: none;
  }
  /* Screen dots are 44px touch targets each and cannot shrink; at 390px they
     ran under the centred time ("●15:31"). Below the phone breakpoint the dots
     give way so the clock keeps its own room. */
  .clock-bar-horizontal :deep(.screen-dots) {
    display: none;
  }
  .clock-bar-outer {
    gap: var(--gap-2);
  }
}

.clock-bar-horizontal.position-between :deep(.clock-time) {
  font-size: var(--text-body);
}

.clock-bar-horizontal.position-between :deep(.clock-date) {
  font-size: var(--text-caption);
}

.clock-bar-outer {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--gap-4);
  min-width: 0;
}

.clock-bar-zone {
  display: flex;
  align-items: center;
  /* One spacing token for both sides: the wordmark, room name and screen dots
     (left) and the plugin tiles and actions (right) never touch. */
  gap: var(--gap-inline);
  min-width: 0;
}

.clock-bar-side {
  gap: var(--gap-inline);
}

.clock-bar-left {
  flex: 1;
  justify-content: flex-start;
}

.clock-bar-right {
  flex: 1;
  justify-content: flex-end;
}

/* The centred clock keeps its full width: the side groups yield instead of
   the time being squeezed under the screen dots (CLV-91). */
.clock-bar-content {
  flex: 0 0 auto;
  justify-content: center;
  gap: var(--gap-4);
  min-width: 0;
}
</style>
