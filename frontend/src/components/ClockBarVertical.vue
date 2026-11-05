<template>
  <div
    v-if="shouldShow"
    class="clock-bar-vertical"
    :class="[`position-${position}`]"
    :style="{ padding: barPaddingStyle }"
    role="status"
    aria-label="Status bar"
    aria-live="polite"
  >
    <div
      v-for="zoneKey in zoneKeys"
      :key="zoneKey"
      class="clock-bar-zone"
      :class="[`clock-bar-${zoneKey}`, { 'clock-bar-content': zoneKey === 'middle' }]"
      :data-drop-zone="zoneKey"
    >
      <template v-for="(item, itemIndex) in zoneItems[zoneKey]" :key="`${item.id}-${itemIndex}`">
        <div v-if="item.kind === 'pair'" class="clock-bar-time-stack">
          <ClockBarPart
            part-id="time"
            :part="partFor('time')"
            :orientation="'vertical'"
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
            :orientation="'vertical'"
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
          :orientation="'vertical'"
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
</template>

<script setup>
import { computed } from "vue";
import { useClockBar } from "../composables/useClockBar";
import { useConfigStore } from "../stores/config";
import { useWebServicesStore } from "../stores/webServices";
import { useKeyboardActions } from "../composables/useKeyboardActions";
import { getActiveDashboardScreen } from "../utils/layout";
import {
  CLOCK_BAR_ZONE_LABELS,
  isTilePart,
  partLabel,
  resolveClockBarDesign,
  tileInstanceId,
} from "../utils/clockBarDesign";
import ClockBarPart from "./ClockBarPart.vue";

defineOptions({
  name: "ClockBarVertical",
});

const props = defineProps({
  position: {
    type: String,
    required: true,
    validator: value => ["left", "right", "between"].includes(value),
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
const zoneKeys = ["top", "middle", "bottom"];

const bar = computed(
  () =>
    props.design || resolveClockBarDesign(configStore.$state, webServicesStore.services).vertical
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
  orientation: () => "vertical",
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
const roomLabel = computed(() => (props.sample ? "Kitchen" : ""));

const visiblePartIds = zoneKey =>
  (bar.value.zones?.[zoneKey] || []).filter(partId => partId !== "room" || roomLabel.value);

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

const zoneMeta = (zoneKey, partId) => {
  const ids = visiblePartIds(zoneKey);
  const index = ids.indexOf(partId);
  return { index: index < 0 ? 0 : index, count: ids.length };
};

const partAria = (partId, zoneKey) => {
  const zoneName = CLOCK_BAR_ZONE_LABELS.vertical[zoneKey] || zoneKey;
  const { index, count } = zoneMeta(zoneKey, partId);
  return `${partLabel(partId, webServicesStore.services)}, in ${zoneName}, ${index + 1} of ${count}`;
};

const partFor = partId => {
  if (partId === "tiles" || isTilePart(partId)) return { sizePx: bar.value.tileSizePx };
  return bar.value.parts?.[partId] || {};
};
</script>

<style scoped>
.clock-bar-vertical {
  height: 100%;
  width: auto;
  min-width: fit-content;
  background: var(--bg-1);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--gap-3);
  position: relative;
  /* Above the dashboard stage (--z-raised) so the bar never sits under a
     region's focus glow. */
  z-index: var(--z-sticky);
  user-select: none;
  flex-shrink: 0;
  box-sizing: border-box;
  min-height: 0;
}

.clock-bar-vertical.position-right {
  border-left: 1px solid var(--line);
  border-right: none;
}

.clock-bar-vertical.position-between {
  z-index: var(--z-sticky);
  border: none;
  background: color-mix(in srgb, var(--ink) 5%, transparent);
  border-radius: var(--radius-control);
}

.clock-bar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-2);
  flex: 0 0 auto;
}

.clock-bar-middle {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-3);
  min-height: 0;
}

.clock-bar-bottom {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gap-3);
  min-height: 0;
}

.clock-bar-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-1);
  white-space: nowrap;
  text-align: center;
}

.clock-bar-time-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--gap-1);
}

.compact-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  line-height: 0.92;
  font-variant-numeric: tabular-nums;
}

.compact-period {
  margin-top: var(--gap-1);
  font-size: 0.45em;
  line-height: 1;
}

.compact-date-stacked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  max-height: none;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.compact-date-year {
  font-size: 0.78em;
  color: var(--ink-2);
}

.clock-time {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums lining-nums;
  font-weight: var(--weight-title);
  color: var(--ink);
  line-height: 1.1;
}

.clock-date {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--ink-2);
  line-height: 1.1;
}

.clock-bar-room {
  font-family: var(--font-ui);
  color: var(--ink-3);
  font-size: var(--text-body);
}

.clock-bar-vertical.position-between .clock-time {
  font-size: var(--text-body);
}

.clock-bar-vertical.position-between .clock-date {
  font-size: var(--text-caption);
}
</style>
