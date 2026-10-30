<template>
  <div class="calendar-sources">
    <SourceList
      :rows="rows"
      add-label="Add a calendar"
      empty-text="No calendar sources yet."
      :highlight-id="savedHighlightId || highlightId"
      :highlight-provider="highlightProvider"
      remove-title="Remove calendar source"
      :remove-message="row => `Remove ${row.name}? Its events stop showing on the calendar.`"
      @add="addButton?.open()"
      @toggle="handleEnabledChange"
      @edit="handleEdit"
      @remove="handleRemove"
    >
      <template #extra="{ row }">
        <input
          type="color"
          class="cal-color"
          :value="getColorValue(row.source?.color)"
          :aria-label="`Colour for ${row.name}`"
          :title="`Colour for ${row.name}`"
          @change="handleColorChange(row, $event.target.value)"
        />
      </template>
      <template #meta="{ row }">
        <label class="cal-show-times">
          <input
            type="checkbox"
            :checked="row.showTime"
            :aria-label="`Show event times for ${row.name}`"
            @change="handleShowTimeChange(row, $event.target.checked)"
          />
          Show event times
        </label>
      </template>
    </SourceList>

    <AddSourceButton ref="addButton" kind="calendar" @saved="handleAddSaved" />

    <SettingRow label="Check for new events every">
      <div class="cal-refresh">
        <NumberStepper
          :model-value="config.calendarRefreshInterval || 15"
          :min="5"
          :max="120"
          :step="5"
          unit=" min"
          aria-label="Check for new events every, in minutes"
          @update:model-value="v => emit('update:config', { calendarRefreshInterval: v })"
        />
        <button
          type="button"
          class="cal-refresh-btn"
          :disabled="refreshStatus === 'refreshing'"
          @click="handleRefreshNow"
        >
          Refresh now
        </button>
        <span v-if="refreshStatus" class="cal-refresh-status" aria-live="polite">{{
          refreshStatus === "refreshing" ? "Refreshing…" : "Refreshed"
        }}</span>
      </div>
    </SettingRow>

    <InstanceModal
      :show="showModal"
      :plugin="editingPlugin"
      :instance="editingInstance"
      @close="closeModal"
      @save="handleEditSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useCalendarStore } from "@/stores/calendar";
import { usePlugins } from "@/composables";
import * as calendarApi from "@/services/calendarApi";
import * as pluginsApi from "@/services/pluginsApi";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import SourceList from "@/components/settings/specialized/SourceList.vue";
import AddSourceButton from "@/components/settings/specialized/AddSourceButton.vue";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";
import { getInstanceSummary } from "@/utils/instanceSummary";
import { logError } from "@/utils/logger";

// Calendars use the one shared source flow (§3.1, decision B): a SourceList of
// sources, the provider picker to add one, and the shared add/edit form. The
// calendar-only row extras — colour and Show times — stay on the row.
defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({}),
  },
  highlightId: {
    type: String,
    default: "",
  },
  highlightProvider: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:config"]);

const calendarStore = useCalendarStore();
const { plugins, pluginInstances, loadPlugins } = usePlugins();

const addButton = ref(null);
const showModal = ref(false);
const editingPlugin = ref(null);
const editingInstance = ref(null);
const savedHighlightId = ref("");
const refreshStatus = ref(null);

const pluginFor = typeId =>
  plugins.value.find(plugin => plugin.id === typeId) || {
    id: typeId,
    name: typeId,
    type: "calendar",
  };

const rows = computed(() =>
  (calendarStore.sources || []).map(source => {
    const plugin = pluginFor(source.type);
    const instance =
      (pluginInstances.value[source.type] || []).find(item => item.id === source.id) || {};
    return {
      id: source.id,
      providerId: source.type,
      providerName: plugin.name,
      name: source.name,
      enabled: source.enabled !== false,
      running: instance.running,
      error: plugin.error_message || null,
      summary: getInstanceSummary(plugin, instance),
      source,
      plugin,
      instance,
      showTime: source.show_time !== false,
    };
  })
);

// Calendar colours are DATA (named colours or hex), not theme tokens: map the
// names a stored source may carry to hex so the native colour input shows it.
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

