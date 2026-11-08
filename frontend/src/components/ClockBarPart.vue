<template>
  <ClockBarChip
    :editable="editable"
    :selected="selected"
    :part-id="partId"
    :zone="zone"
    :index="index"
    :count="count"
    :label="label"
    @select="$emit('select', partId)"
    @move="$emit('move', $event)"
  >
    <BarLogo
      v-if="partId === 'logo'"
      :vertical="orientation === 'vertical'"
      :size-px="renderedSizePx"
    />

    <span v-else-if="partId === 'room'" class="clock-bar-room" :style="roomStyle">{{
      roomLabel
    }}</span>

    <ScreenDots
      v-else-if="partId === 'pageDots'"
      :vertical="orientation === 'vertical'"
      :screens="dotsScreens"
      :active-screen-id="dotsActiveId"
      @select-screen="$emit('select-screen', $event)"
    />

    <span
      v-else-if="partId === 'time'"
      class="clock-time"
      :class="{ 'compact-time': isStackedTime, 'is-vertical': orientation === 'vertical' }"
      :style="{ fontSize: `${part.sizePx ?? 16}px` }"
    >
      <template v-if="isStackedTime">
        <span>{{ timeData.compactTimeParts?.hour }}</span>
        <span>{{ timeData.compactTimeParts?.minute }}</span>
        <span v-if="timeData.compactTimeParts?.second">{{ timeData.compactTimeParts.second }}</span>
        <span v-if="timeData.compactTimeParts?.dayPeriod" class="compact-period">{{
          timeData.compactTimeParts.dayPeriod
        }}</span>
      </template>
      <template v-else>{{ timeData.formattedTime }}</template>
    </span>

    <span
      v-else-if="partId === 'date'"
      class="clock-date"
      :class="{
        'compact-date': compactDate,
        'compact-date-stacked': isStackedDate,
        'is-vertical': orientation === 'vertical',
      }"
      :style="{ fontSize: `${part.sizePx ?? 14}px` }"
    >
      <template v-if="isStackedDate">
        <span v-if="timeData.compactDateParts?.weekday">{{
          timeData.compactDateParts.weekday
        }}</span>
        <span>
          {{ timeData.compactDateParts?.day }}
          {{ timeData.compactDateParts?.month }}
        </span>
        <span v-if="timeData.compactDateParts?.year" class="compact-date-year">{{
          timeData.compactDateParts.year
        }}</span>
      </template>
      <template v-else>{{ timeData.formattedDate }}</template>
    </span>

    <PluginStatusbarItems
      v-else-if="partId === 'tiles' || isTile"
      :ids="instanceIds"
      :orientation="orientation"
      :size="part.sizePx ?? null"
    />

    <BarActionCluster v-else-if="partId === 'status'" :compact="orientation === 'vertical'" />
  </ClockBarChip>
</template>

<script setup>
import { computed } from "vue";
import BarActionCluster from "./BarActionCluster.vue";
import BarLogo from "./BarLogo.vue";
import ClockBarChip from "./ClockBarChip.vue";
import PluginStatusbarItems from "./PluginStatusbarItems.vue";
import ScreenDots from "./ui/ScreenDots.vue";
import { isTilePart, tileInstanceId } from "../utils/clockBarDesign";

// One part of the bar, shared by both shapes and by the editor (the same
// renderer is the claim of the design). The bar supplies the live time values
// so a part never starts its own tick.
defineOptions({ name: "ClockBarPart" });

const props = defineProps({
  partId: { type: String, required: true },
  part: { type: Object, default: () => ({}) },
  tileIds: { type: Array, default: () => [] },
  orientation: {
    type: String,
    default: "horizontal",
    validator: value => ["horizontal", "vertical"].includes(value),
  },
  sample: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  zone: { type: String, default: "" },
  index: { type: Number, default: 0 },
  count: { type: Number, default: 1 },
  label: { type: String, default: "" },
  timeData: { type: Object, default: () => ({}) },
  roomLabel: { type: String, default: "" },
  screens: { type: Array, default: () => [] },
  activeScreenId: { type: String, default: null },
  // The side bar's compact-time layout draws a non-stacked date vertically.
  compactDate: { type: Boolean, default: false },
});
defineEmits(["select", "move", "select-screen"]);

const isTile = computed(() => isTilePart(props.partId));
// A single tile chip carries its own instance id; the live bar's grouped
// "tiles" part carries the whole run.
const instanceIds = computed(() => (isTile.value ? [tileInstanceId(props.partId)] : props.tileIds));
const isStackedTime = computed(
  () => props.orientation === "vertical" && props.part.style === "stacked"
);
const isStackedDate = computed(
  () => props.orientation === "vertical" && props.part.style === "stacked"
);

// M is today's CSS token, so only a non-M step gets an inline size (logo and
// room have no size control today).
const renderedSizePx = computed(() =>
  props.part.size && props.part.size !== "m" ? props.part.sizePx : null
);
const roomStyle = computed(() =>
  props.part.size && props.part.size !== "m" ? { fontSize: `${props.part.sizePx}px` } : null
);

const SAMPLE_SCREENS = [
  { id: "sample-kitchen", name: "Kitchen" },
  { id: "sample-patio", name: "Patio" },
];
const dotsScreens = computed(() => (props.sample ? SAMPLE_SCREENS : props.screens));
const dotsActiveId = computed(() => (props.sample ? SAMPLE_SCREENS[0].id : props.activeScreenId));
</script>

<style scoped>
/* The part markup lives here, so its faces live here too: the bar components
   only style the box around it (calvin-d7cl review). */
.clock-time {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums lining-nums;
  font-weight: var(--weight-title);
  color: var(--ink);
  white-space: nowrap;
}

.clock-date {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--ink-2);
  white-space: nowrap;
}

/* The side bar always read 1.1 here (its later rule beat the compact ones). */
.clock-time.is-vertical,
.clock-date.is-vertical {
  line-height: 1.1;
}

.clock-bar-room {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-ui);
  color: var(--ink-3);
  font-size: var(--text-body);
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

.compact-date {
  max-height: 35vh;
  writing-mode: vertical-rl;
  text-orientation: upright;
  overflow: hidden;
  text-overflow: ellipsis;
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
</style>
