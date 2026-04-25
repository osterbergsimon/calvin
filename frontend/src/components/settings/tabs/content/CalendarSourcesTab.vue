<template>
  <div class="calendar-sources-tab">
    <div
      v-if="banner"
      class="tab-banner"
      :class="
        banner.type === 'error' ? 'tab-banner-error' : 'tab-banner-success'
      "
    >
      {{ banner.text }}
    </div>
    <CollapsibleSection title="Calendar Sources" icon="📅" :expanded="true">
      <SettingItem
        label="Add New Calendar Source"
        help="Add a new calendar source to display events"
      >
        <div class="calendar-source-form">
          <div class="form-group">
            <label>Calendar Type</label>
            <select v-model="newCalendarSource.type" class="form-select">
              <option
                v-for="type in calendarPluginTypes"
                :key="type.id"
                :value="type.id"
              >
                {{ type.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Calendar Name</label>
            <input
              v-model="newCalendarSource.name"
              type="text"
              placeholder="My Calendar"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label>Calendar URL</label>
            <input
              v-model="newCalendarSource.ical_url"
              type="text"
              :placeholder="getCalendarTypePlaceholder(newCalendarSource.type)"
              class="form-input"
            />
            <span class="help-text">
              {{ getCalendarTypeHelpText(newCalendarSource.type) }}
            </span>
          </div>
          <button
            class="btn-add"
            :disabled="!canAddCalendar"
            @click="handleAddCalendarSource"
          >
            Add Calendar
          </button>
        </div>
      </SettingItem>

      <SettingItem
        v-if="calendarSources.length > 0"
        label="Calendar Sources"
        help="Manage your calendar sources"
      >
        <div class="calendar-sources-list">
          <div
            v-for="source in calendarSources"
            :key="source.id"
            class="source-item"
          >
            <div class="source-info">
              <strong>{{ source.name }}</strong>
              <span class="source-type">{{ source.type }}</span>
              <span
                v-if="source.running !== undefined"
                class="running-indicator"
                :class="{
                  running: source.running,
                  stopped: !source.running,
                }"
                :title="source.running ? 'Running' : 'Stopped'"
              >
                {{ source.running ? "●" : "○" }}
              </span>
            </div>
            <div class="source-settings">
              <div class="source-setting">
                <label>Color:</label>
                <input
                  type="color"
                  :value="getColorValue(source.color)"
                  class="color-input"
                  @change="
                    handleUpdateSourceColor(source.id, $event.target.value)
                  "
                />
              </div>
              <div class="source-setting">
                <label>
                  <input
                    type="checkbox"
                    :checked="source.show_time !== false"
                    @change="
                      handleUpdateSourceShowTime(
                        source.id,
                        $event.target.checked,
                      )
                    "
                  />
                  Show Event Times
                </label>
              </div>
            </div>
            <div class="source-actions">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  :checked="source.enabled"
                  @change="handleToggleSource(source.id, $event.target.checked)"
                />
                <span class="slider" />
              </label>
              <button
                class="btn-remove"
                title="Remove calendar"
                @click="handleRemoveSource(source.id)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </SettingItem>
    </CollapsibleSection>

    <ConfirmModal
      :show="showRemoveConfirm"
      title="Remove Calendar Source"
      message="Are you sure you want to remove this calendar source?"
      confirm-text="Remove"
      @confirm="confirmRemoveSource"
      @cancel="cancelRemoveSource"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useCalendarStore } from "@/stores/calendar";
import { usePlugins } from "@/composables";
import * as calendarApi from "@/services/calendarApi";
import * as pluginsApi from "@/services/pluginsApi";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import SettingItem from "../../shared/SettingItem.vue";
import ConfirmModal from "../../shared/ConfirmModal.vue";
import { logError } from "@/utils/logger";

const calendarStore = useCalendarStore();
const { pluginInstances } = usePlugins();

const calendarSources = ref([]);
const loadingSources = ref(false);
const calendarPluginTypes = ref([]);

const newCalendarSource = ref({
  type: "",
  name: "",
  ical_url: "",
});

const banner = ref(null);
let bannerTimer = null;

const showRemoveConfirm = ref(false);
const pendingRemoveId = ref(null);

function setBanner(type, text, autoClearMs = 0) {
  if (bannerTimer) {
    clearTimeout(bannerTimer);
    bannerTimer = null;
  }
  banner.value = { type, text };
  if (autoClearMs > 0) {
    bannerTimer = setTimeout(() => {
      banner.value = null;
      bannerTimer = null;
    }, autoClearMs);
  }
}

function clearBanner() {
  if (bannerTimer) {
    clearTimeout(bannerTimer);
    bannerTimer = null;
  }
  banner.value = null;
}

const canAddCalendar = computed(() => {
  return (
    newCalendarSource.value.name.trim() !== "" &&
    newCalendarSource.value.ical_url.trim() !== ""
  );
});

