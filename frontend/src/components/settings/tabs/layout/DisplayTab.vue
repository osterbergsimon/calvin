<template>
  <div class="display-tab">
    <CollapsibleSection title="Screen Orientation" icon="🖥️">
      <SettingItem label="Orientation" help="Screen orientation">
        <select
          :model-value="config.orientation"
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
            :checked="config.orientationFlipped"
            type="checkbox"
            @change="handleOrientationFlippedChange"
          />
          Flip Orientation
        </label>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Layout" icon="📐">
      <SettingItem
        label="Calendar Split (%)"
        help="Calendar width percentage (10-90%)"
      >
        <input
          :model-value="config.calendarSplit"
          type="number"
          min="10"
          max="90"
          @change="handleCalendarSplitChange"
        />
      </SettingItem>

      <SettingItem
        label="Side View Position"
        :help="
          config.orientation === 'landscape'
            ? 'Position of side view (left or right of calendar)'
            : 'Position of side view (top or bottom of calendar)'
        "
      >
        <select
          :model-value="config.sideViewPosition"
          @change="handleSideViewPositionChange"
        >
          <option v-if="config.orientation === 'landscape'" value="left">
            Left
          </option>
          <option v-if="config.orientation === 'landscape'" value="right">
            Right
          </option>
          <option v-if="config.orientation === 'portrait'" value="top">
            Top
          </option>
          <option v-if="config.orientation === 'portrait'" value="bottom">
            Bottom
          </option>
        </select>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const handleOrientationChange = (event) => {
  emit("update:config", { orientation: event.target.value });
};

const handleOrientationFlippedChange = (event) => {
  emit("update:config", { orientationFlipped: event.target.checked });
};

const handleCalendarSplitChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { calendarSplit: value });
  }
};

const handleSideViewPositionChange = (event) => {
  emit("update:config", { sideViewPosition: event.target.value });
};
</script>

<style scoped>
.display-tab {
  width: 100%;
}
</style>
