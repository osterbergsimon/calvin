<template>
  <!-- Status banner -->
  <div
    v-if="banner"
    class="cst-banner"
    :class="banner.type === 'error' ? 'cst-banner--err' : 'cst-banner--ok'"
  >
    {{ banner.text }}
  </div>

  <!-- Add-source form -->
  <div class="cst-add-form">
    <div class="cst-form-row">
      <label class="cst-label" for="cst-type">Type</label>
      <select id="cst-type" v-model="newSource.type" class="cst-select">
        <option v-for="t in calendarPluginTypes" :key="t.id" :value="t.id">
          {{ t.name }}
        </option>
      </select>
    </div>
    <div class="cst-form-row">
      <label class="cst-label" for="cst-name">Name</label>
      <input
        id="cst-name"
        v-model="newSource.name"
        type="text"
        placeholder="My Calendar"
        class="cst-input"
      />
    </div>
    <div class="cst-form-row">
      <label class="cst-label" for="cst-url">URL</label>
      <input
        id="cst-url"
        v-model="newSource.ical_url"
        type="text"
        :placeholder="getCalendarTypePlaceholder(newSource.type)"
        class="cst-input"
      />
      <span v-if="getCalendarTypeHelpText(newSource.type)" class="cst-help">
        {{ getCalendarTypeHelpText(newSource.type) }}
      </span>
    </div>
    <button
      type="button"
      class="cst-btn-add"
      :disabled="!canAdd"
      @click="handleAdd"
    >
      Add calendar
    </button>
  </div>

  <!-- Source rows (one compact line each) -->
  <div v-if="sourcesWithStatus.length > 0" class="cst-source-list">
    <div
      v-for="source in sourcesWithStatus"
      :key="source.id"
      class="cst-src"
      :class="{ 'cst-src--off': !source.enabled }"
    >
      <span
        v-if="source.running !== undefined"
        class="cst-src-dot"
        :class="source.running ? 'cst-src-dot--on' : 'cst-src-dot--off'"
        :title="source.running ? 'Running' : 'Stopped'"
      />
      <span class="cst-src-name">{{ source.name }}</span>
      <span class="cst-src-type">{{ source.type }}</span>

      <div class="cst-src-controls">
        <input
          type="color"
          class="cst-src-color"
          :value="getColorValue(source.color)"
          :aria-label="`Colour for ${source.name}`"
          :title="`Colour for ${source.name}`"
          @change="handleColorChange(source.id, $event.target.value)"
        />
        <span class="cst-src-toggle">
          <span class="cst-src-cap">Show times</span>
          <ToggleSwitch
            :model-value="source.show_time !== false"
            :aria-label="`Show event times for ${source.name}`"
            @update:model-value="v => handleShowTimeChange(source.id, v)"
          />
        </span>
        <span class="cst-src-toggle">
          <span class="cst-src-cap">Enabled</span>
          <ToggleSwitch
            :model-value="!!source.enabled"
            :aria-label="`Show ${source.name} on the dashboard`"
            @update:model-value="v => handleEnabledChange(source.id, v)"
          />
        </span>
        <button
          type="button"
          class="cst-src-remove"
          :aria-label="`Remove ${source.name}`"
          title="Remove"
          @click="handleRemove(source.id)"
        >
          ✕
        </button>
      </div>
    </div>
  </div>

  <!-- Empty state -->
  <p v-else class="cst-empty">No calendar sources yet. Add one above.</p>

  <!-- Refresh row -->
  <SettingRow
    label="Refresh interval"
    description="How often to refresh calendar data (5–120 minutes)."
  >
    <div class="cst-refresh-controls">
      <NumberStepper
        :model-value="config.calendarRefreshInterval || 15"
        :min="5"
        :max="120"
        :step="5"
        aria-label="Calendar refresh interval in minutes"
        @update:model-value="v => emit('update:config', { calendarRefreshInterval: v })"
      />
      <button
        type="button"
        class="cst-btn-refresh"
        :disabled="refreshStatus === 'refreshing'"
        @click="handleRefreshNow"
      >
        Refresh now
      </button>
      <span
        v-if="refreshStatus"
        class="cst-refresh-status"
        aria-live="polite"
      >{{ refreshStatus === 'refreshing' ? 'Refreshing…' : 'Refreshed' }}</span>
    </div>
  </SettingRow>

  <!-- Confirm remove modal -->
  <ConfirmModal
    :show="showRemoveConfirm"
    title="Remove Calendar Source"
    message="Are you sure you want to remove this calendar source?"
    confirm-text="Remove"
    @confirm="confirmRemove"
    @cancel="cancelRemove"
  />
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useCalendarStore } from "@/stores/calendar";
import { usePlugins } from "@/composables";
import * as calendarApi from "@/services/calendarApi";
import * as pluginsApi from "@/services/pluginsApi";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import { logError } from "@/utils/logger";

defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
});

const emit = defineEmits(["update:config"]);

// ---------------------------------------------------------------------------
// Store + composables
// ---------------------------------------------------------------------------
const calendarStore = useCalendarStore();
const { pluginInstances } = usePlugins();

