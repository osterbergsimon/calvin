<template>
  <div class="clock-settings-tab">
    <CollapsibleSection title="Status Bar" icon="🕐" :expanded="true">
      <SettingItem label="Show Date" help="Display the date alongside the time">
        <label>
          <input
            name="clockShowDate"
            :checked="config.clockShowDate"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show Date
        </label>
      </SettingItem>

      <SettingItem label="Show Seconds" help="Display seconds in the time (updates every second)">
        <label>
          <input
            name="clockShowSeconds"
            :checked="config.clockShowSeconds"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show Seconds
        </label>
      </SettingItem>

      <SettingItem label="Show Bar in Kiosk Mode" help="Display bar when UI is hidden">
        <label>
          <input
            name="clockBarShowInKiosk"
            :checked="config.clockBarShowInKiosk"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show in Kiosk Mode
        </label>
      </SettingItem>

      <SettingItem label="Bar Mode" help="Horizontal or vertical clock bar">
        <select
          name="clockBarMode"
          :value="config.clockBarMode"
          @change="handleClockSettingsChange"
        >
          <option value="horizontal">Horizontal Bar</option>
          <option value="vertical">Vertical Bar</option>
        </select>
      </SettingItem>

      <SettingItem label="Bar Position" :help="getBarPositionHelp()">
        <select
          name="clockBarPosition"
          :value="config.clockBarPosition"
          @change="handleClockSettingsChange"
        >
          <template v-if="config.clockBarMode === 'horizontal'">
            <option value="top">Top Header</option>
            <option value="bottom">Bottom Bar</option>
            <option value="between" :disabled="config.orientation !== 'portrait'">
              Between Calendar/Side View (Portrait Only)
            </option>
          </template>
          <template v-else>
            <option value="left">Far Left</option>
            <option value="right">Far Right</option>
            <option value="between" :disabled="config.orientation !== 'landscape'">
              Between Calendar/Side View (Landscape Only)
            </option>
          </template>
        </select>
      </SettingItem>

      <SettingItem label="Bar Layout" help="Display clock and date on one line or two lines">
        <select
          name="clockBarLayout"
          :value="config.clockBarLayout || 'single-line'"
          @change="handleClockSettingsChange"
        >
          <option value="single-line">Single Line</option>
          <option value="two-lines">Two Lines</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Font Sizes"
        help="Adjust font sizes for time and date. Preview shows how the bar will look."
      >
        <ClockBarFontSizePicker
          :time-size="config.clockBarFontSize || 16"
          :date-size="config.clockBarDateFontSize || 14"
          :layout="config.clockBarLayout || 'single-line'"
          :padding="config.clockBarPadding || 8"
          :show-date="config.clockShowDate"
          :is-vertical="config.clockBarMode === 'vertical'"
          @update:time-size="handleBarFontSizeChange"
          @update:date-size="handleBarDateFontSizeChange"
          @update:padding="handleBarPaddingChange"
        />
      </SettingItem>

      <SettingItem
        label="Show Weather in Bar"
        help="Display current temperature and weather icon (requires a weather service to be configured)"
      >
        <label>
          <input
            name="clockBarShowWeather"
            :checked="config.clockBarShowWeather"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show Weather in Bar
        </label>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
import ClockBarFontSizePicker from "../../shared/ClockBarFontSizePicker.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const handleClockSettingsChange = event => {
  const field = event.target.name || event.target.id;
  if (!field) {
    console.warn("Clock setting change event missing field name/id");
    return;
  }

  const updates = {};
  if (event.target.type === "checkbox") {
    updates[field] = event.target.checked;
  } else {
    updates[field] = event.target.value;
  }
  emit("update:config", updates);
};

const getBarPositionHelp = () => {
  if (props.config.clockBarMode === "horizontal") {
    return "Position for horizontal bar. 'Between' only works in portrait mode.";
  }
  return "Position for vertical bar. 'Between' only works in landscape mode.";
};

const handleBarFontSizeChange = px => {
  emit("update:config", { clockBarFontSize: px });
};

const handleBarDateFontSizeChange = px => {
  emit("update:config", { clockBarDateFontSize: px });
};

const handleBarPaddingChange = px => {
  emit("update:config", { clockBarPadding: px });
};
</script>

<style scoped>
.clock-settings-tab {
  width: 100%;
}
</style>
