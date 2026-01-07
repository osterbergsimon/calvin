<template>
  <div class="ui-tab">
    <CollapsibleSection title="Theme" icon="🎨">
      <ThemeSelector
        :themes="themes"
        :selected-theme-id="config.selectedTheme"
        :loading="loadingThemes"
        @select="handleThemeSelect"
      />

      <SettingItem
        label="Theme Mode"
        help="Controls when dark mode is applied (if theme supports it)"
      >
        <select :value="config.themeMode" @change="handleThemeModeChange">
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
                :value="config.darkModeStart"
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
                :value="config.darkModeEnd"
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

    <CollapsibleSection title="UI Visibility & Clock" icon="👁️">
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

      <SettingItem label="Enable Clock" help="Show clock on dashboard">
        <label>
          <input
            name="clockEnabled"
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
            name="clockDisplayMode"
            :value="config.clockDisplayMode"
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
            name="clockPosition"
            :value="config.clockPosition"
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
            name="clockSize"
            :value="config.clockSize"
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
      </template>
    </CollapsibleSection>

    <CollapsibleSection title="Notifications" icon="🔔" :expanded="true">
      <SettingItem
        label="Enable Notifications"
        help="Show visual notifications for keyboard actions and mode changes. This unified notification system replaces the old separate mode indicator and keyboard feedback."
      >
        <label>
          <input
            type="checkbox"
            :checked="config.keyboardFeedbackEnabled"
            @change="handleKeyboardFeedbackEnabledChange"
          />
          Enable Notifications
        </label>
      </SettingItem>

      <SettingItem
        v-if="config.keyboardFeedbackEnabled"
        label="Notification Style"
        help="Choose the size and position of notifications."
      >
        <select
          name="keyboardFeedbackMode"
          :value="config.keyboardFeedbackMode"
          @change="handleKeyboardFeedbackModeChange"
          class="form-select"
        >
          <option value="normal">Normal (Center, Large)</option>
          <option value="small">Small (Bottom-Right, Compact)</option>
        </select>
      </SettingItem>

      <SettingItem
        v-if="config.keyboardFeedbackEnabled"
        label="Mode Change Notification Timeout (seconds)"
        help="Time before mode change notifications auto-hide (0 = never hide, only applies to mode changes, not keyboard actions)"
      >
        <input
          name="modeIndicatorTimeout"
          :value="config.modeIndicatorTimeout"
          type="number"
          min="0"
          max="60"
          @change="handleModeIndicatorTimeoutChange"
        />
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
import ThemeSelector from "../../specialized/ThemeSelector.vue";
import { useThemesStore } from "@/stores/themes";
import { useTheme } from "@/composables/useTheme";
import * as pluginsApi from "@/services/pluginsApi";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const themesStore = useThemesStore();
const theme = useTheme();
const themes = ref([]);
const loadingThemes = ref(false);

const loadThemes = async () => {
  loadingThemes.value = true;
  try {
    // Get themes directly from API (same as old Settings.vue)
    // This includes both built-in and installed themes
    const response = await pluginsApi.getPlugins({ plugin_type: "theme" });
    const allItems = response.plugins || [];
    const themePlugins = allItems.filter((p) => p.type === "theme");

    // Also get theme details from individual plugin endpoint for variables/preview
    const themesWithDetails = [];
    for (const themePlugin of themePlugins) {
      try {
        const themeDetail = await pluginsApi.getPlugin(themePlugin.id);
        themesWithDetails.push({
          ...themePlugin,
          ...themeDetail,
        });
      } catch (error) {
        // If theme details not found, use plugin data
        themesWithDetails.push(themePlugin);
      }
    }

    themes.value = themesWithDetails;
  } catch (error) {
    console.error("Failed to load themes:", error);
    themes.value = [];
  } finally {
    loadingThemes.value = false;
  }
};

loadThemes();

const handleThemeSelect = async (themeId) => {
  try {
    // Update config (saves to backend)
    emit("update:config", { selectedTheme: themeId });
    // Apply theme immediately (same as old Settings.vue)
    await theme.setSelectedTheme(themeId);
  } catch (error) {
    console.error("Failed to select theme:", error);
  }
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

const handleClockSettingsChange = (event) => {
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

const handleKeyboardFeedbackEnabledChange = (event) => {
  emit("update:config", { keyboardFeedbackEnabled: event.target.checked });
};

const handleKeyboardFeedbackModeChange = (event) => {
  emit("update:config", { keyboardFeedbackMode: event.target.value });
};

const handleModeIndicatorTimeoutChange = (event) => {
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { modeIndicatorTimeout: value });
  }
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

.form-select {
  width: 100%;
  max-width: 400px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.95rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.form-select:hover {
  border-color: var(--accent-primary);
}

.form-select:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}
</style>
