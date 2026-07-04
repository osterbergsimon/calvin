<template>
  <div class="pc-card" :class="{ 'pc-card--off': !plugin.enabled }">
    <!-- Header: identity + enable -->
    <div class="pc-head">
      <span
        v-if="statusDot"
        class="pc-dot"
        :class="`pc-dot--${statusDot}`"
        :title="statusSummary"
        aria-hidden="true"
      />
      <span class="pc-name">{{ plugin.name }}</span>
      <span class="pc-badge">{{ plugin.type }}</span>
      <span class="pc-spacer" />
      <ToggleSwitch
        :model-value="plugin.enabled"
        :aria-label="`Enable ${plugin.name}`"
        @update:model-value="$emit('toggle-enabled', plugin.id, $event)"
      />
    </div>

    <!-- Meta: status summary + actions -->
    <div class="pc-meta">
      <span class="pc-summary">{{ statusSummary }}</span>
      <div class="pc-actions">
        <button
          v-if="hasSettings && plugin.enabled"
          type="button"
          class="pc-btn"
          :class="{ 'pc-btn--on': expanded }"
          :aria-expanded="expanded ? 'true' : 'false'"
          @click="$emit('toggle-expand', plugin.id)"
        >
          Settings
          <span class="pc-chevron" :class="{ 'pc-chevron--open': expanded }" aria-hidden="true"
            >›</span
          >
        </button>
        <button
          v-if="plugin._installed"
          type="button"
          class="pc-btn pc-btn--danger"
          @click="$emit('uninstall', plugin.id, plugin.type)"
        >
          Uninstall
        </button>
      </div>
    </div>

    <!-- Body: config (when enabled + expanded) -->
    <div v-if="plugin.enabled && expanded" class="pc-body">
      <div v-if="hasGlobalSettings" class="pc-section">
        <h4 class="pc-section-title">Settings</h4>
        <div v-for="(schema, key) in globalConfigSchema" :key="key" class="pc-field">
          <PluginFieldRenderer
            :plugin-id="plugin.id"
            :field-key="key"
            :schema="schema"
            :value="getFormValue(key, schema)"
            @update="handleUpdateFormValue(key, $event)"
          />
        </div>

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

      <PluginSections
        v-if="plugin.ui_sections && plugin.ui_sections.length > 0"
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

    <!-- Disabled note -->
    <p v-else-if="!plugin.enabled" class="pc-disabled">
      Disabled — hidden from dropdowns and the dashboard. Existing instances are kept, not deleted.
    </p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
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

const instanceLabelMap = {
  calendar: "source",
  image: "source",
  service: "instance",
  backend: "instance",
};

const instanceNoun = computed(
  () =>
    props.plugin.instance_label?.toLowerCase() || instanceLabelMap[props.plugin.type] || "instance"
);

const hasSettings = computed(
  () =>
    Object.keys(props.plugin.config_schema || {}).length > 0 ||
    Object.keys(props.plugin.instance_config_schema || {}).length > 0 ||
    props.instances.length > 0
);

const globalConfigSchema = computed(() => getGlobalConfigSchema(props.plugin));

const hasGlobalSettings = computed(() => Object.keys(globalConfigSchema.value).length > 0);

const pluginActions = computed(() => {
  const actions = props.plugin.ui_actions || [];
  if (actions.length > 0) return actions;
  if (!hasGlobalSettings.value) return [];
  return [{ id: "save", type: "save", label: "Save Settings", style: "primary" }];
});

const showInstances = computed(
  () =>
    props.plugin.enabled &&
    props.plugin.type !== "theme" &&
    props.plugin.supports_multiple_instances !== false
);

// Whether any instance reports a running flag (services/backends do; calendar
// sources may not). Drives whether the status line mentions "running".
const hasRunningInfo = computed(() => props.instances.some(i => i.running !== undefined));

const runningCount = computed(() => props.instances.filter(i => i.running).length);

