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
      :class="{ 'compact-time': isStackedTime }"
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
      :class="{ 'compact-date-stacked': isStackedDate }"
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
      :ids="tileIds"
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
});
defineEmits(["select", "move", "select-screen"]);

const isTile = computed(() => props.partId.startsWith("tile:"));
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
