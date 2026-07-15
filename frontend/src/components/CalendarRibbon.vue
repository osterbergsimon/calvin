<template>
  <div
    ref="ribbonRef"
    class="ribbon"
    :class="{
      focused: isFocused,
      selected: isSelected,
      'continues-left': ribbon.continuesLeft,
      'continues-right': ribbon.continuesRight,
    }"
    :style="ribbonStyle"
    :title="eventTitle"
    tabindex="0"
    role="button"
    :aria-label="ariaLabel"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
    @focus="handleFocus"
  >
    <span v-if="ribbon.continuesLeft" class="ribbon-chevron" aria-hidden="true">‹</span>
    <span class="ribbon-title">{{ ribbon.event.title }}</span>
    <span v-if="durationLabel" class="ribbon-duration">{{ durationLabel }}</span>
    <span v-if="ribbon.continuesRight" class="ribbon-chevron ribbon-chevron--end" aria-hidden="true"
      >›</span
    >
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useEventHelpers } from "../composables/useEventHelpers";

const props = defineProps({
  // A week segment from useMonthLayout: { event, startCol, span, lane,
  // continuesLeft, continuesRight }.
  ribbon: {
    type: Object,
    required: true,
  },
  // The date of the segment's first covered day — used when opening the event.
  date: {
    type: Date,
    required: true,
  },
  isFocused: {
    type: Boolean,
    default: false,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["click", "focus"]);

const { getEventColor, getEventTitle } = useEventHelpers();

const ribbonRef = ref(null);
defineExpose({
  focus: () => ribbonRef.value?.focus(),
});

const eventColor = computed(() => getEventColor(props.ribbon.event));
const eventTitle = computed(() => getEventTitle(props.ribbon.event));

// Place the bar across its day columns and lane. Columns are 1-based in CSS
// grid; the band grid starts at the first day column, so startCol maps directly.
const ribbonStyle = computed(() => ({
  gridColumn: `${props.ribbon.startCol + 1} / span ${props.ribbon.span}`,
  gridRow: `${props.ribbon.lane + 1}`,
  "--ribbon-hue": eventColor.value,
}));

// A duration tag is only honest when the whole event lives inside this week —
// otherwise its true length runs off-screen and we let the chevron say so.
const durationLabel = computed(() => {
  if (props.ribbon.continuesLeft || props.ribbon.continuesRight) return "";
  if (props.ribbon.span === 1) return props.ribbon.event.all_day ? "all day" : "";
  return `${props.ribbon.span} days`;
});

const ariaLabel = computed(() => {
  const parts = [props.ribbon.event.title];
  if (durationLabel.value) parts.push(durationLabel.value);
  if (props.ribbon.continuesLeft) parts.push("continues from earlier");
  if (props.ribbon.continuesRight) parts.push("continues");
  return parts.join(", ");
});

const handleClick = () => emit("click", props.ribbon.event, props.date);
const handleFocus = () => emit("focus", props.ribbon);
</script>

<style scoped>
.ribbon {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  height: 100%;
  min-width: 0;
  padding: 0 0.5rem;
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
  /* Tinted glass, not paint: the source hue reads as a wash with a solid edge. */
  background: color-mix(in srgb, var(--ribbon-hue) 26%, var(--bg-1));
  border: 1px solid color-mix(in srgb, var(--ribbon-hue) 55%, transparent);
  border-left: 3px solid var(--ribbon-hue);
  border-radius: 4px;
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

/* Endcaps carry the story: a squared, edge-bleeding end means the event runs
   past what you can see; a rounded end means it truly starts/ends here. */
.ribbon.continues-left {
  border-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: -1px;
  padding-left: 0.35rem;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 10px);
  mask-image: linear-gradient(90deg, transparent 0, #000 10px);
}

.ribbon.continues-right {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  margin-right: -1px;
  padding-right: 0.35rem;
}

.ribbon-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ribbon-duration {
  margin-left: auto;
  flex-shrink: 0;
  font-family: var(--font-data);
  font-size: 0.58rem;
  letter-spacing: 0.02em;
  color: var(--ink-2);
}

.ribbon-chevron {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--ribbon-hue);
  opacity: 0.9;
}

.ribbon-chevron--end {
  margin-left: auto;
}

.ribbon:hover {
  background: color-mix(in srgb, var(--ribbon-hue) 34%, var(--bg-1));
}

.ribbon:focus,
.ribbon.focused {
  box-shadow:
    inset 0 0 0 1px var(--bg-1),
    0 0 0 2px var(--focus);
  z-index: 5;
}

.ribbon.selected {
  box-shadow:
    inset 0 0 0 1px var(--bg-1),
    0 0 0 2px var(--focus);
}
</style>
