<template>
  <Dialog :model-value="show" :title="dialogTitle" @update:model-value="handleDialog">
    <InlineNote v-if="error" class="instance-modal__note" tone="err">{{ error }}</InlineNote>
    <form id="instance-form" class="instance-form" @submit.prevent="handleSave">
      <TextField v-model="formData.name" label="Name" :placeholder="namePlaceholder" required />

      <!-- Instance-specific fields from instance_config_schema -->
      <template v-if="instanceFields.length > 0">
        <div v-for="[key, schema] in instanceFields" :key="key" class="form-group">
          <PluginFieldRenderer
            :plugin-id="currentPlugin.id"
            :field-key="key"
            :schema="fieldSchema(key, schema)"
            :value="getFormValue(key, schema)"
            @update="updateFormValue(key, $event)"
          />
          <!-- Geocode button for location field (for weather plugins like YR.no) -->
          <Button
            v-if="key === 'location' && hasGeocodeAction"
            variant="secondary"
            class="instance-modal__geocode"
            :disabled="geocoding || !formData.location"
            :loading="geocoding"
            loading-label="Getting coordinates…"
            @click="handleGeocode"
          >
            Get coordinates
          </Button>
          <InlineNote
            v-if="key === 'location' && geocodeStatus"
            class="instance-modal__note"
            :tone="geocodeStatus.success ? 'ok' : 'err'"
          >
            {{ geocodeStatus.message }}
          </InlineNote>
        </div>
      </template>

      <!-- Fallback for plugins without instance_config_schema -->
      <template v-else>
        <InlineNote>This plugin type has no settings of its own.</InlineNote>
      </template>

      <!-- Calendar-specific fields (colour and show_time) -->
      <template v-if="currentPlugin?.type === 'calendar'">
        <div class="form-group">
          <label class="colour-label" for="instance-calendar-colour">Colour</label>
          <div class="colour-row">
            <input
              id="instance-calendar-colour"
              v-model="formData.color"
              type="color"
              class="color-input"
              aria-label="Colour"
            />
            <TextField
              v-model="formData.color"
              class="colour-value"
              label="Colour value"
              hide-label
              placeholder="#275f86"
            />
          </div>
          <div
            v-if="swatches.length"
            class="colour-swatches"
            role="group"
            aria-label="Calendar colours"
          >
            <button
              v-for="swatch in swatches"
              :key="swatch.token"
              type="button"
              class="colour-swatch"
              :class="{ selected: formData.color?.toLowerCase() === swatch.hex }"
              :style="{ background: swatch.hex }"
              :aria-label="`Calendar colour ${swatch.number}`"
              :aria-pressed="formData.color?.toLowerCase() === swatch.hex"
              @click="formData.color = swatch.hex"
            />
          </div>
          <InlineNote>These eight follow the theme; pick one or enter a custom colour</InlineNote>
        </div>
        <SettingRow
          flush
          label="Show event times"
          description="Display time information for events from this calendar"
        >
          <ToggleSwitch
            :model-value="formData.show_time"
            aria-label="Show event times"
            @update:model-value="formData.show_time = $event"
          />
        </SettingRow>
      </template>

      <!-- Enable/Disable -->
      <SettingRow flush label="Enabled">
        <ToggleSwitch
          :model-value="formData.enabled"
          aria-label="Enabled"
          @update:model-value="formData.enabled = $event"
        />
      </SettingRow>

      <!-- Test connection Button (if plugin supports it) -->
      <div v-if="hasTestAction" class="form-group">
        <Button
          variant="secondary"
          :disabled="testing"
          :loading="testing"
          loading-label="Testing…"
          @click="handleTest"
        >
          Test connection
        </Button>
        <InlineNote
          v-if="testStatus"
          class="instance-modal__note"
          :tone="testStatus.success ? 'ok' : 'err'"
        >
          {{ testStatus.message }}
        </InlineNote>
      </div>
    </form>

    <template #actions>
      <Button @click="handleClose">Cancel</Button>
      <Button
        type="submit"
        form="instance-form"
        variant="primary"
        :loading="saving"
        loading-label="Saving…"
      >
        Save
      </Button>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import { isHiddenField } from "@/utils/pluginFields";
import * as pluginsApi from "@/services/pluginsApi";
import { useCalendarStore } from "@/stores/calendar";
import { eventSwatches, nextEventColour } from "@/utils/themePalettes";
import { errorDetailMessage } from "@/utils/apiErrors";

// Plain words: the form adds a source, never an "instance". The plugin's own
// instance_label wins, then the kind's noun.
const instanceLabelMap = {
  calendar: "calendar source",
  image: "photo source",
  backend: "source",
  service: "source",
};

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  plugin: {
    type: Object,
    default: null,
  },
  instance: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["close", "save"]); // save event may include calendar config data

