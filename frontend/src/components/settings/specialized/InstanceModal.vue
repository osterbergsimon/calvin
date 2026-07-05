<template>
  <div v-if="show" class="modal-overlay" @click.self="handleClose">
    <div class="modal-content instance-modal">
      <div class="modal-header">
        <h3>
          {{
            editingInstance
              ? `Edit ${currentPlugin?.name || "Instance"}`
              : `Add ${currentPlugin?.name || ""} ${instanceLabel}`
          }}
        </h3>
        <IconButton variant="ghost" label="Close" @click="handleClose">×</IconButton>
      </div>
      <div class="modal-body">
        <div v-if="error" class="error-message">
          {{ error }}
        </div>
        <form @submit.prevent="handleSave">
          <!-- Instance Name -->
          <div class="form-group">
            <label>Instance Name</label>
            <input
              v-model="formData.name"
              type="text"
              class="form-input"
              placeholder="Enter instance name"
              required
            />
          </div>

          <!-- Instance-specific fields from instance_config_schema -->
          <template
            v-if="
              currentPlugin?.instance_config_schema &&
              Object.keys(currentPlugin.instance_config_schema).length > 0
            "
          >
            <div
              v-for="(schema, key) in currentPlugin.instance_config_schema"
              :key="key"
              class="form-group"
            >
              <PluginFieldRenderer
                :plugin-id="currentPlugin.id"
                :field-key="key"
                :schema="schema"
                :value="getFormValue(key, schema)"
                @update="updateFormValue(key, $event)"
              />
              <!-- Geocode button for location field (for weather plugins like YR.no) -->
              <button
                v-if="key === 'location' && hasGeocodeAction"
                type="button"
                class="btn-geocode"
                :disabled="geocoding || !formData.location"
                @click="handleGeocode"
              >
                {{ geocoding ? "Geocoding..." : "Get Coordinates" }}
              </button>
              <div
                v-if="key === 'location' && geocodeStatus"
                :class="geocodeStatus.success ? 'success-message' : 'error-message'"
                style="margin-top: 0.5rem; padding: 0.5rem 1rem; border-radius: 4px"
              >
                {{ geocodeStatus.message }}
              </div>
            </div>
          </template>

          <!-- Fallback for plugins without instance_config_schema -->
          <template v-else>
            <div class="form-group">
              <p class="help-text">
                This plugin type does not support instance-specific configuration.
              </p>
            </div>
          </template>

          <!-- Calendar-specific fields (color and show_time) -->
          <template v-if="currentPlugin?.type === 'calendar'">
            <div class="form-group">
              <label>Calendar Color</label>
              <div style="display: flex; align-items: center; gap: 0.5rem">
                <input
                  v-model="formData.color"
                  type="color"
                  class="color-input"
                  style="width: 60px; height: 40px; cursor: pointer"
                />
                <input
                  v-model="formData.color"
                  type="text"
                  class="form-input"
                  placeholder="#2196f3"
                  style="flex: 1"
                />
              </div>
              <span class="help-text"> Choose a color for events from this calendar source </span>
            </div>
            <div class="form-group">
              <label>
                <input v-model="formData.show_time" type="checkbox" />
                Show Event Times
              </label>
              <span class="help-text">
                Display time information for events from this calendar
              </span>
            </div>
          </template>

          <!-- Enable/Disable -->
          <div class="form-group">
            <label>
              <input v-model="formData.enabled" type="checkbox" />
              Enable this instance
            </label>
          </div>

          <!-- Test Connection Button (if plugin supports it) -->
          <div v-if="hasTestAction" class="form-group">
            <button type="button" class="btn-secondary" :disabled="testing" @click="handleTest">
              {{ testing ? "Testing..." : "Test Connection" }}
            </button>
            <div
              v-if="testStatus"
              :class="testStatus.success ? 'success-message' : 'error-message'"
              style="margin-top: 0.5rem; padding: 0.5rem 1rem; border-radius: 4px"
            >
              {{ testStatus.message }}
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="handleClose">Cancel</button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? "Saving..." : "Save" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue";

const instanceLabelMap = {
  calendar: "Calendar Source",
  image: "Image Source",
  backend: "Instance",
  service: "Instance",
};
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";
import IconButton from "@/components/ui/IconButton.vue";
import * as pluginsApi from "@/services/pluginsApi";
import { useCalendarStore } from "@/stores/calendar";

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
  color: "#2196f3",
  show_time: true,
});
const error = ref("");
const saving = ref(false);
const testing = ref(false);
const testStatus = ref(null);
const geocoding = ref(false);
const geocodeStatus = ref(null);

const instanceLabel = computed(
  () =>
    currentPlugin.value?.instance_label || instanceLabelMap[currentPlugin.value?.type] || "Instance"
);

// Config values are bare scalars (the backend normalizes legacy wrappers);
// this only fills schema defaults for fields the instance hasn't set yet.
const configValueOrDefault = (value, schema = {}) => {
  if (value !== undefined) return value;
  if (schema.default !== undefined) return schema.default;
  return schema.type === "boolean" ? false : "";
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

// Watch for plugin/instance changes
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

const initializeForm = async () => {
  if (!currentPlugin.value) return;

  const form = {
    name: "",
    enabled: true,
    // Calendar-specific defaults
    color: "#2196f3",
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
              form.color = colorMap[source.color.toLowerCase()] || "#2196f3";
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
  }

  formData.value = form;
  error.value = "";
};

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
      message: err.response?.data?.detail || err.message || "Failed to geocode location",
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

    const response = await pluginsApi.testPlugin(pluginId, testConfig);

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
      message: err.response?.data?.detail || err.message || "Failed to test connection",
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
              color: formData.value.color || "#2196f3",
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
              color: formData.value.color || "#2196f3",
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
    error.value = err.response?.data?.detail || err.message || "Failed to save instance";
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
  border-radius: 8px;
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
  font-size: 1.25rem;
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
  font-size: 0.95rem;
  font-family: var(--font-ui);
}

.form-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  font-size: 0.9rem;
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

.help-text {
  font-size: 0.875rem;
  color: var(--ink-2);
  margin-top: 0.25rem;
  line-height: 1.4;
}

.error-message {
  padding: 0.75rem 1rem;
  background: color-mix(in srgb, var(--err) 10%, transparent);
  color: var(--err);
  border: 1px solid color-mix(in srgb, var(--err) 30%, transparent);
  border-radius: 4px;
  margin-bottom: 1rem;
}

.success-message {
  padding: 0.75rem 1rem;
  background: color-mix(in srgb, var(--ok) 10%, transparent);
  color: var(--ok);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent);
  border-radius: 4px;
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

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  min-height: var(--touch-target);
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--focus);
  color: white;
  border: 1px solid var(--focus);
}

.btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--focus), black 12%);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.btn-secondary {
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-2);
  border-color: var(--focus);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.btn-geocode {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  min-height: var(--touch-target);
  background: var(--focus);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-geocode:hover:not(:disabled) {
  background: color-mix(in srgb, var(--focus), black 12%);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-geocode:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-geocode:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