const loadCalendarSources = async () => {
  loadingSources.value = true;
  try {
    await calendarStore.fetchSources();
    // Merge calendar sources with plugin instance data (for running status)
    const sources = calendarStore.sources || [];
    const sourcesWithStatus = await Promise.all(
      sources.map(async (source) => {
        // Try to find matching plugin instance for running status
        let running = undefined;
        try {
          // Calendar sources are typically plugin instances
          // Check if this source ID matches any plugin instance
          for (const pluginId in pluginInstances.value) {
            const instances = pluginInstances.value[pluginId] || [];
            const instance = instances.find((inst) => inst.id === source.id);
            if (instance) {
              running = instance.running;
              break;
            }
          }
        } catch {
          // Ignore errors when checking instance status
        }
        return { ...source, running };
      }),
    );
    calendarSources.value = sourcesWithStatus;
  } catch (error) {
    logError("[CalendarSources]", "Failed to load calendar sources:", error);
    calendarSources.value = [];
    setBanner(
      "error",
      error?.message || "Failed to load calendar sources",
      8000,
    );
  } finally {
    loadingSources.value = false;
  }
};

const loadCalendarPluginTypes = async () => {
  try {
    const response = await pluginsApi.getPlugins({ plugin_type: "calendar" });
    // Filter to only enabled calendar plugins and map to expected format
    calendarPluginTypes.value = (response.plugins || [])
      .filter((p) => p.enabled !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      }));
    // Set default type if none selected
    if (calendarPluginTypes.value.length > 0 && !newCalendarSource.value.type) {
      newCalendarSource.value.type = calendarPluginTypes.value[0].id;
    }
  } catch (error) {
    logError(
      "[CalendarSources]",
      "Failed to load calendar plugin types:",
      error,
    );
    // Fallback to hardcoded types
    calendarPluginTypes.value = [
      { id: "google", name: "Google Calendar" },
      { id: "proton", name: "Proton Calendar" },
      { id: "ical", name: "iCal URL" },
      { id: "caldav", name: "CalDAV" },
    ];
    if (!newCalendarSource.value.type && calendarPluginTypes.value.length > 0) {
      newCalendarSource.value.type = calendarPluginTypes.value[0].id;
    }
  }
};

const getCalendarTypePlaceholder = (type) => {
  const typeInfo = calendarPluginTypes.value.find((t) => t.id === type);
  if (typeInfo && typeInfo.description) {
    return typeInfo.description;
  }
  switch (type) {
    case "google":
      return "https://calendar.google.com/calendar/ical/.../basic.ics";
    case "proton":
      return "https://calendar.proton.me/api/calendar/v1/url/.../calendar.ics?CacheKey=...&PassphraseKey=...";
    case "ical":
      return "https://example.com/calendar.ics";
    case "caldav":
      return "https://caldav.example.com/calendar";
    default:
      return "Calendar URL";
  }
};

const getCalendarTypeHelpText = (type) => {
  const typeInfo = calendarPluginTypes.value.find((t) => t.id === type);
  if (typeInfo && typeInfo.description) {
    return typeInfo.description;
  }
  switch (type) {
    case "google":
      return "Get your Google Calendar iCal URL from Google Calendar settings";
    case "proton":
      return "Proton Calendar: iCal feed URL from Proton Calendar sharing settings (includes CacheKey and PassphraseKey)";
    case "ical":
      return "Enter the iCal URL for your calendar";
    case "caldav":
      return "Enter your CalDAV server URL";
    default:
      return "";
  }
};

const handleAddCalendarSource = async () => {
  clearBanner();
  if (!canAddCalendar.value) {
    setBanner("error", "Please fill in calendar name and URL", 6000);
    return;
  }

  try {
    // Generate a unique ID for the calendar source
    const sourceId = `${newCalendarSource.value.type}-${Date.now()}`;

    const source = {
      id: sourceId,
      type: newCalendarSource.value.type,
      name: newCalendarSource.value.name.trim(),
      ical_url: newCalendarSource.value.ical_url.trim(),
      enabled: true,
    };

    await calendarApi.addCalendarSource(source);

    // Reset form
    newCalendarSource.value = {
      type: "google",
      name: "",
      ical_url: "",
    };

    // Reload sources
    await loadCalendarSources();
    setBanner("success", "Calendar source added", 4000);
  } catch (error) {
    logError("[CalendarSources]", "Failed to add calendar source:", error);
    const errorMessage =
      error.response?.data?.detail ||
      error.message ||
      "Failed to add calendar source";
    setBanner("error", errorMessage, 8000);
  }
};

