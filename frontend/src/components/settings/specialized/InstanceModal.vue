<template>
  <div v-if="show" class="modal-overlay dialog-above-osk" @click.self="handleClose">
    <div class="modal-content instance-modal">
      <div class="modal-header">
        <h3>
          {{ editingInstance ? `Edit ${editingInstance.name || instanceLabel}` : addTitle }}
        </h3>
        <IconButton variant="ghost" label="Close" @click="handleClose">×</IconButton>
      </div>
      <div class="modal-body">
        <div v-if="error" class="error-message">
          {{ error }}
        </div>
        <form @submit.prevent="handleSave">
          <div class="form-group">
            <label>Name</label>
            <input
              v-model="formData.name"
              type="text"
              class="form-input"
              :placeholder="namePlaceholder"
              required
            />
          </div>

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
              <div
                v-if="key === 'location' && geocodeStatus"
                :class="geocodeStatus.success ? 'success-message' : 'error-message'"
                style="margin-top: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-xs)"
              >
                {{ geocodeStatus.message }}
              </div>
            </div>
          </template>

          <!-- Fallback for plugins without instance_config_schema -->
          <template v-else>
            <div class="form-group">
              <p class="help-text">This plugin type has no settings of its own.</p>
            </div>
          </template>

          <!-- Calendar-specific fields (colour and show_time) -->
          <template v-if="currentPlugin?.type === 'calendar'">
            <div class="form-group">
              <ColourField
                v-model="formData.color"
                label="Colour"
                hint="These eight follow the theme; pick a custom colour if you need one."
              />
            </div>
            <div class="form-group">
              <div class="toggle-row">
                <span class="toggle-row__label">Show event times</span>
                <ToggleSwitch
                  :model-value="formData.show_time"
                  aria-label="Show event times"
                  @update:model-value="formData.show_time = $event"
                />
              </div>
              <span class="help-text">
                Display time information for events from this calendar
              </span>
            </div>
          </template>

          <!-- Enable/Disable -->
          <div class="form-group">
            <div class="toggle-row">
              <span class="toggle-row__label">Enabled</span>
              <ToggleSwitch
                :model-value="formData.enabled"
                aria-label="Enabled"
                @update:model-value="formData.enabled = $event"
              />
            </div>
          </div>

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
            <div
              v-if="testStatus"
              :class="testStatus.success ? 'success-message' : 'error-message'"
              style="margin-top: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-xs)"
            >
              {{ testStatus.message }}
            </div>
          </div>

          <div class="modal-actions">
            <Button @click="handleClose">Cancel</Button>
            <Button type="submit" variant="primary" :loading="saving" loading-label="Saving…">
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";
import IconButton from "@/components/ui/IconButton.vue";
import Button from "@/components/ui/Button.vue";
import ColourField from "@/components/ui/ColourField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import { isHiddenField } from "@/utils/pluginFields";
import * as pluginsApi from "@/services/pluginsApi";
import { useCalendarStore } from "@/stores/calendar";
import { nextEventColour } from "@/utils/themePalettes";
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
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--ink) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.instance-modal {
  background: var(--bg-1);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px var(--shadow);
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid var(--line);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 600;
  color: var(--ink);
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 0.5rem;
  font-size: var(--fs-md);
  font-family: var(--font-ui);
}

.form-input {
  width: 100%;
  height: var(--control-height);
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  font-size: var(--fs-md);
  font-family: inherit;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent);
}

.form-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.toggle-row__label {
  font-weight: 600;
  color: var(--ink);
  font-size: var(--fs-md);
  font-family: var(--font-ui);
}

.help-text {
  font-size: var(--text-meta);
  color: var(--ink-2);
  margin-top: var(--gap-1);
  line-height: normal;
}

.error-message {
  padding: 0.75rem 1rem;
  background: color-mix(in srgb, var(--err) 10%, transparent);
  color: var(--err-text);
  border: 1px solid color-mix(in srgb, var(--err) 30%, transparent);
  border-radius: var(--radius-xs);
  margin-bottom: 1rem;
}

.success-message {
  padding: 0.75rem 1rem;
  background: color-mix(in srgb, var(--ok) 10%, transparent);
  color: var(--ok-text);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent);
  border-radius: var(--radius-xs);
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  /* Sticky footer: on a short 800x480 kiosk the modal scrolls internally, so
     pin Save/Cancel to the bottom edge instead of leaving them below the fold
     (calvin-g7v). Negative margins bleed the bar to the body edges and cancel
     modal-body's bottom padding so it sits flush. */
  position: sticky;
  bottom: 0;
  z-index: 1;
  margin: 2rem -1.5rem -1.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--bg-1);
  border-top: 1px solid var(--line);
}

.instance-modal__geocode {
  margin-top: 0.5rem;
}
</style>