const calendarStore = useCalendarStore();

const currentPlugin = ref(null);
const editingInstance = ref(null);
const formData = ref({
  name: "",
  enabled: true,
  // Calendar-specific fields
  color: "#275f86",
  show_time: true,
});
const error = ref("");
const saving = ref(false);
const testing = ref(false);
const testStatus = ref(null);
const geocoding = ref(false);
const geocodeStatus = ref(null);

// The eight curated calendar colours, in the theme currently in use.
const swatches = computed(() => eventSwatches());

const instanceLabel = computed(() => {
  const plugin = currentPlugin.value;
  return plugin?.instance_label || instanceLabelMap[plugin?.type] || "source";
});

// The form shows only real instance settings: `hidden` fields and type-level
// internals (display_order) are never rendered, though their defaults still
// travel with the saved config.
const instanceFields = computed(() => {
  const schema = currentPlugin.value?.instance_config_schema;
  if (!schema || typeof schema !== "object") return [];
  return Object.entries(schema).filter(([key, field]) => !isHiddenField(key, field));
});

// "Add Recipe list" when the plugin names its instances; otherwise "Add a source".
const addTitle = computed(() => {
  const declared = currentPlugin.value?.instance_label;
  return declared ? `Add ${declared}` : `Add a ${instanceLabel.value}`;
});

// A label that just repeats the kind ("calendar") makes a poor example, so a
// calendar suggests a real name and other kinds drop the placeholder.
const namePlaceholder = computed(() => {
  const plugin = currentPlugin.value;
  if (!plugin?.instance_label) return "e.g. Family photos";
  if (plugin.type === "calendar") return "e.g. Family";
  if (plugin.instance_label.toLowerCase() === String(plugin.type || "").toLowerCase()) return "";
  return `e.g. ${plugin.instance_label}`;
});

// Config values are bare scalars (the backend normalizes legacy wrappers);
// this only fills schema defaults for fields the instance hasn't set yet.
const configValueOrDefault = (value, schema = {}) => {
  if (value !== undefined) return value;
  if (schema.default !== undefined) return schema.default;
  return schema.type === "boolean" ? false : "";
};

// Secret values never come back from the API: an edited instance carries ""
// plus has_value[key]. Say a value is saved; a blank field keeps it on save.
const fieldSchema = (key, schema) => {
  if (!editingInstance.value?.has_value?.[key]) return schema;
  return {
    ...schema,
    ui: { ...(schema.ui || {}), placeholder: "Saved — leave blank to keep" },
  };
};

// Computed property for test action check
const hasTestAction = computed(() => {
  return (
    currentPlugin.value?.ui_actions &&
    currentPlugin.value.ui_actions.some(action => action.type === "test")
  );
});

// A plugin gets the location-lookup button by declaring a geocode ui_action
// in its metadata — never by id.
const hasGeocodeAction = computed(() => {
  return Boolean(
    currentPlugin.value?.ui_actions &&
      currentPlugin.value.ui_actions.some(action => action.type === "geocode")
  );
});

