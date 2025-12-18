<template>
  <div
    ref="eventItemRef"
    class="event-item"
    :class="{
      focused: isFocused,
      selected: isSelected,
      'event-start': event._isStart,
      'event-end': event._isEnd,
      'event-middle': event._isMiddle,
      'event-multi-day': event._isMultiDay,
    }"
    :style="{ backgroundColor: eventColor }"
    :title="eventTitle"
    tabindex="0"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space.prevent="handleClick"
    @focus="handleFocus"
  >
    <span v-if="showFullText" class="event-text">
      {{ displayText }}
    </span>
    <span v-else class="event-continuation">
      <span class="continuation-arrow">←</span>
      <span class="continuation-text">{{ truncatedTitle }}</span>
    </span>
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
  dayIndex: {
    type: Number,
    required: true,
  },
  eventIndex: {
    type: Number,
    required: true,
  },
  dayDate: {
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

const {
  getEventColor,
  getEventTitle,
  getEventDisplayText,
  truncateEventTitle,
} = useEventHelpers();

const eventItemRef = ref(null);

defineExpose({
  focus: () => {
    if (eventItemRef.value) {
      eventItemRef.value.focus();
    }
  },
});

// Computed properties
const eventColor = computed(() => getEventColor(props.event));
const eventTitle = computed(() => getEventTitle(props.event));
const displayText = computed(() => getEventDisplayText(props.event));
const truncatedTitle = computed(() =>
  truncateEventTitle(props.event.title, 15),
);

// Show full text for start events or single-day events
const showFullText = computed(
  () => props.event._isStart || !props.event._isMultiDay,
);

// Event handlers
const handleClick = () => {
  emit("click", props.event, props.dayDate);
};

const handleFocus = () => {
  emit("focus", props.dayIndex, props.eventIndex);
};
</script>

<style scoped>
.event-item {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: clamp(2px, 0.3vw, 4px);
  color: #fff;
  white-space: normal;
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  overflow: hidden;
  overflow-x: clip; /* Prevent horizontal overflow from long event names */
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  outline: none;
  position: relative;
  flex-shrink: 0;
  flex-grow: 0;
  max-width: 100%;
  width: 100%; /* Ensure event items don't exceed cell width */
  box-sizing: border-box;
  line-height: 1.3;
  /* Allow event text to wrap and expand vertically when space is available */
  /* The parent container will naturally limit the height */
}

/* Multi-day events get special styling via event-start, event-end, event-middle classes */

.event-item.event-start {
  border-top-left-radius: clamp(2px, 0.3vw, 4px);
  border-bottom-left-radius: clamp(2px, 0.3vw, 4px);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  margin-right: calc(-1 * clamp(0.05rem, 0.2vw, 0.1rem));
  z-index: 1;
  border-right: 1px dashed rgba(255, 255, 255, 0.3);
}

.event-item.event-end {
  border-top-right-radius: clamp(2px, 0.3vw, 4px);
  border-bottom-right-radius: clamp(2px, 0.3vw, 4px);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: calc(-1 * clamp(0.05rem, 0.2vw, 0.1rem));
  z-index: 1;
  border-left: 1px dashed rgba(255, 255, 255, 0.3);
}

.event-item.event-middle {
  border-radius: 0;
  margin-left: calc(-1 * clamp(0.05rem, 0.2vw, 0.1rem));
  margin-right: calc(-1 * clamp(0.05rem, 0.2vw, 0.1rem));
  z-index: 1;
  border-left: 1px dashed rgba(255, 255, 255, 0.3);
  border-right: 1px dashed rgba(255, 255, 255, 0.3);
}

.event-continuation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 100%;
  font-size: inherit;
  opacity: 0.9;
  padding: 0;
  line-height: inherit;
}

.continuation-arrow {
  font-size: 1em;
  opacity: 0.7;
  flex-shrink: 0;
  line-height: inherit;
}

.continuation-text {
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  white-space: normal;
  flex: 1;
  text-align: left;
  font-weight: 500;
  line-height: inherit;
  font-size: inherit;
}

