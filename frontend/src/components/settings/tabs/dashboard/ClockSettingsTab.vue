<template>
  <div class="clock-settings-tab">
    <CollapsibleSection title="Clock Settings" icon="🕐" :expanded="true">
      <SettingItem
        label="Show Date in Clock"
        help="Display date in clock (applies to both widget and bar)"
      >
        <label>
          <input
            name="clockShowDate"
            :checked="config.clockShowDate"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show Date in Clock
        </label>
      </SettingItem>

      <SettingItem
        label="Show Seconds in Clock"
        help="Display seconds in the time (updates every second)"
      >
        <label>
          <input
            name="clockShowSeconds"
            :checked="config.clockShowSeconds"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show Seconds in Clock
        </label>
      </SettingItem>

      <SettingItem label="Enable Clock Widget" help="Show floating clock widget on dashboard">
        <label>
          <input
            name="clockWidgetEnabled"
            :checked="config.clockWidgetEnabled"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Enable Clock Widget
        </label>
      </SettingItem>

      <template v-if="config.clockWidgetEnabled">
        <SettingItem label="Show Widget in Kiosk Mode" help="Display widget when UI is hidden">
          <label>
            <input
              name="clockWidgetShowInKiosk"
              :checked="config.clockWidgetShowInKiosk"
              type="checkbox"
              @change="handleClockSettingsChange"
            />
            Show in Kiosk Mode
          </label>
        </SettingItem>

        <SettingItem label="Widget Position" help="Position of the clock widget">
          <select
            name="clockWidgetPosition"
            :value="config.clockWidgetPosition"
            @change="handleClockSettingsChange"
          >
            <option value="top-left">Top Left</option>
            <option value="top-center">Top Center</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-center">Bottom Center</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </SettingItem>

        <SettingItem label="Widget Font Size" help="Font size for the clock widget (in pixels)">
          <FontSizePicker
            :model-value="getWidgetFontSize()"
            :show-date="config.clockShowDate"
            @update:model-value="handleWidgetFontSizeChange"
          />
        </SettingItem>
      </template>

      <SettingItem
        label="Enable Clock Bar"
        help="Show clock as a status bar (horizontal or vertical)"
      >
        <label>
          <input
            name="clockBarEnabled"
            :checked="config.clockBarEnabled"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Enable Clock Bar
        </label>
      </SettingItem>

      <template v-if="config.clockBarEnabled">
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

        <SettingItem label="Show Bar in Non-Kiosk Mode" help="Display bar when UI is visible">
          <label>
            <input
              name="clockBarShowInNonKiosk"
              :checked="config.clockBarShowInNonKiosk"
              type="checkbox"
              @change="handleClockSettingsChange"
            />
            Show in Non-Kiosk Mode
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
      </template>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
import FontSizePicker from "../../shared/FontSizePicker.vue";
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

const sizeToPixels = {
  small: 12,
  medium: 16,
  large: 20,
};

const pixelsToSize = px => {
  const sizes = Object.entries(sizeToPixels);
  const closest = sizes.reduce((prev, curr) => {
    return Math.abs(curr[1] - px) < Math.abs(prev[1] - px) ? curr : prev;
  });
  return closest[0];
};

const getWidgetFontSize = () => {
  return sizeToPixels[props.config.clockSize] || 16;
};

const handleWidgetFontSizeChange = px => {
  const size = pixelsToSize(px);
  emit("update:config", { clockSize: size });
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
