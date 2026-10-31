<template>
  <div class="plugin-manager">
    <!-- Plain-kind filters, All first (§3.3) -->
    <div class="pm-tabs">
      <SegmentedControl
        :model-value="activeTab"
        :options="filterOptions"
        aria-label="Plugin kind"
        @update:model-value="handleTabChange"
      />
    </div>

    <!-- Loading -->
    <InlineNote v-if="loading" class="pm-status">Loading plugins…</InlineNote>

    <!-- Empty -->
    <InlineNote v-else-if="activePlugins.length === 0" class="pm-status">
      {{ emptyMessage }}
    </InlineNote>

    <!-- Plugin cards -->
    <div v-else class="pm-list">
      <!-- Theme install hint -->
      <InlineNote v-if="activeTab === 'theme' && showThemeInfo" class="pm-note">
        Themes are plugins too: install them here, then choose one in Dashboard › Appearance.
      </InlineNote>

      <PluginCard
        v-for="plugin in activePlugins"
        :key="plugin.id"
        :data-plugin-id="plugin.id"
        :plugin="plugin"
        :instances="instances[plugin.id] || []"
        :expanded="expandedPlugins[plugin.id] || false"
        :form-data="formData[plugin.id] || {}"
        :saving="saving === plugin.id ? plugin.id : null"
        :testing="testing[plugin.id] || {}"
        :fetching="fetching[plugin.id] || {}"
        :save-status="saveStatus[plugin.id]"
        :test-status="testStatus[plugin.id]"
        :fetch-status="fetchStatus[plugin.id]"
        :images="images"
        :uploading="uploading"
        :upload-error="uploadError"
        :upload-success="uploadSuccess"
        :latest-version="(latestVersions || {})[plugin.id] || ''"
        :updating="updatingPlugin === plugin.id"
        @toggle-expand="handleToggleExpand"
        @toggle-enabled="handleToggleEnabled"
        @uninstall="handleUninstall"
        @update-form-value="handleUpdateFormValue"
        @save-config="handleSaveConfig"
        @test-connection="handleTestConnection"
        @fetch-now="handleFetchNow"
        @custom-action="handleCustomAction"
        @used-by="pluginId => emit('used-by', pluginId)"
        @add-source="pluginId => emit('add-source', pluginId)"
        @open-appearance="emit('open-appearance')"
        @update="pluginId => emit('update', pluginId)"
        @upload="handleUpload"
        @delete-image="handleDeleteImage"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import PluginCard from "./PluginCard.vue";
import { pluginKindFilters, pluginKindKey } from "@/utils/pluginKind";

const props = defineProps({
  plugins: {
    type: Array,
    required: true,
    default: () => [],
  },
  instances: {
    type: Object,
    default: () => ({}),
  },
  loading: {
    type: Boolean,
    default: false,
  },
  activeTab: {
    type: String,
    default: "all",
  },
  expandedPlugins: {
    type: Object,
    default: () => ({}),
  },
  formData: {
    type: Object,
    default: () => ({}),
  },
  saving: {
    type: [String, null],
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
    default: () => ({}),
  },
  testStatus: {
    type: Object,
    default: () => ({}),
  },
  fetchStatus: {
    type: Object,
    default: () => ({}),
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
  showThemeInfo: {
    type: Boolean,
    default: false,
  },
  // plugin id -> newer catalog version (§3.3).
  latestVersions: {
    type: Object,
    default: () => ({}),
  },
  updatingPlugin: {
    type: String,
    default: "",
  },
});

const emit = defineEmits([
  "tab-change",
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

const filterOptions = computed(() =>
  pluginKindFilters(props.plugins).map(option => ({ value: option.id, label: option.label }))
);

const activePlugins = computed(() =>
  props.activeTab === "all"
    ? props.plugins
    : props.plugins.filter(plugin => pluginKindKey(plugin) === props.activeTab)
);

const emptyMessage = computed(() =>
  props.activeTab === "theme"
    ? "No themes installed yet. Install one from a repository above."
    : "No add-ons of this kind are installed yet."
);

const handleTabChange = tabId => emit("tab-change", tabId);
const handleToggleExpand = pluginId => emit("toggle-expand", pluginId);
const handleToggleEnabled = (pluginId, enabled) => emit("toggle-enabled", pluginId, enabled);
const handleUninstall = (pluginId, pluginType) => emit("uninstall", pluginId, pluginType);
const handleUpdateFormValue = (pluginId, key, value) =>
  emit("update-form-value", pluginId, key, value);
const handleSaveConfig = pluginId => emit("save-config", pluginId);
const handleTestConnection = pluginId => emit("test-connection", pluginId);
const handleFetchNow = pluginId => emit("fetch-now", pluginId);
const handleCustomAction = (pluginId, action) => emit("custom-action", pluginId, action);
const handleUpload = file => emit("upload", file);
const handleDeleteImage = imageId => emit("delete-image", imageId);
</script>

<style scoped>
.plugin-manager {
  width: 100%;
  padding: var(--panel-pad-y) var(--panel-pad-x);
}

.pm-tabs {
  max-width: 100%;
  margin-bottom: var(--gap-5);
  overflow-x: auto;
}

.pm-status {
  padding: var(--gap-5) 0;
  text-align: center;
}

.pm-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}

.pm-note {
  margin-bottom: var(--gap-stack);
}
</style>