const handleColorChange = async (row, hexColor) => {
  try {
    await calendarStore.updateSource(row.id, { ...row.source, color: hexColor });
  } catch (error) {
    logError("[CalendarSources]", "Failed to update calendar source colour:", error);
  }
};

const handleShowTimeChange = async (row, showTime) => {
  try {
    await calendarStore.updateSource(row.id, { ...row.source, show_time: showTime });
  } catch (error) {
    logError("[CalendarSources]", "Failed to update show time:", error);
  }
};

const handleEnabledChange = async (row, enabled) => {
  try {
    await calendarStore.updateSource(row.id, { ...row.source, enabled });
  } catch (error) {
    logError("[CalendarSources]", "Failed to toggle calendar source:", error);
  }
};

const handleEdit = row => {
  const instance = (pluginInstances.value[row.providerId] || []).find(i => i.id === row.id) || {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    config: { ical_url: row.source?.ical_url || "" },
  };
  editingPlugin.value = row.plugin;
  editingInstance.value = instance;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  editingPlugin.value = null;
  editingInstance.value = null;
};

const handleRemove = async row => {
  try {
    await calendarApi.deleteCalendarSource(row.id);
    // A source is its plugin instance: drop the instance too so Plugins cannot
    // find an orphan, but never fail the removal over that best-effort step.
    if (row.instance?.id) {
      await pluginsApi.deletePluginInstance(row.instance.id).catch(() => {});
    }
    await Promise.all([calendarStore.fetchSources(), loadPlugins()]);
  } catch (error) {
    logError("[CalendarSources]", "Failed to remove calendar source:", error);
  }
};

// A new calendar plugin instance is created by the shared form first; the
// calendar feed row that Content lists is created from it here.
const handleAddSaved = async payload => {
  const created = payload?.saveData?.isCalendar ? payload.saveData : null;
  const typeId = payload?.pluginId || created?.calendarConfig?.type || "";
  await loadPlugins();
  if (!created) {
    await calendarStore.fetchSources();
    return;
  }
  try {
    const instances = pluginInstances.value[typeId] || [];
    const instance = instances.find(item => item.name === created.instanceName);
    if (!instance) return;
    await calendarApi.addCalendarSource({
      id: instance.id,
      type: typeId,
      name: created.instanceName,
      ical_url: created.calendarConfig?.ical_url || "",
      enabled: instance.enabled !== false,
      color: created.calendarConfig?.color || "#2196f3",
      show_time: created.calendarConfig?.show_time !== false,
    });
    savedHighlightId.value = instance.id;
    setTimeout(() => {
      savedHighlightId.value = "";
    }, 1500);
  } catch (error) {
    logError("[CalendarSources]", "Failed to create calendar source:", error);
  } finally {
    await calendarStore.fetchSources();
  }
};

// Editing is self-contained in the shared form (it saves the instance and the
// calendar colour/Show times). Content only needs the fresh source list.
const handleEditSaved = async () => {
  closeModal();
  await Promise.all([loadPlugins(), calendarStore.fetchSources()]);
};

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

onMounted(async () => {
  await Promise.all([loadPlugins(), calendarStore.fetchSources()]);
});
</script>

<style scoped>
.calendar-sources {
  width: 100%;
}

.cal-color {
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
.cal-color:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Show times lives on the row's subline as a small labelled checkbox, so the
   right-hand controls read exactly like every other source row. */
.cal-show-times {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.1rem;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--ink-2);
  cursor: pointer;
  white-space: nowrap;
}
.cal-show-times input {
  width: 0.9rem;
  height: 0.9rem;
  margin: 0;
  accent-color: var(--focus);
  cursor: pointer;
}
.cal-show-times input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.cal-refresh {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.cal-refresh-btn {
  padding: 0.4rem 0.9rem;
  min-height: var(--touch-target);
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: var(--font-ui);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.cal-refresh-btn:hover {
  background: var(--bg-1);
  border-color: var(--focus);
}
.cal-refresh-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.cal-refresh-status {
  font-size: 0.8rem;
  color: var(--ink-2);
  font-family: var(--font-ui);
}
</style>