.event-text {
  display: inline;
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

.event-item:hover {
  opacity: 0.9;
  transform: scale(1.02);
}

.event-item:focus {
  outline: 2px solid #fff; /* Keep white for contrast on colored event backgrounds */
  outline-offset: -2px;
  border-color: #fff; /* Keep white for contrast on colored event backgrounds */
  box-shadow: 0 0 0 2px var(--accent-primary);
  z-index: 10;
  position: relative;
}

.event-item.focused {
  outline: 2px solid #fff; /* Keep white for contrast on colored event backgrounds */
  outline-offset: -2px;
  border-color: #fff; /* Keep white for contrast on colored event backgrounds */
  box-shadow: 0 0 0 2px var(--accent-primary);
  z-index: 10;
  position: relative;
}

.event-item.event-start.focused,
.event-item.event-end.focused,
.event-item.event-middle.focused {
  z-index: 11;
}

.event-item.selected {
  border: 2px solid #fff;
  box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.8);
}

/* Responsive styles for smaller screens and portrait mode */
@media (max-width: 768px), (orientation: portrait) {
  .event-item {
    font-size: clamp(0.55rem, 1.5vw, 0.75rem);
    padding: clamp(0.1rem, 0.5vw, 0.25rem) clamp(0.2rem, 0.75vw, 0.5rem);
    line-height: 1.2;
  }

  .event-continuation {
    gap: clamp(0.1rem, 0.3vw, 0.25rem);
  }

  .event-item.event-start {
    margin-right: calc(-1 * clamp(0.03rem, 0.15vw, 0.08rem));
  }

  .event-item.event-end {
    margin-left: calc(-1 * clamp(0.03rem, 0.15vw, 0.08rem));
  }

  .event-item.event-middle {
    margin-left: calc(-1 * clamp(0.03rem, 0.15vw, 0.08rem));
    margin-right: calc(-1 * clamp(0.03rem, 0.15vw, 0.08rem));
  }
}

/* Extra small screens - more aggressive scaling */
@media (max-width: 480px) {
  .event-item {
    font-size: clamp(0.5rem, 1.8vw, 0.65rem);
    padding: clamp(0.05rem, 0.5vw, 0.15rem) clamp(0.15rem, 0.75vw, 0.35rem);
  }

  .event-continuation {
    gap: clamp(0.05rem, 0.25vw, 0.15rem);
  }

  .event-item.event-start {
    margin-right: calc(-1 * clamp(0.02rem, 0.1vw, 0.05rem));
  }

  .event-item.event-end {
    margin-left: calc(-1 * clamp(0.02rem, 0.1vw, 0.05rem));
  }

  .event-item.event-middle {
    margin-left: calc(-1 * clamp(0.02rem, 0.1vw, 0.05rem));
    margin-right: calc(-1 * clamp(0.02rem, 0.1vw, 0.05rem));
  }
}

/* Portrait mode with limited height - ensure everything fits */
@media (orientation: portrait) and (max-height: 800px) {
  .event-item {
    font-size: clamp(0.5rem, 1.8vh, 0.65rem);
    padding: clamp(0.05rem, 0.5vh, 0.15rem) clamp(0.15rem, 0.75vh, 0.35rem);
  }

  .event-continuation {
    gap: clamp(0.05rem, 0.25vh, 0.15rem);
  }

  .event-item.event-start {
    margin-right: calc(-1 * clamp(0.02rem, 0.1vh, 0.05rem));
  }

  .event-item.event-end {
    margin-left: calc(-1 * clamp(0.02rem, 0.1vh, 0.05rem));
  }

  .event-item.event-middle {
    margin-left: calc(-1 * clamp(0.02rem, 0.1vh, 0.05rem));
    margin-right: calc(-1 * clamp(0.02rem, 0.1vh, 0.05rem));
  }
}

/* Very small portrait screens - maximum compression */
@media (orientation: portrait) and (max-height: 600px) {
  .event-item {
    font-size: 0.5rem;
    padding: 0.05rem 0.15rem;
  }

  .event-continuation {
    gap: 0.05rem;
  }

  .event-item.event-start {
    margin-right: -0.02rem;
  }

  .event-item.event-end {
    margin-left: -0.02rem;
  }

  .event-item.event-middle {
    margin-left: -0.02rem;
    margin-right: -0.02rem;
  }
}
</style>
