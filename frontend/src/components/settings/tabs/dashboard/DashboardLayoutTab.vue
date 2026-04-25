<template>
  <div class="dashboard-layout-tab">
    <CollapsibleSection title="Screen Orientation" icon="🖥️">
      <SettingItem label="Orientation" help="Screen orientation" input-id="display-orientation">
        <select
          id="display-orientation"
          :value="configValue.orientation"
          aria-label="Screen orientation"
          @change="handleOrientationChange"
        >
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Flip Orientation (180°)"
        help="Rotate the display 180 degrees (useful for mounted displays)"
      >
        <label>
          <input
            :checked="configValue.orientationFlipped"
            type="checkbox"
            @change="handleOrientationFlippedChange"
          />
          Flip Orientation
        </label>
      </SettingItem>

      <SettingItem
        label="Apply Display Rotation (Raspberry Pi)"
        help="Physically rotate the display when orientation changes (RPi only)"
      >
        <label>
          <input
            :checked="configValue.applyDisplayRotation"
            type="checkbox"
            @change="handleApplyDisplayRotationChange"
          />
          Apply Display Rotation
        </label>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Layout" icon="📐">
      <SettingItem
        label="Calendar Split (%)"
        help="Calendar width percentage (10-90%)"
        input-id="calendar-split"
      >
        <input
          id="calendar-split"
          :value="configValue.calendarSplit"
          type="number"
          min="10"
          max="90"
          step="1"
          placeholder="70"
          aria-label="Calendar width percentage"
          @change="handleCalendarSplitChange"
        />
      </SettingItem>

      <SettingItem
        label="Side View Position"
        :help="
          configValue.orientation === 'landscape'
            ? 'Position of side view (left or right of calendar)'
            : 'Position of side view (top or bottom of calendar)'
        "
        input-id="side-view-position"
      >
        <select
          id="side-view-position"
          :value="configValue.sideViewPosition"
          aria-label="Side view position"
          @change="handleSideViewPositionChange"
        >
          <option v-if="configValue.orientation === 'landscape'" value="left">Left</option>
          <option v-if="configValue.orientation === 'landscape'" value="right">Right</option>
          <option v-if="configValue.orientation === 'portrait'" value="top">Top</option>
          <option v-if="configValue.orientation === 'portrait'" value="bottom">Bottom</option>
        </select>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { computed } from "vue";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

const emit = defineEmits(["update:config"]);

const configValue = computed(() => {
  const config = props.config || {};
  return {
    orientation: config.orientation ?? "landscape",
    orientationFlipped: config.orientationFlipped ?? false,
    applyDisplayRotation: config.applyDisplayRotation ?? true,
    calendarSplit: config.calendarSplit ?? 70,
    sideViewPosition: config.sideViewPosition ?? "right",
  };
});

const handleOrientationChange = event => {
  emit("update:config", { orientation: event.target.value });
};

const handleOrientationFlippedChange = event => {
  emit("update:config", { orientationFlipped: event.target.checked });
};

const handleApplyDisplayRotationChange = event => {
  emit("update:config", { applyDisplayRotation: event.target.checked });
};

const handleCalendarSplitChange = event => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    const clamped = Math.max(10, Math.min(90, value));
    emit("update:config", { calendarSplit: clamped });
  }
};

const handleSideViewPositionChange = event => {
  emit("update:config", { sideViewPosition: event.target.value });
};
</script>

<style scoped>
.dashboard-layout-tab {
  width: 100%;
}
</style>
