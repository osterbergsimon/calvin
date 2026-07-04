<template>
  <div class="clock-bar-font-size-picker">
    <div class="font-size-controls">
      <div class="control-group">
        <label class="control-label">Time Font Size</label>
        <div class="slider-group">
          <input
            type="range"
            :min="min"
            :max="max"
            :step="step"
            :value="localTimeSize"
            @input="handleTimeInput"
            class="font-size-slider"
          />
          <div class="font-size-display">
            <input
              type="number"
              :min="min"
              :max="max"
              :step="step"
              :value="localTimeSize"
              @input="handleTimeInput"
              class="font-size-input"
            />
            <span class="font-size-unit">px</span>
          </div>
        </div>
      </div>

      <div v-if="showDate" class="control-group">
        <label class="control-label">Date Font Size</label>
        <div class="slider-group">
          <input
            type="range"
            :min="min"
            :max="max"
            :step="step"
            :value="localDateSize"
            @input="handleDateInput"
            class="font-size-slider"
          />
          <div class="font-size-display">
            <input
              type="number"
              :min="min"
              :max="max"
              :step="step"
              :value="localDateSize"
              @input="handleDateInput"
              class="font-size-input"
            />
            <span class="font-size-unit">px</span>
          </div>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label">Bar Padding</label>
        <div class="slider-group">
          <input
            type="range"
            :min="0"
            :max="32"
            :step="1"
            :value="localPadding"
            @input="handlePaddingInput"
            class="font-size-slider"
          />
          <div class="font-size-display">
            <input
              type="number"
              :min="0"
              :max="32"
              :step="1"
              :value="localPadding"
              @input="handlePaddingInput"
              class="font-size-input"
            />
            <span class="font-size-unit">px</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPreview" class="preview-container">
      <div class="preview-label">Preview:</div>
      <!-- Use actual clock bar component for preview -->
      <div v-if="isVertical" class="preview-wrapper preview-vertical">
        <ClockBarVertical
          position="left"
          :show-in-non-kiosk="true"
          :show-in-kiosk="false"
          :enabled="true"
          :preview-mode="true"
          :preview-time-size="localTimeSize"
          :preview-date-size="localDateSize"
          :preview-layout="layout"
          :preview-padding="localPadding"
        />
      </div>
      <div v-else class="preview-wrapper preview-horizontal">
        <ClockBarHorizontal
          position="top"
          :show-in-non-kiosk="true"
          :show-in-kiosk="false"
          :enabled="true"
          :preview-mode="true"
          :preview-time-size="localTimeSize"
          :preview-date-size="localDateSize"
          :preview-layout="layout"
          :preview-padding="localPadding"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import ClockBarVertical from "@/components/ClockBarVertical.vue";

const props = defineProps({
  timeSize: {
    type: Number,
    required: true,
  },
  dateSize: {
    type: Number,
    required: true,
  },
  layout: {
    type: String,
    default: "single-line",
  },
  showDate: {
    type: Boolean,
    default: false,
  },
  isVertical: {
    type: Boolean,
    default: false,
  },
  showPreview: {
    type: Boolean,
    default: true,
  },
  padding: {
    type: Number,
    default: 8,
  },
  min: {
    type: Number,
    default: 8,
  },
  max: {
    type: Number,
    default: 72,
  },
  step: {
    type: Number,
    default: 1,
  },
});

const emit = defineEmits(["update:timeSize", "update:dateSize", "update:padding"]);

// Local reactive values for immediate updates
const localTimeSize = ref(props.timeSize);
const localDateSize = ref(props.dateSize);
const localPadding = ref(props.padding);

// Sync with props
watch(
  () => props.timeSize,
  newValue => {
    localTimeSize.value = newValue;
  },
  { immediate: true }
);

watch(
  () => props.dateSize,
  newValue => {
    localDateSize.value = newValue;
  },
  { immediate: true }
);

watch(
  () => props.padding,
  newValue => {
    localPadding.value = newValue;
  },
  { immediate: true }
);

const handleTimeInput = event => {
  const value = parseFloat(event.target.value);
  if (!isNaN(value)) {
    const clampedValue = Math.max(props.min, Math.min(props.max, value));
    localTimeSize.value = clampedValue;
    emit("update:timeSize", clampedValue);
  }
};

const handleDateInput = event => {
  const value = parseFloat(event.target.value);
  if (!isNaN(value)) {
    const clampedValue = Math.max(props.min, Math.min(props.max, value));
    localDateSize.value = clampedValue;
    emit("update:dateSize", clampedValue);
  }
};

const handlePaddingInput = event => {
  const value = parseFloat(event.target.value);
  if (!isNaN(value)) {
    const clampedValue = Math.max(0, Math.min(32, value));
    localPadding.value = clampedValue;
    emit("update:padding", clampedValue);
  }
};
</script>

<style scoped>
.clock-bar-font-size-picker {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  /* Never let the live preview's intrinsic width size this editor — otherwise
     dragging a slider grows the preview, which grows the container, which
     changes the slider length under the user's finger (calvin-hbp regression). */
  width: 100%;
  min-width: 0;
}

.font-size-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.875rem;
  font-family: var(--font-ui);
  font-weight: 500;
  color: var(--ink);
}

.slider-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.font-size-slider {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-2);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.font-size-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--focus);
  cursor: pointer;
  border: 2px solid var(--bg-1);
  box-shadow: 0 2px 4px var(--shadow);
}

.font-size-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--focus);
  cursor: pointer;
  border: 2px solid var(--bg-1);
  box-shadow: 0 2px 4px var(--shadow);
}

.font-size-slider:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.font-size-display {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 80px;
}

.font-size-input {
  width: 60px;
  padding: 0.375rem 0.5rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: var(--font-data);
  text-align: center;
}

.font-size-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-color: var(--focus);
}

.font-size-unit {
  font-size: 0.875rem;
  color: var(--ink-2);
}

.preview-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-label {
  font-size: 0.875rem;
  font-family: var(--font-ui);
  font-weight: 500;
  color: var(--ink-2);
}

.preview-wrapper {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--bg-1);
  overflow: hidden;
}

/* A top/bottom bar hugs its content height on a real screen, so the preview does
   too (no fixed height, no centering). Padding then grows the bar symmetrically and
   its bottom divider sits at the true edge — instead of the divider floating
   mid-box with dead space below it and padding appearing to only push downward. */
.preview-horizontal {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

/* A side bar fills screen height but hugs its width. Give the preview a
   representative height and hug the bar's width so the right divider sits at the
   true edge (no dead space beside it). align-self keeps the flex-column parent from
   stretching it; max-width keeps a fat bar from ever widening the editor (calvin-hbp). */
.preview-vertical {
  height: 200px;
  width: fit-content;
  max-width: 100%;
  align-self: flex-start;
  display: flex;
  overflow: hidden;
}
</style>
