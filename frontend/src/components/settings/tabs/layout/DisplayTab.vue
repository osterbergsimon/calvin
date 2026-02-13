<template>
  <div class="display-tab">
    <CollapsibleSection title="Screen Orientation" icon="🖥️">
      <SettingItem label="Orientation" help="Screen orientation">
        <select
          :value="configValue.orientation"
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
    </CollapsibleSection>

    <CollapsibleSection title="Layout" icon="📐">
      <SettingItem
        label="Calendar Split (%)"
        help="Calendar width percentage (10-90%)"
      >
        <input
          :value="configValue.calendarSplit"
          type="number"
          min="10"
          max="90"
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
      >
        <select
          :value="configValue.sideViewPosition"
          @change="handleSideViewPositionChange"
        >
          <option v-if="configValue.orientation === 'landscape'" value="left">
            Left
          </option>
          <option v-if="configValue.orientation === 'landscape'" value="right">
            Right
          </option>
          <option v-if="configValue.orientation === 'portrait'" value="top">
            Top
          </option>
          <option v-if="configValue.orientation === 'portrait'" value="bottom">
            Bottom
          </option>
        </select>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Calendar" icon="📅">
      <SettingItem
        label="Week Start Day"
        help="First day of the week in calendar view"
      >
        <select
          :value="configValue.weekStartDay"
          @change="handleWeekStartDayChange"
        >
          <option :value="0">Sunday</option>
          <option :value="1">Monday</option>
          <option :value="2">Tuesday</option>
          <option :value="3">Wednesday</option>
          <option :value="4">Thursday</option>
          <option :value="5">Friday</option>
          <option :value="6">Saturday</option>
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

// Ensure config values are reactive and have defaults
const configValue = computed(() => {
  const config = props.config || {};
  return {
    orientation: config.orientation ?? "landscape",
    orientationFlipped: config.orientationFlipped ?? false,
    calendarSplit: config.calendarSplit ?? 70,
    sideViewPosition: config.sideViewPosition ?? "right",
    weekStartDay: config.weekStartDay ?? 1,
  };
});

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

const handleWeekStartDayChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { weekStartDay: value });
  }
};
</script>

<style scoped>
.display-tab {
  width: 100%;
}
</style>
