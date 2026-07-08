<template>
  <div class="plugin-manager">
    <!-- Plugin type tabs -->
    <div class="pm-tabs">
      <SegmentedControl
        :model-value="activeTab"
        :options="tabOptions"
        aria-label="Plugin type"
        @update:model-value="handleTabChange"
      />
    </div>

    <!-- Loading -->
    <p v-if="loading" class="pm-status">Loading plugins…</p>

    <!-- Empty -->
    <p v-else-if="activePlugins.length === 0" class="pm-status">{{ emptyMessage }}</p>

    <!-- Plugin cards -->
    <div v-else class="pm-list">
      <!-- Theme install hint -->
      <p v-if="activeTab === 'theme' && showThemeInfo" class="pm-note">
        Themes install just like plugins — list a repository above, then install any theme that
        appears. Built-in themes (Light, Dark, Ocean, Forest, Sunset) are always available under
        Display → Theme.
      </p>

      <PluginCard
        v-for="plugin in activePlugins"
        :key="plugin.id"
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
        @toggle-expand="handleToggleExpand"
        @toggle-enabled="handleToggleEnabled"
        @uninstall="handleUninstall"
        @update-form-value="handleUpdateFormValue"
        @save-config="handleSaveConfig"
        @test-connection="handleTestConnection"
        @fetch-now="handleFetchNow"
        @custom-action="handleCustomAction"
        @add-instance="handleAddInstance"
        @edit-instance="handleEditInstance"
        @delete-instance="handleDeleteInstance"
        @toggle-instance="handleToggleInstance"
        @instance-order-change="handleInstanceOrderChange"
        @manage-calendar-sources="$emit('manage-calendar-sources')"
        @upload="handleUpload"
        @delete-image="handleDeleteImage"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import PluginCard from "./PluginCard.vue";

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
    default: "calendar",
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
  "add-instance",
  "edit-instance",
  "delete-instance",
  "toggle-instance",
  "instance-order-change",
  "manage-calendar-sources",
  "upload",
  "delete-image",
]);

// Backend + theme tabs are always offered (they can be installed from a repo);
// the rest appear once at least one plugin of that type is installed.
const TAB_LABELS = {
  calendar: "Calendar",
  image: "Image",
  service: "Service",
  backend: "Backend",
  theme: "Theme",
};

const tabOptions = computed(() =>
  Object.entries(TAB_LABELS)
    .filter(([id]) => id === "backend" || id === "theme" || props.plugins.some(p => p.type === id))
    .map(([value, label]) => ({ value, label }))
);

const activePlugins = computed(() => props.plugins.filter(p => p.type === props.activeTab));

const emptyMessage = computed(() =>
  props.activeTab === "theme"
    ? "No themes installed yet. Install one from a repository above."
    : `No ${props.activeTab} plugins installed yet.`
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
const handleAddInstance = pluginId => emit("add-instance", pluginId);
const handleEditInstance = (pluginId, instance) => emit("edit-instance", pluginId, instance);
const handleDeleteInstance = instanceId => emit("delete-instance", instanceId);
const handleToggleInstance = (instanceId, enabled) => emit("toggle-instance", instanceId, enabled);
const handleInstanceOrderChange = (pluginId, newOrder) =>
  emit("instance-order-change", pluginId, newOrder);
const handleUpload = file => emit("upload", file);
const handleDeleteImage = imageId => emit("delete-image", imageId);
</script>

<style scoped>
.plugin-manager {
  width: 100%;
  padding: 1.25rem;
}

.pm-tabs {
  margin-bottom: 1.25rem;
  max-width: 100%;
  overflow-x: auto;
}

.pm-status {
  padding: 1.5rem;
  text-align: center;
  color: var(--ink-3);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  margin: 0;
}

.pm-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pm-note {
  margin: 0;
  padding: 0.75rem 1rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--ink-2);
  font-family: var(--font-ui);
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
