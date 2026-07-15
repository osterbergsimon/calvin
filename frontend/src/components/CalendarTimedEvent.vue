<template>
  <div
    ref="rowRef"
    class="timed-event"
    :class="{ focused: isFocused, selected: isSelected }"
    :title="eventTitle"
    tabindex="0"
    role="button"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
    @focus="handleFocus"
  >
    <span class="timed-dot" :style="{ backgroundColor: eventColor }" aria-hidden="true"></span>
    <span v-if="startTime" class="timed-time">{{ startTime }}</span>
    <span class="timed-title">{{ event.title }}</span>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useEventHelpers } from "../composables/useEventHelpers";

const props = defineProps({
  event: {
    type: Object,
    required: true,
  },
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

const { getEventColor, getEventTitle, formatEventStartTime } = useEventHelpers();

const rowRef = ref(null);
defineExpose({
  focus: () => rowRef.value?.focus(),
});

const eventColor = computed(() => getEventColor(props.event));
const eventTitle = computed(() => getEventTitle(props.event));
const startTime = computed(() => formatEventStartTime(props.event));

const handleClick = () => emit("click", props.event, props.date);
const handleFocus = () => emit("focus", props.event, props.date);
</script>

<style scoped>
.timed-event {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.05rem 0.1rem;
  font-family: var(--font-display);
  font-size: 0.72rem;
  line-height: 1.25;
  color: var(--ink);
  cursor: pointer;
  outline: none;
  border-radius: 3px;
  box-sizing: border-box;
}

.timed-dot {
  flex-shrink: 0;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  align-self: center;
}

.timed-time {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-size: 0.6rem;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.timed-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timed-event:hover {
  background: var(--bg-2);
}

.timed-event:focus,
.timed-event.focused,
.timed-event.selected {
  box-shadow: 0 0 0 2px var(--focus);
  z-index: 5;
}
</style>