// Convert named colors to hex format
const getColorValue = (color) => {
  if (!color) return "#2196f3";
  // If already hex format, return as is
  if (color.startsWith("#")) return color;
  // Convert named colors to hex
  const colorMap = {
    green: "#4caf50",
    red: "#f44336",
    blue: "#2196f3",
    yellow: "#ffeb3b",
    orange: "#ff9800",
    purple: "#9c27b0",
    pink: "#e91e63",
    cyan: "#00bcd4",
    teal: "#009688",
    indigo: "#3f51b5",
    brown: "#795548",
    grey: "#9e9e9e",
    gray: "#9e9e9e",
  };
  return colorMap[color.toLowerCase()] || "#2196f3";
};

const handleUpdateSourceColor = async (sourceId, color) => {
  try {
    // Ensure color is in hex format
    const hexColor = color.startsWith("#") ? color : getColorValue(color);
    const source = calendarSources.value.find((s) => s.id === sourceId);
    if (source) {
      await calendarStore.updateSource(sourceId, {
        ...source,
        color: hexColor,
      });
      await loadCalendarSources();
    }
  } catch (error) {
    logError(
      "[CalendarSources]",
      "Failed to update calendar source color:",
      error,
    );
    setBanner(
      "error",
      error?.response?.data?.detail ||
        error?.message ||
        "Failed to update calendar source color",
      8000,
    );
  }
};

const handleUpdateSourceShowTime = async (sourceId, showTime) => {
  try {
    const source = calendarSources.value.find((s) => s.id === sourceId);
    if (source) {
      await calendarStore.updateSource(sourceId, {
        ...source,
        show_time: showTime,
      });
      await loadCalendarSources();
    }
  } catch (error) {
    logError("[CalendarSources]", "Failed to update show time:", error);
    setBanner(
      "error",
      error?.response?.data?.detail ||
        error?.message ||
        "Failed to update calendar source",
      8000,
    );
  }
};

const handleToggleSource = async (sourceId, enabled) => {
  try {
    const source = calendarSources.value.find((s) => s.id === sourceId);
    if (source) {
      await calendarStore.updateSource(sourceId, { ...source, enabled });
      await loadCalendarSources();
    }
  } catch (error) {
    logError("[CalendarSources]", "Failed to toggle calendar source:", error);
    setBanner(
      "error",
      error?.response?.data?.detail ||
        error?.message ||
        "Failed to update calendar source",
      8000,
    );
  }
};

const handleRemoveSource = (sourceId) => {
  clearBanner();
  pendingRemoveId.value = sourceId;
  showRemoveConfirm.value = true;
};

const confirmRemoveSource = async () => {
  const sourceId = pendingRemoveId.value;
  showRemoveConfirm.value = false;
  pendingRemoveId.value = null;
  if (!sourceId) return;

  try {
    await calendarApi.deleteCalendarSource(sourceId);
    await loadCalendarSources();
    setBanner("success", "Calendar source removed", 4000);
  } catch (error) {
    logError("[CalendarSources]", "Failed to remove calendar source:", error);
    setBanner(
      "error",
      error?.response?.data?.detail ||
        error?.message ||
        "Failed to remove calendar source",
      8000,
    );
  }
};

const cancelRemoveSource = () => {
  showRemoveConfirm.value = false;
  pendingRemoveId.value = null;
};

onMounted(async () => {
  await loadCalendarPluginTypes();
  await loadCalendarSources();
});
</script>

<style scoped>
.calendar-sources-tab {
  width: 100%;
}

.tab-banner {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-weight: 500;
}

.tab-banner-error {
  background: rgba(244, 67, 54, 0.15);
  color: var(--text-primary);
  border: 1px solid rgba(244, 67, 54, 0.4);
}

.tab-banner-success {
  background: rgba(76, 175, 80, 0.15);
  color: var(--text-primary);
  border: 1px solid rgba(76, 175, 80, 0.4);
}

.calendar-source-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.form-input,
.form-select {
  padding: 0.5rem 0.75rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.btn-add {
  padding: 0.75rem 1.5rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-start;
}

.btn-add:hover:not(:disabled) {
  background: #1976d2;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-add:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.calendar-sources-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.source-item {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.source-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.source-info strong {
  font-size: 1rem;
  color: var(--text-primary);
}

.source-type {
  padding: 0.25rem 0.5rem;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.running-indicator {
  font-size: 1rem;
  font-weight: bold;
}

.running-indicator.running {
  color: #4caf50;
}

.running-indicator.stopped {
  color: #f44336;
}

.source-settings {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.source-setting {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.source-setting label {
  font-size: 0.9rem;
  color: var(--text-primary);
}

.color-input {
  width: 3rem;
  height: 2rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
}

.source-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-tertiary);
  transition: 0.4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

.toggle-switch input:checked + .slider {
  background-color: var(--accent-primary);
}

.toggle-switch input:checked + .slider:before {
  transform: translateX(26px);
}

.btn-remove {
  padding: 0.5rem 1rem;
  background: transparent;
  color: #f44336;
  border: 1px solid #f44336;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-remove:hover {
  background: #f44336;
  color: white;
}
</style>
