<template>
  <div class="clock-bar-font-size-picker">
    <div class="font-size-controls">
      <div class="control-group">
        <span class="control-label">Time Font Size</span>
        <RangeSlider
          :model-value="localTimeSize"
          :min="min"
          :max="max"
          :step="step"
          unit="px"
          aria-label="Time Font Size"
          @update:model-value="setTimeSize"
        />
      </div>

      <div v-if="showDate" class="control-group">
        <span class="control-label">Date Font Size</span>
        <RangeSlider
          :model-value="localDateSize"
          :min="min"
          :max="max"
          :step="step"
          unit="px"
          aria-label="Date Font Size"
          @update:model-value="setDateSize"
        />
      </div>

      <div class="control-group">
        <span class="control-label">Bar Padding</span>
        <RangeSlider
          :model-value="localPadding"
          :min="0"
          :max="32"
          :step="1"
          unit="px"
          aria-label="Bar Padding"
          @update:model-value="setPadding"
        />
      </div>

      <div class="control-group">
        <span class="control-label">Plugin Item Size</span>
        <RangeSlider
          :model-value="localPluginItemSize"
          :min="min"
          :max="max"
          :step="step"
          unit="px"
          aria-label="Plugin Item Size"
          @update:model-value="setPluginItemSize"
        />
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
          :preview-plugin-item-size="localPluginItemSize"
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
          :preview-plugin-item-size="localPluginItemSize"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import ClockBarVertical from "@/components/ClockBarVertical.vue";
import RangeSlider from "@/components/ui/RangeSlider.vue";

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
  pluginItemSize: {
    type: Number,
    default: 16,
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
  "update:pluginItemSize",
]);

// Local reactive values for immediate updates
const localTimeSize = ref(props.timeSize);
const localDateSize = ref(props.dateSize);
const localPadding = ref(props.padding);
const localPluginItemSize = ref(props.pluginItemSize);

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

watch(
  () => props.pluginItemSize,
  newValue => {
    localPluginItemSize.value = newValue;
  },
  { immediate: true }
);

// RangeSlider clamps to its own min/max before emitting.
const setTimeSize = value => {
  localTimeSize.value = value;
  emit("update:timeSize", value);
};

const setDateSize = value => {
  localDateSize.value = value;
  emit("update:dateSize", value);
};

const setPadding = value => {
  localPadding.value = value;
  emit("update:padding", value);
};

const setPluginItemSize = value => {
  localPluginItemSize.value = value;
  emit("update:pluginItemSize", value);
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
  font-size: var(--text-body);
  font-family: var(--font-ui);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.preview-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-label {
  font-size: var(--text-body);
  font-family: var(--font-ui);
  font-weight: var(--weight-strong);
  color: var(--ink-2);
}

.preview-wrapper {
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
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
