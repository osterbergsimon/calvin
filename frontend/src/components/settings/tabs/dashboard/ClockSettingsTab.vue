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

    <CollapsibleSection title="Appearance" icon="🎨" :expanded="true">
      <div class="orientation-appearance">
        <div class="orientation-panel">
          <h4>Horizontal bars</h4>
          <SettingItem
            label="Layout"
            help="Choose how time and date are arranged on top and bottom bars"
          >
            <select
              name="clockBarLayout"
              :value="config.clockBarLayout || 'single-line'"
              @change="handleClockSettingsChange"
            >
              <option value="single-line">Single line</option>
              <option value="two-lines">Two lines</option>
            </select>
          </SettingItem>

          <SettingItem label="Sizing" help="Adjust time, date, and padding for top and bottom bars">
            <ClockBarFontSizePicker
              :time-size="config.clockBarFontSize || 16"
              :date-size="config.clockBarDateFontSize || 14"
              :layout="config.clockBarLayout || 'single-line'"
              :padding="config.clockBarPadding || 8"
              :show-date="config.clockShowDate"
              :is-vertical="false"
              @update:time-size="handleBarFontSizeChange"
              @update:date-size="handleBarDateFontSizeChange"
              @update:padding="handleBarPaddingChange"
            />
          </SettingItem>
        </div>

        <div class="orientation-panel">
          <h4>Vertical bars</h4>
          <SettingItem
            label="Layout"
            help="Choose how time and date are arranged on left, right, and between bars"
          >
            <div class="vertical-layout-control">
              <select
                name="clockBarVerticalLayout"
                :value="config.clockBarVerticalLayout || 'upright'"
                @change="handleClockSettingsChange"
              >
                <option value="upright">Upright text</option>
                <option value="compact-time">Compact time</option>
                <option value="compact-time-date">Compact time and date</option>
              </select>

              <div class="vertical-layout-preview" aria-label="Vertical clock bar layout preview">
                <ClockBarVertical
                  position="left"
                  :show-in-non-kiosk="true"
                  :show-in-kiosk="false"
                  :enabled="true"
                  :preview-mode="true"
                  :preview-time-size="config.clockBarVerticalFontSize || 18"
                  :preview-date-size="config.clockBarVerticalDateFontSize || 11"
                  :preview-layout="config.clockBarVerticalLayout || 'upright'"
                  :preview-padding="config.clockBarVerticalPadding || 8"
                />
              </div>
            </div>
          </SettingItem>

          <SettingItem
            label="Sizing"
            help="Adjust time, date, and padding for left, right, and between vertical bars"
          >
            <ClockBarFontSizePicker
              :time-size="config.clockBarVerticalFontSize || 18"
              :date-size="config.clockBarVerticalDateFontSize || 11"
              :layout="config.clockBarVerticalLayout || 'upright'"
              :padding="config.clockBarVerticalPadding || 8"
              :show-date="config.clockShowDate"
              :is-vertical="true"
              :show-preview="false"
              :max="48"
              @update:time-size="handleVerticalBarFontSizeChange"
              @update:date-size="handleVerticalBarDateFontSizeChange"
              @update:padding="handleVerticalBarPaddingChange"
            />
          </SettingItem>
        </div>
      </div>

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
import ClockBarVertical from "@/components/ClockBarVertical.vue";

defineProps({
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

const handleBarFontSizeChange = px => {
  emit("update:config", { clockBarFontSize: px });
};

const handleBarDateFontSizeChange = px => {
  emit("update:config", { clockBarDateFontSize: px });
};

const handleBarPaddingChange = px => {
  emit("update:config", { clockBarPadding: px });
};

const handleVerticalBarFontSizeChange = px => {
  emit("update:config", { clockBarVerticalFontSize: px });
};

const handleVerticalBarDateFontSizeChange = px => {
  emit("update:config", { clockBarVerticalDateFontSize: px });
};

const handleVerticalBarPaddingChange = px => {
  emit("update:config", { clockBarVerticalPadding: px });
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

.orientation-appearance {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.orientation-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-block: 0.25rem;
}

.orientation-panel + .orientation-panel {
  border-top: 1px solid var(--border-color);
  padding-top: 1.25rem;
}

.orientation-panel h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 700;
}

.vertical-layout-control {
  display: flex;
  align-items: stretch;
  gap: 1rem;
  flex-wrap: wrap;
}

.vertical-layout-control select {
  align-self: flex-start;
}

.vertical-layout-preview {
  width: 7rem;
  height: 16rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  overflow: hidden;
  display: flex;
  align-items: stretch;
}
</style>
