<template>
  <div class="appearance-tab">
    <CollapsibleSection title="Theme" icon="🎨" :expanded="true">
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

    <CollapsibleSection title="UI Visibility" icon="👁️">
      <SettingItem
        label="Show Headers and UI Controls"
        help="Hide headers to maximize content space (kiosk mode)"
      >
        <label>
          <input :checked="config.showUI" type="checkbox" @change="handleShowUIChange" />
          Show Headers and UI Controls
        </label>
      </SettingItem>
    </CollapsibleSection>
  </div>
</template>

<script setup>
import { ref } from "vue";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
import ThemeSelector from "../../specialized/ThemeSelector.vue";
import { useTheme } from "@/composables/useTheme";
import * as pluginsApi from "@/services/pluginsApi";

defineProps({
  config: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["update:config"]);

const theme = useTheme();
const themes = ref([]);
const loadingThemes = ref(false);

const loadThemes = async () => {
  loadingThemes.value = true;
  try {
    const response = await pluginsApi.getPlugins({ plugin_type: "theme" });
    const allItems = response.plugins || [];
    const themePlugins = allItems.filter(p => p.type === "theme");

    const themesWithDetails = [];
    for (const themePlugin of themePlugins) {
      try {
        const themeDetail = await pluginsApi.getPlugin(themePlugin.id);
        themesWithDetails.push({
          ...themePlugin,
          ...themeDetail,
        });
      } catch {
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

const handleThemeSelect = async themeId => {
  try {
    emit("update:config", { selectedTheme: themeId });
    await theme.setSelectedTheme(themeId);
  } catch (error) {
    console.error("Failed to select theme:", error);
  }
};

const handleThemeModeChange = event => {
  emit("update:config", { themeMode: event.target.value });
};

const handleDarkModeTimeChange = event => {
  const field = event.target.previousElementSibling?.textContent.includes("Start")
    ? "darkModeStart"
    : "darkModeEnd";
  const value = parseInt(event.target.value, 10);
  if (!isNaN(value)) {
    emit("update:config", { [field]: value });
  }
};

const handleShowUIChange = event => {
  emit("update:config", { showUI: event.target.checked });
};
</script>

<style scoped>
.appearance-tab {
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
