<template>
  <div class="clock-settings-tab">
    <CollapsibleSection title="Clock display" icon="🕐" :expanded="true">
      <SettingItem label="Show date" help="Display the date alongside the time">
        <label>
          <input
            name="clockShowDate"
            :checked="config.clockShowDate"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show date
        </label>
      </SettingItem>

      <SettingItem label="Show seconds" help="Updates the time every second">
        <label>
          <input
            name="clockShowSeconds"
            :checked="config.clockShowSeconds"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show seconds
        </label>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Default position" icon="📍" :expanded="true">
      <p class="section-hint">
        These are the defaults used when a screen doesn't specify its own clock bar position. To
        override on a specific screen — including dropping the bar into a gap between regions — open
        <strong>Screens</strong> in the Dashboard settings.
      </p>

      <SettingItem label="Bar mode" help="Horizontal bar (top/bottom) or vertical bar (left/right)">
        <select
          name="clockBarMode"
          :value="config.clockBarMode"
          @change="handleClockSettingsChange"
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </SettingItem>

      <SettingItem label="Bar position" :help="getBarPositionHelp()">
        <select
          name="clockBarPosition"
          :value="config.clockBarPosition"
          @change="handleClockSettingsChange"
        >
          <template v-if="config.clockBarMode === 'horizontal'">
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="between">Between regions (first gap)</option>
          </template>
          <template v-else>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="between">Between regions (first gap)</option>
          </template>
        </select>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Appearance" icon="🎨" :expanded="true">
      <SettingItem label="Layout" help="Display clock and date on one line or two">
        <select
          name="clockBarLayout"
          :value="config.clockBarLayout || 'single-line'"
          @change="handleClockSettingsChange"
        >
          <option value="single-line">Single line</option>
          <option value="two-lines">Two lines</option>
        </select>
      </SettingItem>

      <SettingItem
        label="Font sizes"
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
        label="Show Calvin logo"
        help="Display a small Calvin glyph at the leading edge of the bar"
      >
        <label>
          <input
            name="clockBarShowLogo"
            :checked="config.clockBarShowLogo !== false"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show logo
        </label>
      </SettingItem>

      <SettingItem
        label="Show weather"
        help="Display current temperature and icon (requires a weather service)"
      >
        <label>
          <input
            name="clockBarShowWeather"
            :checked="config.clockBarShowWeather"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show weather in bar
        </label>
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Visibility" icon="👁️" :expanded="true">
      <SettingItem
        label="Show in kiosk mode"
        help="Keep the bar visible when the rest of the UI is hidden"
      >
        <label>
          <input
            name="clockBarShowInKiosk"
            :checked="config.clockBarShowInKiosk"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Show in kiosk mode
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
    return "Top/bottom always render. 'Between' shows when the screen layout stacks regions vertically.";
  }
  return "Left/right always render. 'Between' shows when the screen layout places regions side by side.";
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
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-hint {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.75rem;
  border-left: 3px solid var(--accent-primary);
  background: var(--bg-secondary);
  border-radius: 0 4px 4px 0;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.45;
}

.section-hint strong {
  color: var(--text-primary);
}
</style>