// ---------------------------------------------------------------------------
// Calendar plugin types (type <select> options)
// ---------------------------------------------------------------------------
const calendarPluginTypes = ref([]);

const loadCalendarPluginTypes = async () => {
  try {
    const response = await pluginsApi.getPlugins({ plugin_type: "calendar" });
    calendarPluginTypes.value = (response.plugins || [])
      .filter(p => p.enabled !== false)
      .map(p => ({ id: p.id, name: p.name, description: p.description }));
    if (calendarPluginTypes.value.length > 0 && !newSource.value.type) {
      newSource.value.type = calendarPluginTypes.value[0].id;
    }
  } catch (error) {
    logError("[CalendarSources]", "Failed to load calendar plugin types:", error);
    // Hardcoded fallback list
    calendarPluginTypes.value = [
      { id: "google", name: "Google Calendar" },
      { id: "proton", name: "Proton Calendar" },
      { id: "ical", name: "iCal URL" },
      { id: "caldav", name: "CalDAV" },
    ];
    if (!newSource.value.type && calendarPluginTypes.value.length > 0) {
      newSource.value.type = calendarPluginTypes.value[0].id;
    }
  }
};

// Per-type URL placeholder and help text (preserved verbatim from original)
const getCalendarTypePlaceholder = type => {
  const typeInfo = calendarPluginTypes.value.find(t => t.id === type);
  if (typeInfo && typeInfo.description) return typeInfo.description;
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

const getCalendarTypeHelpText = type => {
  const typeInfo = calendarPluginTypes.value.find(t => t.id === type);
  if (typeInfo && typeInfo.description) return typeInfo.description;
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

// ---------------------------------------------------------------------------
// Data color normalization — these hex values are DATA (calendar colors),
// not chrome tokens. They map named colors the backend may return to hex so
// the native <input type="color"> can display them. Default #2196f3 is the
// canonical "no color set" fallback. Both are data; neither is tokenized.
// ---------------------------------------------------------------------------
const getColorValue = color => {
  if (!color) return "#2196f3";
  if (color.startsWith("#")) return color;
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

// ---------------------------------------------------------------------------
// Sources — derive running status from plugin instances
// ---------------------------------------------------------------------------
const sourcesWithStatus = computed(() =>
  (calendarStore.sources || []).map(source => {
    let running;
    for (const pluginId in pluginInstances.value) {
      const inst = (pluginInstances.value[pluginId] || []).find(i => i.id === source.id);
      if (inst) {
        running = inst.running;
        break;
      }
    }
    return { ...source, running };
  })
);

// ---------------------------------------------------------------------------
// Add-source form
// ---------------------------------------------------------------------------
const newSource = ref({ type: "", name: "", ical_url: "" });

const canAdd = computed(
  () => newSource.value.name.trim() !== "" && newSource.value.ical_url.trim() !== ""
);

const handleAdd = async () => {
  clearBanner();
  if (!canAdd.value) {
    setBanner("error", "Please fill in calendar name and URL", 6000);
    return;
  }
  try {
    const source = {
      id: `${newSource.value.type}-${Date.now()}`,
      type: newSource.value.type,
      name: newSource.value.name.trim(),
      ical_url: newSource.value.ical_url.trim(),
      enabled: true,
      color: getColorValue(undefined),
      show_time: true,
    };
    await calendarApi.addCalendarSource(source);
    newSource.value = { type: calendarPluginTypes.value[0]?.id || "", name: "", ical_url: "" };
    await calendarStore.fetchSources();
    setBanner("success", "Calendar source added", 4000);
  } catch (error) {
    logError("[CalendarSources]", "Failed to add calendar source:", error);
    setBanner(
      "error",
      error?.response?.data?.detail || error?.message || "Failed to add calendar source",
      8000
    );
  }
};

// ---------------------------------------------------------------------------
// Per-source updates (color / show_time / enabled)
// ---------------------------------------------------------------------------
const handleColorChange = async (sourceId, hexColor) => {
  try {
    const source = calendarStore.sources.find(s => s.id === sourceId);
    if (source) {
      await calendarStore.updateSource(sourceId, { ...source, color: hexColor });
    }
  } catch (error) {
    logError("[CalendarSources]", "Failed to update calendar source color:", error);
    setBanner(
      "error",
      error?.response?.data?.detail || error?.message || "Failed to update calendar source color",
      8000
    );
  }
};

const handleShowTimeChange = async (sourceId, showTime) => {
  try {
    const source = calendarStore.sources.find(s => s.id === sourceId);
    if (source) {
      await calendarStore.updateSource(sourceId, { ...source, show_time: showTime });
    }
  } catch (error) {
    logError("[CalendarSources]", "Failed to update show time:", error);
    setBanner(
      "error",
      error?.response?.data?.detail || error?.message || "Failed to update calendar source",
      8000
    );
  }
};

const handleEnabledChange = async (sourceId, enabled) => {
  try {
    const source = calendarStore.sources.find(s => s.id === sourceId);
    if (source) {
      await calendarStore.updateSource(sourceId, { ...source, enabled });
    }
  } catch (error) {
    logError("[CalendarSources]", "Failed to toggle calendar source:", error);
    setBanner(
      "error",
      error?.response?.data?.detail || error?.message || "Failed to update calendar source",
      8000
    );
  }
};

// ---------------------------------------------------------------------------
// Remove (with confirm)
// ---------------------------------------------------------------------------
const showRemoveConfirm = ref(false);
const pendingRemoveId = ref(null);

const handleRemove = sourceId => {
  clearBanner();
  pendingRemoveId.value = sourceId;
  showRemoveConfirm.value = true;
};

const confirmRemove = async () => {
  const sourceId = pendingRemoveId.value;
  showRemoveConfirm.value = false;
  pendingRemoveId.value = null;
  if (!sourceId) return;
  try {
    await calendarApi.deleteCalendarSource(sourceId);
    await calendarStore.fetchSources();
    setBanner("success", "Calendar source removed", 4000);
  } catch (error) {
    logError("[CalendarSources]", "Failed to remove calendar source:", error);
    setBanner(
      "error",
      error?.response?.data?.detail || error?.message || "Failed to remove calendar source",
      8000
    );
  }
};

const cancelRemove = () => {
  showRemoveConfirm.value = false;
  pendingRemoveId.value = null;
};

// ---------------------------------------------------------------------------
// Refresh now
// ---------------------------------------------------------------------------
const refreshStatus = ref(null);

const handleRefreshNow = async () => {
  refreshStatus.value = "refreshing";
  try {
    await calendarStore.refreshEvents();
    refreshStatus.value = "done";
    setTimeout(() => {
      refreshStatus.value = null;
    }, 2000);
  } catch (error) {
    logError("[CalendarSources]", "Failed to refresh events:", error);
    refreshStatus.value = null;
  }
};

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
const banner = ref(null);
let bannerTimer = null;

const setBanner = (type, text, autoClearMs = 0) => {
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
};

const clearBanner = () => {
  if (bannerTimer) {
    clearTimeout(bannerTimer);
    bannerTimer = null;
  }
  banner.value = null;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(async () => {
  await loadCalendarPluginTypes();
  await calendarStore.fetchSources();
});
</script>

<style scoped>
/* Banner */
.cst-banner {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  font-weight: 500;
  font-family: var(--font-ui);
}
.cst-banner--err {
  background: color-mix(in srgb, var(--err) 15%, transparent);
  color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--err) 40%, transparent);
}
.cst-banner--ok {
  background: color-mix(in srgb, var(--ok) 15%, transparent);
  color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent);
}

/* Add form */
.cst-add-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  margin-bottom: 1.25rem;
}
.cst-form-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.cst-label {
  font-family: var(--font-ui);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink);
}
.cst-input,
.cst-select {
  padding: 0.5rem 0.75rem;
  background: var(--bg-1);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  min-height: 44px;
}
.cst-input:focus,
.cst-select:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent);
}
.cst-input:focus-visible,
.cst-select:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.cst-help {
  font-size: 0.8rem;
  color: var(--ink-2);
  line-height: 1.4;
}
.cst-btn-add {
  align-self: flex-start;
  padding: 0.625rem 1.25rem;
  min-height: 44px;
  background: var(--focus);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: background 0.15s;
}
.cst-btn-add:hover:not(:disabled) {
  background: color-mix(in srgb, var(--focus) 80%, black);
}
.cst-btn-add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cst-btn-add:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Source rows — one compact line per calendar */
.cst-source-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
}
.cst-src {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.75rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  flex-wrap: wrap;
}
.cst-src--off {
  opacity: 0.6;
}
.cst-src-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cst-src-dot--on {
  background: var(--ok);
}
.cst-src-dot--off {
  background: var(--ink-3);
}
.cst-src-name {
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink);
  flex: 1;
  min-width: 6rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cst-src-type {
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-family: var(--font-ui);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: var(--bg-1);
  color: var(--ink-2);
  border: 1px solid var(--line);
  flex-shrink: 0;
}
.cst-src-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
  flex-shrink: 0;
}
.cst-src-color {
  width: 30px;
  height: 30px;
  min-height: 0;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
}
.cst-src-color:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.cst-src-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.cst-src-cap {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
  white-space: nowrap;
}
.cst-src-remove {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ink-3);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.cst-src-remove:hover {
  color: var(--err);
  border-color: var(--err);
  background: color-mix(in srgb, var(--err) 8%, transparent);
}
.cst-src-remove:focus-visible {
  outline: 2px solid var(--err);
  outline-offset: 2px;
}

/* Empty state */
.cst-empty {
  color: var(--ink-3);
  font-size: 0.9rem;
  font-family: var(--font-ui);
  text-align: center;
  padding: 1.5rem;
  margin: 0 0 1.25rem;
}

/* Refresh controls */
.cst-refresh-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.cst-btn-refresh {
  padding: 0.4rem 0.9rem;
  min-height: 44px;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: var(--font-ui);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.cst-btn-refresh:hover {
  background: var(--bg-1);
  border-color: var(--focus);
}
.cst-btn-refresh:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.cst-refresh-status {
  font-size: 0.8rem;
  color: var(--ink-2);
  font-family: var(--font-ui);
}
</style>
