<template>
  <div class="font-size-picker">
    <div class="font-size-controls">
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="localValue"
        @input="handleInput"
        class="font-size-slider"
      />
      <div class="font-size-display">
        <input
          type="number"
          :min="min"
          :max="max"
          :step="step"
          :value="localValue"
          @input="handleInput"
          class="font-size-input"
        />
        <span class="font-size-unit">px</span>
      </div>
    </div>
    <div
      class="font-size-preview"
      :class="{ 'preview-vertical': isVertical }"
      :style="previewStyle"
    >
      <div class="preview-time" :style="timeStyle">{{ previewTime }}</div>
      <div
        v-if="showDate || (!isDatePicker && configStore.clockShowDate)"
        class="preview-date"
        :style="dateStyle"
      >
        {{ previewDate }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { useConfigStore } from "@/stores/config";

const configStore = useConfigStore();

const props = defineProps({
  modelValue: {
    type: [Number, String],
    required: true,
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
  fontFamily: {
    type: String,
    default: "Courier New, monospace",
  },
  showDate: {
    type: Boolean,
    default: false,
  },
  isVertical: {
    type: Boolean,
    default: false,
  },
  isDatePicker: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

// Local reactive value for immediate preview updates
const localValue = ref(Number(props.modelValue) || 16);

// Sync local value with prop changes
watch(
  () => props.modelValue,
  newValue => {
    const numValue = Number(newValue);
    if (!isNaN(numValue)) {
      localValue.value = numValue;
    }
  },
  { immediate: true }
);

// Handler for both slider and number input
// For number inputs, we debounce the emit to reduce API calls during typing
const handleInputDebounced = useDebounceFn(clampedValue => {
  emit("update:modelValue", clampedValue);
}, 200);

const handleInput = event => {
  if (!event?.target) return;

  const value = parseFloat(event.target.value);
  if (!isNaN(value)) {
    // Clamp value to min/max
    const clampedValue = Math.max(props.min, Math.min(props.max, value));
    localValue.value = clampedValue;

    // For slider (range), emit immediately for responsive UI
    // For number input, debounce the emit to reduce rapid API calls
    if (event.target.type === "range") {
      emit("update:modelValue", clampedValue);
    } else {
      handleInputDebounced(clampedValue);
    }
  }
};

const previewStyle = computed(() => {
  const baseStyle = {
    fontFamily: props.fontFamily,
  };
  if (props.isVertical) {
    baseStyle.writingMode = "vertical-rl";
    baseStyle.textOrientation = "upright";
  }
  return baseStyle;
});

// Use the explicit prop to determine if this is a date font size picker
const isDatePicker = computed(() => props.isDatePicker);

const timeStyle = computed(() => {
  if (isDatePicker.value) {
    // When picking date size, show time at a default size (1.14x the date size)
    return {
      fontSize: `${Math.round(localValue.value * 1.14)}px`,
    };
  }
  // When picking time size, show time at selected size
  return {
    fontSize: `${localValue.value}px`,
  };
});

const dateStyle = computed(() => {
  if (isDatePicker.value) {
    // When picking date size, show date at selected size
    return {
      fontSize: `${localValue.value}px`,
    };
  }
  // When picking time size, show date at a smaller size (0.875x the time size)
  return {
    fontSize: `${Math.round(localValue.value * 0.875)}px`,
  };
});

const previewTime = computed(() => {
  const now = new Date();
  return now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
});

const previewDate = computed(() => {
  if (!props.showDate) return "";
  const now = new Date();
  return now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
});
</script>

<style scoped>
.font-size-picker {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.font-size-controls {
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

.font-size-preview {
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  text-align: center;
  color: var(--text-primary);
  min-height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.preview-time {
  font-weight: 600;
  line-height: 1.2;
  font-size: inherit;
}

.preview-date {
  color: var(--text-secondary);
  opacity: 0.8;
  font-size: inherit;
}

.preview-vertical {
  writing-mode: vertical-rl;
  text-orientation: upright;
  flex-direction: row;
  gap: 0.5rem;
}
</style>
