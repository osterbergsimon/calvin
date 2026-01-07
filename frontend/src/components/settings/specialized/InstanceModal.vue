<template>
  <div v-if="show" class="modal-overlay" @click.self="handleClose">
    <div class="modal-content instance-modal">
      <div class="modal-header">
        <h3>
          {{
            editingInstance
              ? `Edit ${currentPlugin?.name || "Instance"}`
              : `Add ${currentPlugin?.name || "Instance"}`
          }}
        </h3>
        <button class="btn-close-modal" @click="handleClose">×</button>
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
                :class="
                  geocodeStatus.success ? 'success-message' : 'error-message'
                "
                style="
                  margin-top: 0.5rem;
                  padding: 0.5rem 1rem;
                  border-radius: 4px;
                "
              >
                {{ geocodeStatus.message }}
              </div>
            </div>
          </template>

          <!-- Fallback for plugins without instance_config_schema -->
          <template v-else>
            <div class="form-group">
              <p class="help-text">
                This plugin type does not support instance-specific
                configuration.
              </p>
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
            <button
              type="button"
              class="btn-secondary"
              :disabled="testing"
              @click="handleTest"
            >
              {{ testing ? "Testing..." : "Test Connection" }}
            </button>
            <div
              v-if="testStatus"
              :class="testStatus.success ? 'success-message' : 'error-message'"
              style="
                margin-top: 0.5rem;
                padding: 0.5rem 1rem;
                border-radius: 4px;
              "
            >
              {{ testStatus.message }}
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="handleClose">
              Cancel
            </button>
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
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";
import * as pluginsApi from "@/services/pluginsApi";

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

const emit = defineEmits(["close", "save"]);

const currentPlugin = ref(null);
const editingInstance = ref(null);
const formData = ref({
  name: "",
  enabled: true,
});
const error = ref("");
const saving = ref(false);
const testing = ref(false);
const testStatus = ref(null);
const geocoding = ref(false);
const geocodeStatus = ref(null);

// Computed property for test action check
const hasTestAction = computed(() => {
  return (
    currentPlugin.value?.ui_actions &&
    currentPlugin.value.ui_actions.some((action) => action.type === "test")
  );
});

// Computed property for geocode action check (check if plugin has geocode endpoint)
const hasGeocodeAction = computed(() => {
  if (!currentPlugin.value) return false;
  // Check if plugin has a geocode action in ui_actions, or if it's a weather plugin
  const hasGeocodeInActions =
    currentPlugin.value.ui_actions &&
    currentPlugin.value.ui_actions.some(
      (action) =>
        action.type === "geocode" || action.endpoint?.includes("geocode"),
    );
  // Also check plugin ID or type for common weather plugins
  const isWeatherPlugin =
    currentPlugin.value.id === "yr.no" ||
    currentPlugin.value.id === "yr_weather" ||
    currentPlugin.value.type === "weather";
  return hasGeocodeInActions || isWeatherPlugin;
});

// Watch for plugin/instance changes
watch(
  () => props.plugin,
  (newPlugin) => {
    if (newPlugin) {
      currentPlugin.value = newPlugin;
      initializeForm();
    }
  },
  { immediate: true },
);

watch(
  () => props.instance,
  (newInstance) => {
    editingInstance.value = newInstance;
    if (newInstance) {
      initializeForm();
    }
  },
  { immediate: true },
);

watch(
  () => props.show,
  (newShow) => {
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
  },
);

const initializeForm = () => {
  if (!currentPlugin.value) return;

  const form = {
    name: "",
    enabled: true,
  };

  if (editingInstance.value) {
    // Editing: use instance values
    form.name = editingInstance.value.name || "";
    form.enabled =
      editingInstance.value.enabled !== undefined
        ? editingInstance.value.enabled
        : true;

    if (currentPlugin.value.instance_config_schema) {
      for (const [key, schema] of Object.entries(
        currentPlugin.value.instance_config_schema,
      )) {
        form[key] =
          editingInstance.value.config?.[key] !== undefined
            ? editingInstance.value.config[key]
            : schema.default !== undefined
              ? schema.default
              : schema.type === "boolean"
                ? false
                : "";
      }
    }
  } else {
    // New instance: use schema defaults
    if (currentPlugin.value.instance_config_schema) {
      for (const [key, schema] of Object.entries(
        currentPlugin.value.instance_config_schema,
      )) {
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
  return formData.value[key] !== undefined
    ? formData.value[key]
    : schema.default !== undefined
      ? schema.default
      : schema.type === "boolean"
        ? false
        : "";
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

    const result = await pluginsApi.geocodeLocation(
      currentPlugin.value.id,
      location,
    );

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
        message:
          result.message ||
          `Coordinates found: ${result.latitude}, ${result.longitude}`,
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
      message:
        err.response?.data?.detail ||
        err.message ||
        "Failed to geocode location",
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
      for (const [key, schema] of Object.entries(
        plugin.instance_config_schema,
      )) {
        // Skip display_order - it's a global plugin setting
        if (key === "display_order") {
          continue;
        }
        const value = formData.value[key];
        if (value !== undefined && value !== null) {
          // Handle different types
          if (schema.type === "string" && typeof value === "string") {
            testConfig[key] = value.trim();
          } else if (schema.type === "integer" || schema.type === "number") {
            testConfig[key] = Number(value) || schema.default || 0;
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
      message:
        err.response?.data?.detail ||
        err.message ||
        "Failed to test connection",
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
      for (const [key, schema] of Object.entries(
        plugin.instance_config_schema,
      )) {
        // Skip display_order - it's handled at the plugin level
        if (key === "display_order") {
          continue;
        }
        const value = formData.value[key];
        if (value !== undefined && value !== null) {
          // Handle different types
          if (schema.type === "string" && typeof value === "string") {
            config[key] = value.trim();
          } else if (schema.type === "integer" || schema.type === "number") {
            config[key] = Number(value) || schema.default || 0;
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
    } else {
      // Create new instance
      await pluginsApi.createPluginInstance(pluginId, {
        name: formData.value.name.trim(),
        config,
        enabled: config.enabled,
      });
    }

    emit("save");
    handleClose();
  } catch (err) {
    console.error("Failed to save instance:", err);
    error.value =
      err.response?.data?.detail || err.message || "Failed to save instance";
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.instance-modal {
  background: var(--bg-primary);
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
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close-modal {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-close-modal:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
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
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.form-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.help-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  line-height: 1.4;
}

.error-message {
  padding: 0.75rem 1rem;
  background: #fee;
  color: #c33;
  border: 1px solid #fcc;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.success-message {
  padding: 0.75rem 1rem;
  background: #efe;
  color: #3c3;
  border: 1px solid #cfc;
  border-radius: 4px;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--accent-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1976d2;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-geocode {
  margin-top: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-geocode:hover:not(:disabled) {
  background: #1976d2;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-geocode:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
