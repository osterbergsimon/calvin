<template>
  <div class="pc-card" :class="{ 'pc-card--off': !plugin.enabled && !isTheme }">
    <!-- Header: identity + enable -->
    <div class="pc-head">
      <span class="pc-name">{{ plugin.name }}</span>
      <span class="pc-badge">{{ kindLabel }}</span>
      <span v-if="plugin.version" class="pc-ver">v{{ plugin.version }}</span>
      <span class="pc-spacer" />
      <ToggleSwitch
        v-if="!isTheme"
        :model-value="plugin.enabled"
        :aria-label="`Enable ${plugin.name}`"
        @update:model-value="$emit('toggle-enabled', plugin.id, $event)"
      />
    </div>

    <!-- Meta: how many sources use it, and where they live -->
    <div class="pc-meta">
      <span class="pc-summary">
        <template v-if="isTheme">
          Choose it in
          <button type="button" class="pc-link" @click="$emit('open-appearance')">
            Dashboard › Appearance
          </button>
        </template>
        <template v-else-if="isBackground"> Works in the background. No sources to add. </template>
        <template v-else-if="!plugin.enabled">
          Turned off<template v-if="sourceCount">
            · {{ sourceCount }} source{{ sourceCount === 1 ? "" : "s" }}</template
          ><template v-else> · not used</template>
        </template>
        <template v-else-if="sourceCount">
          <button type="button" class="pc-link" @click="$emit('used-by', plugin.id)">
            Used by {{ sourceCount }} source{{ sourceCount === 1 ? "" : "s" }}
          </button>
        </template>
        <template v-else>
          Not used yet<template v-if="canAddSource">
            ·
            <button type="button" class="pc-link" @click="$emit('add-source', plugin.id)">
              Add a source
            </button></template
          >
        </template>
      </span>

      <div class="pc-actions">
        <button
          v-if="showUpdate"
          type="button"
          class="pc-btn pc-btn--update"
          :disabled="updating"
          @click="$emit('update', plugin.id)"
        >
          {{ updating ? "Updating…" : `Update to v${latestVersion}` }}
        </button>
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

    <!-- Body: plugin-level settings only. Sources live in Content. -->
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
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import { pluginKindLabel } from "@/utils/pluginKind";
import { isNewerVersion } from "@/utils/pluginVersions";
import PluginFieldRenderer from "../../PluginFieldRenderer.vue";
import PluginActions from "../../PluginActions.vue";
import PluginSections from "../../PluginSections.vue";

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
  // Catalog version when the official catalog has a newer release (§3.3).
  latestVersion: {
    type: String,
    default: "",
  },
  updating: {
    type: Boolean,
    default: false,
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
  "used-by",
  "add-source",
  "open-appearance",
  "update",
  "upload",
  "delete-image",
]);

const kindLabel = computed(() => pluginKindLabel(props.plugin));

// Only a genuinely newer catalog version offers Update; an equal or older one
// (a downgrade) does not.
const showUpdate = computed(() => isNewerVersion(props.latestVersion, props.plugin.version));

const isTheme = computed(() => props.plugin.type === "theme");
const isBackground = computed(() => props.plugin.type === "backend");
const sourceCount = computed(() => props.instances.length);
const canAddSource = computed(() => ["calendar", "image", "service"].includes(props.plugin.type));

const hasGlobalSettings = computed(() => Object.keys(globalConfigSchema.value).length > 0);

const hasSettings = computed(() => hasGlobalSettings.value);

const globalConfigSchema = computed(() => getGlobalConfigSchema(props.plugin));

// Trust schema placement: common_config_schema = global. Skip internal _ fields
// and fields marked hidden in their UI config.
const getGlobalConfigSchema = plugin =>
  Object.fromEntries(
    Object.entries(plugin.common_config_schema || {}).filter(
      ([key, schema]) => !key.startsWith("_") && !schema.ui?.hidden
    )
  );

const pluginActions = computed(() => {
  const actions = props.plugin.ui_actions || [];
  if (actions.length > 0) return actions;
  if (!hasGlobalSettings.value) return [];
  return [{ id: "save", type: "save", label: "Save Settings", style: "primary" }];
});

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
  font-size: 0.75rem;
  font-family: var(--font-ui);
  font-weight: 500;
  background: var(--bg-1);
  color: var(--ink-2);
  border: 1px solid var(--line);
  flex-shrink: 0;
}
.pc-ver {
  font-family: var(--font-data);
  font-size: 0.75rem;
  color: var(--ink-3);
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
.pc-link {
  padding: 0;
  background: transparent;
  color: var(--ink-2);
  border: 0;
  border-bottom: 1px dotted currentColor;
  font-family: var(--font-ui);
  font-size: 0.85rem;
  cursor: pointer;
}
.pc-link:hover {
  color: var(--ink);
}
.pc-link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
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
.pc-btn--update {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--line));
  background: color-mix(in srgb, var(--warn) 14%, var(--bg-1));
}
.pc-btn--update:hover {
  border-color: var(--warn);
}
.pc-btn--update:disabled {
  opacity: 0.6;
  cursor: progress;
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

@media (prefers-reduced-motion: reduce) {
  .pc-chevron {
    transition: none;
  }
}
</style>