// The one piece of live information in this view: each plugin's operational
// state at a glance, without expanding it.
const statusSummary = computed(() => {
  if (!props.plugin.enabled) return "Disabled";
  if (props.plugin.type === "theme") return "Theme";
  if (!showInstances.value) return hasGlobalSettings.value ? "Ready" : "Active";

  const n = props.instances.length;
  const noun = instanceNoun.value;
  if (n === 0) return `No ${noun}s yet`;

  const base = `${n} ${noun}${n === 1 ? "" : "s"}`;
  if (!hasRunningInfo.value) return base;
  return `${base} · ${runningCount.value}/${n} running`;
});

// Header dot reflects aggregate running health; hidden when there's nothing
// running to report (disabled, no instances, or sources without a run flag).
const statusDot = computed(() => {
  if (!props.plugin.enabled) return null;
  if (!hasRunningInfo.value || props.instances.length === 0) return null;
  if (runningCount.value === props.instances.length) return "ok";
  if (runningCount.value === 0) return "err";
  return "warn";
});

// Trust schema placement: common_config_schema = global. Skip internal _ fields
// and fields marked hidden in their UI config.
const getGlobalConfigSchema = plugin =>
  Object.fromEntries(
    Object.entries(plugin.common_config_schema || {}).filter(
      ([key, schema]) => !key.startsWith("_") && !schema.ui?.hidden
    )
  );

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

const getFormValue = (key, schema) => unwrapConfigValue(props.formData[key], schema);

const handleUpdateFormValue = (key, value) =>
  emit("update-form-value", props.plugin.id, key, value);
const handleCustomAction = action => emit("custom-action", props.plugin.id, action);
const handleEditInstance = instance => emit("edit-instance", props.plugin.id, instance);
const handleToggleInstance = (instanceId, enabled) => emit("toggle-instance", instanceId, enabled);
const handleInstanceOrderChange = newOrder =>
  emit("instance-order-change", props.plugin.id, newOrder);
</script>

<style scoped>
.pc-card {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.pc-card:hover {
  border-color: color-mix(in srgb, var(--focus) 45%, var(--line));
}
.pc-card--off {
  opacity: 0.72;
}

/* Header */
.pc-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
}
.pc-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pc-dot--ok {
  background: var(--ok);
}
.pc-dot--warn {
  background: var(--warn);
}
.pc-dot--err {
  background: var(--err);
}
.pc-name {
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 500;
  color: var(--ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-family: var(--font-ui);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--bg-1);
  color: var(--ink-2);
  border: 1px solid var(--line);
  flex-shrink: 0;
}
.pc-spacer {
  flex: 1;
}

/* Meta row */
.pc-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0 1.25rem 0.75rem;
  flex-wrap: wrap;
}
.pc-summary {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--ink-3);
}
.pc-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}
.pc-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.85rem;
  min-height: var(--touch-target);
  background: var(--bg-1);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.pc-btn:hover {
  border-color: var(--focus);
}
.pc-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.pc-btn--on {
  border-color: var(--focus);
  background: color-mix(in srgb, var(--focus) 12%, var(--bg-1));
}
.pc-btn--danger {
  color: var(--err);
}
.pc-btn--danger:hover {
  border-color: var(--err);
  background: color-mix(in srgb, var(--err) 10%, transparent);
}
.pc-chevron {
  font-size: 1.1rem;
  line-height: 1;
  transition: transform 0.15s;
}
.pc-chevron--open {
  transform: rotate(90deg);
}

/* Body */
.pc-body {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.25rem;
  border-top: 1px solid var(--line);
}
/* A divider sits above the instance list only when settings/sections precede it. */
.pc-body > :deep(.pi-wrap):not(:first-child) {
  border-top: 1px solid var(--line);
  padding-top: 1.5rem;
}
.pc-section-title {
  margin: 0 0 1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink);
}
.pc-field {
  margin-bottom: 1rem;
}

/* Disabled note */
.pc-disabled {
  margin: 0;
  padding: 0 1.25rem 0.9rem;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--ink-3);
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .pc-chevron {
    transition: none;
  }
}
</style>