const initializeForm = async () => {
  if (!currentPlugin.value) return;

  const form = {
    name: "",
    enabled: true,
    // Calendar-specific defaults
    color: "#275f86",
    show_time: true,
  };

  if (editingInstance.value) {
    // Editing: use instance values
    form.name = editingInstance.value.name || "";
    form.enabled =
      editingInstance.value.enabled !== undefined ? editingInstance.value.enabled : true;

    if (currentPlugin.value.instance_config_schema) {
      for (const [key, schema] of Object.entries(currentPlugin.value.instance_config_schema)) {
        form[key] = configValueOrDefault(editingInstance.value.config?.[key], schema);
      }
    }

    // Load calendar-specific settings if editing calendar instance
    if (currentPlugin.value.type === "calendar") {
      try {
        await calendarStore.fetchSources();
        const source = calendarStore.sources.find(s => s.id === editingInstance.value.id);
        if (source) {
          // Convert color to hex format if needed
          if (source.color) {
            if (source.color.startsWith("#")) {
              form.color = source.color;
            } else {
              // Convert named color to hex
              const colorMap = {
                green: "#4caf50",
                red: "#f44336",
                blue: "#275f86",
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
              form.color = colorMap[source.color.toLowerCase()] || "#275f86";
            }
          }
          form.show_time = source.show_time !== false;
        }
      } catch (error) {
        console.error("Failed to load calendar source settings:", error);
        // Continue with defaults
      }
    }
  } else {
    // New instance: use schema defaults
    if (currentPlugin.value.instance_config_schema) {
      for (const [key, schema] of Object.entries(currentPlugin.value.instance_config_schema)) {
        if (schema.default !== undefined) {
          form[key] = schema.default;
        } else if (schema.type === "boolean") {
          form[key] = false;
        } else {
          form[key] = "";
        }
      }
    }

    // A new calendar takes the next unused palette colour (audit §3).
    if (currentPlugin.value.type === "calendar") {
      try {
        await calendarStore.fetchSources();
        form.color = nextEventColour((calendarStore.sources || []).map(source => source.color));
      } catch (error) {
        console.error("Failed to pick a calendar colour:", error);
      }
    }
  }

  formData.value = form;
  error.value = "";
};

// Watch for plugin/instance changes. These live below initializeForm: an
// immediate watcher runs during setup, so calling a const declared later threw.
watch(
  () => props.plugin,
  newPlugin => {
    if (newPlugin) {
      currentPlugin.value = newPlugin;
      initializeForm();
    }
  },
  { immediate: true }
);

watch(
  () => props.instance,
  newInstance => {
    editingInstance.value = newInstance;
    if (newInstance) {
      initializeForm();
    }
  },
  { immediate: true }
);

watch(
  () => props.show,
  newShow => {
    if (newShow) {
      initializeForm();
    } else {
      // Reset on close
      error.value = "";
      saving.value = false;
      testing.value = false;
      testStatus.value = null;
      geocoding.value = false;
      geocodeStatus.value = null;
    }
  }
);

const getFormValue = (key, schema) => {
  return configValueOrDefault(formData.value[key], schema);
};

const updateFormValue = (key, value) => {
  formData.value[key] = value;
};

const dialogTitle = computed(() =>
  editingInstance.value
    ? `Edit ${editingInstance.value.name || instanceLabel.value}`
    : addTitle.value
);

// The shared Dialog closes itself (scrim, Escape or its close button); the
// form treats that as Cancel and leaves saving to the Save button.
const handleDialog = open => {
  if (!open) handleClose();
};

const handleClose = () => {
  emit("close");
};

const handleGeocode = async () => {
  if (!currentPlugin.value || !formData.value.location) return;

  geocoding.value = true;
  geocodeStatus.value = null;
  error.value = "";

  try {
    const location = formData.value.location.trim();
    if (!location) {
      geocodeStatus.value = {
        success: false,
        message: "Please enter a location name first",
      };
      return;
    }

    const result = await pluginsApi.geocodeLocation(currentPlugin.value.id, location);

    if (result.success) {
      // Update coordinates if they exist in the schema
      if (result.latitude !== undefined) {
        updateFormValue("latitude", result.latitude);
      }
      if (result.longitude !== undefined) {
        updateFormValue("longitude", result.longitude);
      }

      // Update location field with the geocoded display name for better UX
      if (result.display_name) {
        updateFormValue("location", result.display_name);
      }

      geocodeStatus.value = {
        success: true,
        message: result.message || `Coordinates found: ${result.latitude}, ${result.longitude}`,
      };

      // Clear message after 5 seconds
      setTimeout(() => {
        geocodeStatus.value = null;
      }, 5000);
    } else {
      geocodeStatus.value = {
        success: false,
        message: result.message || "Failed to geocode location",
      };
    }
  } catch (err) {
    console.error("Failed to geocode location:", err);
    geocodeStatus.value = {
      success: false,
      message: errorDetailMessage(err, "Failed to geocode location"),
    };
  } finally {
    geocoding.value = false;
  }
};

const handleTest = async () => {
  if (!currentPlugin.value) return;

  testing.value = true;
  testStatus.value = null;
  error.value = "";

  try {
    const pluginId = currentPlugin.value.id;
    const plugin = currentPlugin.value;

    // Build test config from instance form data
    const testConfig = {};
    if (plugin.instance_config_schema) {
      for (const [key, schema] of Object.entries(plugin.instance_config_schema)) {
        // Skip display_order - it's a global plugin setting
        if (key === "display_order") {
          continue;
        }
        const value = configValueOrDefault(formData.value[key], schema);
        if (value !== undefined && value !== null) {
          // Handle different types
          if (schema.type === "string" && typeof value === "string") {
            testConfig[key] = value.trim();
          } else if (schema.type === "integer" || schema.type === "number") {
            // Preserve a legitimate 0 — Number(0) is falsy so `|| default` would drop it.
            testConfig[key] = value !== "" ? Number(value) : (schema.default ?? 0);
          } else if (schema.type === "boolean") {
            testConfig[key] = Boolean(value);
          } else {
            testConfig[key] = value;
          }
        } else if (schema.default !== undefined) {
          testConfig[key] = schema.default;
        }
      }
    }

    // When editing, blank secrets are filled server-side from the stored instance.
    const response = await pluginsApi.testPlugin(pluginId, testConfig, editingInstance.value?.id);

    testStatus.value = {
      success: response.success,
      message: response.message,
    };

    // Clear test status after 5 seconds
    setTimeout(() => {
      if (testStatus.value) {
        testStatus.value = null;
      }
    }, 5000);
  } catch (err) {
    console.error("Failed to test instance connection:", err);
    testStatus.value = {
      success: false,
      message: errorDetailMessage(err, "Failed to test connection"),
    };
  } finally {
    testing.value = false;
  }
};

const handleSave = async () => {
  if (!currentPlugin.value) return;

  saving.value = true;
  error.value = "";

  try {
    const pluginId = currentPlugin.value.id;
    const plugin = currentPlugin.value;

    // Build config from instance_config_schema fields
    // Exclude display_order - it's a global plugin setting, not instance-specific
    const config = {};
    if (plugin.instance_config_schema) {
      for (const [key, schema] of Object.entries(plugin.instance_config_schema)) {
        // Skip display_order - it's handled at the plugin level
        if (key === "display_order") {
          continue;
        }
        const value = configValueOrDefault(formData.value[key], schema);
        if (value !== undefined && value !== null) {
          // Handle different types
          if (schema.type === "string" && typeof value === "string") {
            config[key] = value.trim();
          } else if (schema.type === "integer" || schema.type === "number") {
            // Preserve a legitimate 0 — Number(0) is falsy so `|| default` would drop it.
            config[key] = value !== "" ? Number(value) : (schema.default ?? 0);
          } else if (schema.type === "boolean") {
            config[key] = Boolean(value);
          } else {
            config[key] = value;
          }
        } else if (schema.default !== undefined) {
          config[key] = schema.default;
        }
      }
    }

    config.enabled = formData.value.enabled;

    if (editingInstance.value) {
      // Update existing instance
      await pluginsApi.updatePluginInstance(editingInstance.value.id, {
        name: formData.value.name.trim(),
        config,
        enabled: config.enabled,
        plugin_id: editingInstance.value.plugin_id || pluginId, // Pass plugin type ID
      });

      // Update calendar-specific settings if calendar plugin
      if (plugin.type === "calendar") {
        try {
          await calendarStore.fetchSources();
          const source = calendarStore.sources.find(s => s.id === editingInstance.value.id);
          if (source) {
            await calendarStore.updateSource(editingInstance.value.id, {
              ...source,
              color: formData.value.color || "#275f86",
              show_time: formData.value.show_time !== false,
            });
          }
        } catch (error) {
          console.error("Failed to update calendar source settings:", error);
          // Don't fail the whole save if calendar settings fail
        }
      }
    } else {
      // Create new instance
      await pluginsApi.createPluginInstance(pluginId, {
        name: formData.value.name.trim(),
        config,
        enabled: config.enabled,
      });

      // Create calendar source if calendar plugin
      // Note: We need to wait for the instance to be created and get its ID
      // We'll emit 'save' which triggers a reload, then create the calendar source
      // For now, pass calendar-specific data in the emit so parent can handle it
    }

    // Emit save with calendar-specific data if needed
    const saveData =
      plugin.type === "calendar" && !editingInstance.value
        ? {
            isCalendar: true,
            instanceName: formData.value.name.trim(),
            calendarConfig: {
              color: formData.value.color || "#275f86",
              show_time: formData.value.show_time !== false,
              ical_url: config.ical_url || "",
              type: pluginId,
            },
          }
        : null;

    emit("save", saveData);
    handleClose();
  } catch (err) {
    console.error("Failed to save instance:", err);
    error.value = errorDetailMessage(err, "Failed to save instance");
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.instance-form {
  display: flex;
  flex-direction: column;
  gap: var(--gap-group);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
}

.colour-label {
  margin-bottom: var(--gap-1);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.colour-row {
  display: flex;
  align-items: flex-end;
  gap: var(--gap-inline);
}

.color-input {
  width: 3.75rem;
  height: var(--control-height);
  cursor: pointer;
}

.colour-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-2);
  margin-top: var(--gap-2);
}

.colour-swatch {
  width: 1.75rem; /* 28px */
  height: 1.75rem;
  padding: 0;
  border: 2px solid var(--line);
  border-radius: var(--radius-control);
  cursor: pointer;
}

.colour-swatch.selected {
  border-color: var(--ink);
  box-shadow: var(--elev-1);
}

.colour-swatch:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.colour-value {
  flex: 1;
}

.instance-modal__geocode {
  align-self: flex-start;
}

.instance-modal__note {
  margin-top: var(--gap-1);
}
</style>
