<template>
  <div class="pc-card" :class="{ 'pc-card--off': !plugin.enabled && !isTheme }">
    <ListRow :name="plugin.name || plugin.id" class="pc-row">
      <template #meta>
        <span class="pc-meta-line">
          <Tag class="pc-badge">{{ kindLabel }}</Tag>
          <span v-if="plugin.version" class="pc-ver">v{{ plugin.version }}</span>
          <span class="pc-summary">
            <template v-if="isTheme && plugin.selectable === false">
              Needs an update to work with this Calvin.
            </template>
            <template v-else-if="isTheme">
              Choose it in
              <Button variant="link" size="sm" class="pc-link" @click="$emit('open-appearance')">
                Dashboard › Appearance
              </Button>
            </template>
            <template v-else-if="isBackground">
              Works in the background. No sources to add.
            </template>
            <template v-else-if="!plugin.enabled">
              Turned off<template v-if="sourceCount">
                · {{ sourceCount }} source{{ sourceCount === 1 ? "" : "s" }}</template
              ><template v-else> · not used</template>
            </template>
            <template v-else-if="sourceCount">
              <Button variant="link" size="sm" class="pc-link" @click="$emit('used-by', plugin.id)">
                Used by {{ sourceCount }} source{{ sourceCount === 1 ? "" : "s" }}
              </Button>
            </template>
            <template v-else>
              Not used yet<template v-if="canAddSource">
                ·
                <Button
                  variant="link"
                  size="sm"
                  class="pc-link"
                  @click="$emit('add-source', plugin.id)"
                >
                  Add a source
                </Button></template
              >
            </template>
          </span>
        </span>
      </template>

      <template #actions>
        <ToggleSwitch
          v-if="!isTheme"
          :model-value="plugin.enabled"
          :aria-label="`Enable ${plugin.name}`"
          @update:model-value="$emit('toggle-enabled', plugin.id, $event)"
        />
        <Button
          v-if="showUpdate"
          variant="primary"
          class="pc-btn--update"
          :loading="updating"
          loading-label="Updating…"
          @click="$emit('update', plugin.id)"
        >
          Update to v{{ latestVersion }}
        </Button>
        <Button
          v-if="hasSettings && plugin.enabled"
          variant="secondary"
          :aria-expanded="expanded ? 'true' : 'false'"
          @click="$emit('toggle-expand', plugin.id)"
        >
          Settings
          <span class="pc-chevron" :class="{ 'pc-chevron--open': expanded }" aria-hidden="true"
            >›</span
          >
        </Button>
        <Button
          v-if="plugin._installed"
          variant="danger"
          class="pc-btn--danger"
          @click="$emit('uninstall', plugin.id, plugin.type)"
        >
          Uninstall
        </Button>
      </template>
    </ListRow>

    <!-- Body: plugin-level settings only. Sources live in Content. -->
    <Card v-if="plugin.enabled && expanded" class="pc-body">
      <div v-if="hasGlobalSettings" class="pc-section">
        <h4 class="pc-section-title heading-group">Settings</h4>
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
        :sections="plugin.ui_sections"
        :uploading="uploading"
        :upload-error="uploadError"
        :upload-success="uploadSuccess"
        @upload="$emit('upload', $event)"
      />
    </Card>
  </div>
</template>

<script setup>
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import ListRow from "@/components/ui/ListRow.vue";
import Tag from "@/components/ui/Tag.vue";
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
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}

.pc-card--off {
  opacity: 0.72;
}

.pc-meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline);
}

.pc-summary {
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-2);
}

.pc-ver {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-size: var(--text-caption);
  color: var(--ink-3);
}

.pc-chevron {
  font-size: var(--text-title);
  line-height: 1;
  transition: transform var(--dur-fast) var(--ease);
}

.pc-chevron--open {
  transform: rotate(90deg);
}

.pc-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}

.pc-section {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}

@media (prefers-reduced-motion: reduce) {
  .pc-chevron {
    transition: none;
  }
}
</style>
