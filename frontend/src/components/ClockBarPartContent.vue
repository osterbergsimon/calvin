<template>
  <BarLogo v-if="partId === 'logo'" :vertical="shape === 'vertical'" />
  <span v-else-if="partId === 'room' && roomText" class="clock-bar-room">{{ roomText }}</span>
  <ScreenDots
    v-else-if="partId === 'pageDots'"
    :vertical="shape === 'vertical'"
    :screens="dotsScreens"
    :active-screen-id="activeScreenId"
    @select-screen="$emit('select-screen', $event)"
  />
  <span v-else-if="partId === 'time'" class="clock-time" :style="{ fontSize: `${timeSize}px` }">
    <template v-if="stackedTime">
      <span class="compact-time">
        <span>{{ compactTimeParts.hour }}</span>
        <span>{{ compactTimeParts.minute }}</span>
        <span v-if="compactTimeParts.second">{{ compactTimeParts.second }}</span>
        <span v-if="compactTimeParts.dayPeriod" class="compact-period">{{
          compactTimeParts.dayPeriod
        }}</span>
      </span>
    </template>
    <template v-else>{{ timeText }}</template>
  </span>
  <span
    v-else-if="partId === 'date'"
    class="clock-date"
    :class="{
      'compact-date': stackedDateLine,
      'compact-date-stacked': stackedDate,
    }"
    :style="{ fontSize: `${dateSize}px` }"
  >
    <template v-if="stackedDate && compactDateParts">
      <span v-if="compactDateParts.weekday">{{ compactDateParts.weekday }}</span>
      <span>{{ compactDateParts.day }} {{ compactDateParts.month }}</span>
      <span v-if="compactDateParts.year" class="compact-date-year">{{
        compactDateParts.year
      }}</span>
    </template>
    <template v-else>{{ dateText }}</template>
  </span>
  <PluginStatusbarItems
    v-else-if="isTile"
    :ids="[instanceId]"
    :orientation="shape === 'vertical' ? 'vertical' : 'horizontal'"
    :size="tileSize"
  />
  <BarActionCluster v-else-if="partId === 'status'" :compact="shape === 'vertical'" />
</template>

<script setup>
import { computed } from "vue";
import BarLogo from "./BarLogo.vue";
import BarActionCluster from "./BarActionCluster.vue";
import PluginStatusbarItems from "./PluginStatusbarItems.vue";
import ScreenDots from "./ui/ScreenDots.vue";
import { clockBarPartSizePx } from "@/utils/clockBarDesign";

// Draws one part from the resolved design. Both bar shapes share it, so a part
// looks the same wherever the editor drops it; the bar component owns the chip
// wrapper and the zones.
defineOptions({ name: "ClockBarPartContent" });

const props = defineProps({
  partId: { type: String, required: true },
  shape: { type: String, required: true },
  design: { type: Object, required: true },
  timeText: { type: String, default: "" },
  dateText: { type: String, default: "" },
  compactTimeParts: { type: Object, default: () => ({}) },
  compactDateParts: { type: Object, default: null },
  roomText: { type: String, default: "" },
  screens: { type: Array, default: () => [] },
  activeScreenId: { type: String, default: null },
  sample: { type: Boolean, default: false },
});

defineEmits(["select-screen"]);

const isTile = computed(() => props.partId.startsWith("tile:"));
const instanceId = computed(() => (isTile.value ? props.partId.slice("tile:".length) : null));
const shapeState = computed(() => props.design[props.shape]);

const timeSize = computed(() => clockBarPartSizePx(props.design, props.shape, "time"));
const dateSize = computed(() => clockBarPartSizePx(props.design, props.shape, "date"));
const tileSize = computed(() => clockBarPartSizePx(props.design, props.shape, "tile:any"));

const stackedTime = computed(
  () => props.shape === "vertical" && shapeState.value?.parts?.time?.style === "stacked"
);
const stackedDate = computed(
  () => props.shape === "vertical" && shapeState.value?.parts?.date?.style === "stacked"
);
// compact-time's date is the same vertical line today; compact-time-date stacks
// weekday / day month / year.
const stackedDateLine = computed(
  () => props.shape === "vertical" && stackedTime.value && !stackedDate.value
);

const sampleScreens = [
  { id: "sample-1", name: "Page 1" },
  { id: "sample-2", name: "Page 2" },
];
const dotsScreens = computed(() => (props.sample ? sampleScreens : props.screens));
</script>

<style scoped>
.clock-bar-room {
  font-family: var(--font-ui);
  color: var(--ink-3);
  font-size: var(--text-body);
}

.clock-time {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums lining-nums;
  font-weight: var(--weight-title);
  color: var(--ink);
  line-height: 1.1;
  white-space: nowrap;
}

.clock-date {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--ink-2);
  line-height: 1.1;
  white-space: nowrap;
}

.compact-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  line-height: 0.92;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
