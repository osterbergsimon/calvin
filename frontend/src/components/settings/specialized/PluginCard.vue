<template>
  <div class="plugin-card">
    <!-- Plugin Header -->
    <div class="plugin-header">
      <div class="plugin-header-top">
        <div class="plugin-info">
          <div class="plugin-title-row">
            <!-- Running indicator -->
            <span
              v-if="instances.length > 0"
              class="running-indicator-aggregate"
              :class="getAggregatedRunningClass(instances)"
              :title="getAggregatedRunningTooltip(instances)"
            >
              {{ getAggregatedRunningSymbol(instances) }}
            </span>
            <strong>{{ plugin.name }}</strong>
            <span class="plugin-type-badge" :class="`type-${plugin.type}`">
              {{ plugin.type }}
            </span>
          </div>
          <p class="plugin-description">
            {{ plugin.description }}
          </p>
        </div>
        <div class="plugin-header-actions">
          <!-- Settings button -->
          <button
            v-if="hasSettings"
            class="btn-icon-only btn-settings-icon"
            :class="{ active: expanded }"
            :title="expanded ? 'Hide settings' : 'Show settings'"
            @click="$emit('toggle-expand', plugin.id)"
          >
            ⚙️
          </button>
          <!-- Uninstall button -->
          <button
            v-if="plugin._installed"
            class="btn-remove btn-icon-only"
            :title="plugin.type === 'theme' ? 'Uninstall this theme' : 'Uninstall this plugin'"
            @click="$emit('uninstall', plugin.id, plugin.type)"
          >
            🗑️
          </button>
          <label class="toggle-switch">
            <input
              type="checkbox"
              :checked="plugin.enabled"
              @change="$emit('toggle-enabled', plugin.id, $event.target.checked)"
            />
            <span class="slider" />
          </label>
        </div>
      </div>
    </div>

    <!-- Plugin Config (when expanded) -->
    <div v-if="plugin.enabled && expanded" class="plugin-config">
      <!-- Plugin Settings -->
      <div v-if="hasGlobalSettings">
        <h4 class="config-section-title">Plugin Settings</h4>
        <div v-for="(schema, key) in globalConfigSchema" :key="key" class="plugin-setting">
          <PluginFieldRenderer
            :plugin-id="plugin.id"
            :field-key="key"
            :schema="schema"
            :value="getFormValue(key, schema)"
            @update="handleUpdateFormValue(key, $event)"
          />
        </div>

        <!-- Plugin Actions -->
        <PluginActions
          v-if="pluginActions.length > 0"
          :plugin-id="plugin.id"
          :actions="pluginActions"
          :saving="saving === plugin.id || saving === true"
          :testing="typeof testing === 'object' && testing ? testing[plugin.id] || {} : {}"
          :fetching="typeof fetching === 'object' && fetching ? fetching[plugin.id] || {} : {}"
          :save-status="saveStatus"
          :test-status="testStatus"
          :fetch-status="fetchStatus"
          :form-data="formData"
          @save="$emit('save-config', plugin.id)"
          @test="$emit('test-connection', plugin.id)"
          @fetch="$emit('fetch-now', plugin.id)"
          @custom-action="handleCustomAction"
        />
      </div>

      <!-- Plugin Sections -->
      <PluginSections
        v-if="plugin.ui_sections && plugin.ui_sections.length > 0 && plugin.enabled"
        :plugin-id="plugin.id"
        :plugin-instances="instances"
        :sections="plugin.ui_sections"
        :images="images"
        :uploading="uploading"
        :upload-error="uploadError"
        :upload-success="uploadSuccess"
        @upload="$emit('upload', $event)"
        @delete-image="$emit('delete-image', $event)"
      />

      <!-- Plugin Instances -->
      <PluginInstances
        v-if="showInstances"
        :plugin="plugin"
        :instances="instances"
        :get-instance-summary="instance => getInstanceSummary(plugin, instance)"
        @add-instance="$emit('add-instance', plugin.id)"
        @edit-instance="handleEditInstance"
        @delete-instance="$emit('delete-instance', $event)"
        @toggle-instance="handleToggleInstance"
        @order-change="handleInstanceOrderChange"
      />
    </div>

    <!-- Disabled Message -->
    <div v-else-if="!plugin.enabled" class="plugin-disabled-message">
      <p class="help-text">
        This plugin type is disabled. It won't appear in dropdowns and existing instances will be
        hidden (but not deleted).
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import PluginFieldRenderer from "../../PluginFieldRenderer.vue";
import PluginActions from "../../PluginActions.vue";
import PluginSections from "../../PluginSections.vue";
import PluginInstances from "./PluginInstances.vue";

const props = defineProps({
  plugin: {
    type: Object,
    required: true,
  },
  instances: {
    type: Array,
    default: () => [],
  },
  expanded: {
    type: Boolean,
    default: false,
  },
  formData: {
    type: Object,
    default: () => ({}),
  },
  saving: {
    type: [String, null, Boolean],
    default: null,
  },
  testing: {
    type: [Object, Boolean],
    default: () => ({}),
  },
  fetching: {
    type: [Object, Boolean],
    default: () => ({}),
  },
  saveStatus: {
    type: Object,
    default: null,
  },
  testStatus: {
    type: Object,
    default: null,
  },
  fetchStatus: {
    type: Object,
    default: null,
  },
  images: {
    type: Array,
    default: () => [],
  },
  uploading: {
    type: Boolean,
    default: false,
  },
  uploadError: {
    type: String,
    default: "",
  },
  uploadSuccess: {
    type: String,
    default: "",
  },
});

