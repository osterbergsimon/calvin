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
            :value="timeSize"
            @input="handleTimeInput"
            class="font-size-slider"
          />
          <div class="font-size-display">
            <input
              type="number"
              :min="min"
              :max="max"
              :step="step"
              :value="timeSize"
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
            :value="dateSize"
            @input="handleDateInput"
            class="font-size-slider"
          />
          <div class="font-size-display">
            <input
              type="number"
              :min="min"
              :max="max"
              :step="step"
              :value="dateSize"
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

    <div class="preview-container">
      <div class="preview-label">Preview:</div>
      <!-- Use actual clock bar component for preview -->
      <div v-if="isVertical" class="preview-wrapper preview-vertical">
        <ClockBarVertical
          position="left"
          :show-in-non-kiosk="true"
          :show-in-kiosk="false"
          :enabled="true"
          :preview-mode="true"
          :preview-time-size="timeSize"
          :preview-date-size="dateSize"
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
          :preview-time-size="timeSize"
          :preview-date-size="dateSize"
          :preview-layout="layout"
          :preview-padding="localPadding"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import ClockBarVertical from "@/components/ClockBarVertical.vue";
import { useConfigStore } from "@/stores/config";

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

const emit = defineEmits([
  "update:timeSize",
  "update:dateSize",
  "update:padding",
]);

const configStore = useConfigStore();

// Local reactive values for immediate updates
const localTimeSize = ref(props.timeSize);
const localDateSize = ref(props.dateSize);
const localPadding = ref(props.padding);

// Sync with props
watch(
  () => props.timeSize,
  (newValue) => {
    localTimeSize.value = newValue;
  },
  { immediate: true },
);

watch(
  () => props.dateSize,
  (newValue) => {
    localDateSize.value = newValue;
  },
  { immediate: true },
);

watch(
  () => props.padding,
  (newValue) => {
    localPadding.value = newValue;
  },
  { immediate: true },
);

const handleTimeInput = (event) => {
  const value = parseFloat(event.target.value);
  if (!isNaN(value)) {
    const clampedValue = Math.max(props.min, Math.min(props.max, value));
    localTimeSize.value = clampedValue;
    emit("update:timeSize", clampedValue);
  }
};

const handleDateInput = (event) => {
  const value = parseFloat(event.target.value);
  if (!isNaN(value)) {
    const clampedValue = Math.max(props.min, Math.min(props.max, value));
    localDateSize.value = clampedValue;
    emit("update:dateSize", clampedValue);
  }
};

const handlePaddingInput = (event) => {
  const value = parseFloat(event.target.value);
  if (!isNaN(value)) {
    const clampedValue = Math.max(0, Math.min(32, value));
    localPadding.value = clampedValue;
    emit("update:padding", clampedValue);
  }
};

// Use local values for preview
const timeSize = computed(() => localTimeSize.value);
const dateSize = computed(() => localDateSize.value);
</script>

<style scoped>
.clock-bar-font-size-picker {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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
  font-weight: 500;
  color: var(--text-primary);
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
  background: var(--bg-secondary);
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
  background: var(--accent-primary);
  cursor: pointer;
  border: 2px solid var(--bg-primary);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.font-size-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-primary);
  cursor: pointer;
  border: 2px solid var(--bg-primary);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  text-align: center;
}

.font-size-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.font-size-unit {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.preview-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.preview-wrapper {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  overflow: hidden;
}

.preview-horizontal {
  width: 100%;
  min-height: 60px;
}

.preview-vertical {
  width: auto;
  min-width: fit-content;
  height: 200px;
  display: flex;
  align-items: stretch;
  overflow: hidden;
}
</style>
