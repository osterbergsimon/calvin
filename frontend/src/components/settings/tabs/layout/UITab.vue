<template>
  <div class="ui-tab">
    <CollapsibleSection title="Theme Selection" icon="🎨">
      <ThemeSelector
        :themes="themes"
        :selected-theme-id="config.selectedTheme"
        :loading="loadingThemes"
        @select="handleThemeSelect"
      />
    </CollapsibleSection>

    <CollapsibleSection title="Theme Mode" icon="🌓">
      <SettingItem
        label="Theme Mode"
        help="Controls when dark mode is applied (if theme supports it)"
      >
        <select :model-value="config.themeMode" @change="handleThemeModeChange">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">Auto (System)</option>
          <option value="time">Time-based</option>
        </select>
      </SettingItem>

      <div v-if="config.themeMode === 'time'">
        <SettingItem
          label="Dark Mode Time Range"
          help="Dark mode active between these hours (0-23)"
        >
          <div class="time-range-inputs">
            <div class="time-input-group">
              <label>Start (hour):</label>
              <input
                :model-value="config.darkModeStart"
                type="number"
                min="0"
                max="23"
                class="time-input"
                @change="handleDarkModeTimeChange"
              />
            </div>
            <div class="time-input-group">
              <label>End (hour):</label>
              <input
                :model-value="config.darkModeEnd"
                type="number"
                min="0"
                max="23"
                class="time-input"
                @change="handleDarkModeTimeChange"
              />
            </div>
          </div>
        </SettingItem>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="UI Visibility" icon="👁️">
      <SettingItem
        label="Show Headers and UI Controls"
        help="Hide headers to maximize content space (kiosk mode)"
      >
        <label>
          <input
            :checked="config.showUI"
            type="checkbox"
            @change="handleShowUIChange"
          />
          Show Headers and UI Controls
        </label>
      </SettingItem>

      <SettingItem
        label="Show Mode Indicator Icon"
        help="Show mode indicator icon when UI is hidden (top-left corner)"
      >
        <label>
          <input
            :checked="config.showModeIndicator"
            type="checkbox"
            @change="handleShowModeIndicatorChange"
          />
          Show Mode Indicator Icon
        </label>
      </SettingItem>

      <SettingItem
        v-if="config.showModeIndicator"
        label="Mode Indicator Auto-Hide Timeout (seconds)"
        help="Time before indicator auto-hides after mode change (0 = never hide)"
      >
        <input
          :model-value="config.modeIndicatorTimeout"
          type="number"
          min="0"
          max="60"
          @change="handleModeIndicatorTimeoutChange"
        />
      </SettingItem>
    </CollapsibleSection>

    <CollapsibleSection title="Clock Settings" icon="🕐">
      <SettingItem label="Enable Clock" help="Show clock on dashboard">
        <label>
          <input
            :checked="config.clockEnabled"
            type="checkbox"
            @change="handleClockSettingsChange"
          />
          Enable Clock
        </label>
      </SettingItem>

      <template v-if="config.clockEnabled">
        <SettingItem
          label="Clock Display Mode"
          help="When to display the clock on the dashboard"
        >
          <select
            :model-value="config.clockDisplayMode"
            @change="handleClockSettingsChange"
          >
            <option value="always">When UI is Off (Kiosk Mode)</option>
            <option value="header">Only When Header is Visible</option>
            <option value="off">Off</option>
          </select>
        </SettingItem>

        <SettingItem
          v-if="config.clockDisplayMode === 'always'"
          label="Clock Position"
          help="Position of the clock when UI is off"
        >
          <select
            :model-value="config.clockPosition"
            @change="handleClockSettingsChange"
          >
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </SettingItem>

        <SettingItem label="Clock Size" help="Size of the clock display">
          <select
            :model-value="config.clockSize"
            @change="handleClockSettingsChange"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </SettingItem>

        <SettingItem
          label="Show Date in Clock"
          help="Display date below the time"
        >
          <label>
            <input
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
              :checked="config.clockShowSeconds"
              type="checkbox"
              @change="handleClockSettingsChange"
            />
            Show Seconds in Clock
          </label>
        </SettingItem>
      </template>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
import ThemeSelector from "../../specialized/ThemeSelector.vue";
import { useThemesStore } from "@/stores/themes";
import * as pluginsApi from "@/services/pluginsApi";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const themesStore = useThemesStore();
const themes = ref([]);
const loadingThemes = ref(false);

const loadThemes = async () => {
  loadingThemes.value = true;
  try {
    const response = await pluginsApi.getInstalledPlugins("theme");
    themes.value = response.plugins || [];
  } catch (error) {
    console.error("Failed to load themes:", error);
  } finally {
    loadingThemes.value = false;
  }
};

loadThemes();

const handleThemeSelect = (themeId) => {
  emit("update:config", { selectedTheme: themeId });
};

const handleThemeModeChange = (event) => {
  emit("update:config", { themeMode: event.target.value });
};

const handleDarkModeTimeChange = (event) => {
  const field = event.target.previousElementSibling?.textContent.includes(
    "Start",
  )
    ? "darkModeStart"
    : "darkModeEnd";
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { [field]: value });
  }
};

const handleShowUIChange = (event) => {
  emit("update:config", { showUI: event.target.checked });
};

const handleShowModeIndicatorChange = (event) => {
  emit("update:config", { showModeIndicator: event.target.checked });
};

const handleModeIndicatorTimeoutChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { modeIndicatorTimeout: value });
  }
};

const handleClockSettingsChange = (event) => {
  const updates = {};
  if (event.target.type === "checkbox") {
    updates[event.target.name || event.target.id] = event.target.checked;
  } else {
    updates[event.target.name || event.target.id] = event.target.value;
  }
  // For clock settings, we need to update all at once
  if (event.target.type === "checkbox") {
    const field = event.target.previousElementSibling?.textContent
      .toLowerCase()
      .replace(/\s+/g, "");
    if (field.includes("clockenabled")) {
      updates.clockEnabled = event.target.checked;
    } else if (field.includes("showdate")) {
      updates.clockShowDate = event.target.checked;
    } else if (field.includes("showseconds")) {
      updates.clockShowSeconds = event.target.checked;
    }
  } else {
    const field = event.target.name || event.target.id;
    updates[field] = event.target.value;
  }
  emit("update:config", updates);
};
</script>

<style scoped>
.ui-tab {
  width: 100%;
}

.time-range-inputs {
  display: flex;
  gap: 1rem;
}

.time-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.time-input-group label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.time-input {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  width: 5rem;
}
</style>