const emit = defineEmits([
  "toggle-expand",
  "toggle-enabled",
  "uninstall",
  "update-form-value",
  "save-config",
  "test-connection",
  "fetch-now",
  "custom-action",
  "add-instance",
  "edit-instance",
  "delete-instance",
  "toggle-instance",
  "instance-order-change",
  "upload",
  "delete-image",
]);

const hasSettings = computed(() => {
  return (
    Object.keys(props.plugin.config_schema || {}).length > 0 ||
    Object.keys(props.plugin.instance_config_schema || {}).length > 0 ||
    props.instances.length > 0
  );
});

const globalConfigSchema = computed(() => {
  return getGlobalConfigSchema(props.plugin);
});

const hasGlobalSettings = computed(() => {
  return Object.keys(globalConfigSchema.value).length > 0;
});

const pluginActions = computed(() => {
  const actions = props.plugin.ui_actions || [];
  if (actions.length > 0) return actions;
  if (!hasGlobalSettings.value) return [];
  return [
    {
      id: "save",
      type: "save",
      label: "Save Settings",
      style: "primary",
    },
  ];
});

const showInstances = computed(() => {
  return (
    props.plugin.enabled &&
    props.plugin.type !== "theme" &&
    props.plugin.supports_multiple_instances !== false
  );
});

// Trust schema placement: common_config_schema = global, instance_config_schema = instance.
// Skip internal _ fields and fields marked hidden in their UI config.
const getGlobalConfigSchema = plugin => {
  return Object.fromEntries(
    Object.entries(plugin.common_config_schema || {}).filter(
      ([key, schema]) => !key.startsWith("_") && !schema.ui?.hidden
    )
  );
};

const getInstanceSummary = (plugin, instance) => {
  const schema = plugin.instance_config_schema || {};
  const config = instance.config || {};
  for (const [key, fieldSchema] of Object.entries(schema)) {
    if (key.startsWith("_") || fieldSchema.type !== "string") continue;
    const val = config[key];
    if (val && typeof val === "string" && val.trim()) {
      return val.length > 60 ? val.slice(0, 57) + "..." : val;
    }
  }
  return null;
};

const unwrapConfigValue = (value, schema = {}) => {
  if (value && typeof value === "object") {
    if ("value" in value) return value.value ?? "";
    if ("default" in value) return value.default ?? "";
  }
  if (value !== undefined && value !== null) return value;
  return schema.default ?? (schema.type === "boolean" ? false : "");
};

const getFormValue = (key, schema) => {
  return unwrapConfigValue(props.formData[key], schema);
};

const getAggregatedRunningClass = instances => {
  const runningCount = instances.filter(i => i.running).length;
  const totalCount = instances.length;

  if (runningCount === 0) return "all-stopped";
  if (runningCount === totalCount) return "all-running";
  return "partial-running";
};

const getAggregatedRunningTooltip = instances => {
  const runningCount = instances.filter(i => i.running).length;
  const totalCount = instances.length;
  return `${runningCount}/${totalCount} instances running`;
};

const getAggregatedRunningSymbol = instances => {
  const runningCount = instances.filter(i => i.running).length;
  const totalCount = instances.length;

  if (runningCount === 0) return "○";
  if (runningCount === totalCount) return "●";
  return "◐";
};

const handleUpdateFormValue = (key, value) => {
  emit("update-form-value", props.plugin.id, key, value);
};

const handleCustomAction = action => {
  emit("custom-action", props.plugin.id, action);
};

const handleEditInstance = instance => {
  emit("edit-instance", props.plugin.id, instance);
};

const handleToggleInstance = (instanceId, enabled) => {
  emit("toggle-instance", instanceId, enabled);
};

const handleInstanceOrderChange = newOrder => {
  emit("instance-order-change", props.plugin.id, newOrder);
};
</script>

<style scoped>
.plugin-card {
  width: 100%;
}

.plugin-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.plugin-header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.plugin-info {
  flex: 1;
}

.plugin-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.running-indicator-aggregate {
  font-size: 1.2rem;
  line-height: 1;
}

.running-indicator-aggregate.all-running {
  color: #4caf50;
}

.running-indicator-aggregate.all-stopped {
  color: #f44336;
}

.running-indicator-aggregate.partial-running {
  color: #ff9800;
}

.plugin-type-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.plugin-type-badge.type-calendar {
  background: #e3f2fd;
  color: #1976d2;
}

.plugin-type-badge.type-image {
  background: #f3e5f5;
  color: #7b1fa2;
}

.plugin-type-badge.type-service {
  background: #e8f5e9;
  color: #388e3c;
}

.plugin-type-badge.type-theme {
  background: #fff3e0;
  color: #f57c00;
}

.plugin-type-badge.type-backend {
  background: #e1bee7;
  color: #6a1b9a;
}

.plugin-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.plugin-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-icon-only {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon-only:hover {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.btn-icon-only.active {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.btn-remove {
  color: #f44336;
}

.btn-remove:hover {
  background: rgba(244, 67, 54, 0.1);
  border-color: #f44336;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
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
  background-color: #ccc;
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

input:checked + .slider {
  background-color: var(--accent-primary);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.plugin-config {
  padding: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.config-section-title {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.plugin-setting {
  margin-bottom: 1rem;
}

.plugin-disabled-message {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
}

.help-text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.4;
}
</style>
