<template>
  <div class="plugin-manager">
    <!-- Plugin Type Tabs -->
    <TabNavigation :tabs="pluginTabs" :active-tab="activeTab" @tab-change="handleTabChange" />

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <p>Loading plugins...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="activePlugins.length === 0" class="empty-state">
      <p>{{ emptyMessage }}</p>
    </div>

    <!-- Plugin Cards -->
    <div v-else class="plugins-list">
      <!-- Info message for Themes tab -->
      <div v-if="activeTab === 'theme' && showThemeInfo" class="theme-info-message">
        <div class="help-text">
          <p style="margin: 0 0 0.5rem 0">
            <strong>💡 Installing Themes:</strong> Themes are installed the same way as plugins!
          </p>
          <ol style="margin: 0.5rem 0 0 1.5rem; text-align: left">
            <li>Use the installation section above (Zip File or GitHub tab)</li>
            <li>Enter a GitHub repository URL and click "List Plugins"</li>
            <li>Themes will appear in the list alongside plugins</li>
            <li>Click "Install" next to any theme you want</li>
          </ol>
          <p style="margin: 0.5rem 0 0 0">
            Built-in themes (Light, Dark, Ocean, Forest, Sunset) are always available and can be
            selected in
            <strong>UI Settings → Select Theme</strong>.
          </p>
        </div>
      </div>

      <!-- Plugin Cards -->
      <div
        v-for="plugin in activePlugins"
        :key="plugin.id"
        class="plugin-item"
        :class="{ disabled: !plugin.enabled }"
      >
        <PluginCard
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
          @upload="handleUpload"
          @delete-image="handleDeleteImage"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import TabNavigation from "../shared/TabNavigation.vue";
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
  "upload",
  "delete-image",
]);

const pluginTabs = computed(() => {
  const categories = [
    { id: "calendar", label: "Calendar", icon: "📅" },
    { id: "image", label: "Image", icon: "🖼️" },
    { id: "service", label: "Service", icon: "⚙️" },
    { id: "backend", label: "Backend", icon: "🔧" },
    { id: "theme", label: "Theme", icon: "🎨" },
  ];

  // Show tabs that have plugins OR show backend/theme tabs always (for installation)
  // This allows users to see backend/theme tabs even when listing from repo
  return categories.filter(cat => {
    // Always show backend and theme tabs (they can be installed from repos)
    if (cat.id === "backend" || cat.id === "theme") {
      return true;
    }
    // For other types, only show if there are plugins
    return props.plugins.some(p => p.type === cat.id);
  });
});

const activePlugins = computed(() => {
  return props.plugins.filter(p => p.type === props.activeTab);
});

const emptyMessage = computed(() => {
  if (props.activeTab === "theme") {
    return "No themes found. Install themes using the installation section above.";
  }
  return `No ${props.activeTab} plugins found.`;
});

const handleTabChange = tabId => {
  emit("tab-change", tabId);
};

const handleToggleExpand = pluginId => {
  emit("toggle-expand", pluginId);
};

const handleToggleEnabled = (pluginId, enabled) => {
  emit("toggle-enabled", pluginId, enabled);
};

const handleUninstall = (pluginId, pluginType) => {
  emit("uninstall", pluginId, pluginType);
};

const handleUpdateFormValue = (pluginId, key, value) => {
  emit("update-form-value", pluginId, key, value);
};

const handleSaveConfig = pluginId => {
  emit("save-config", pluginId);
};

const handleTestConnection = pluginId => {
  emit("test-connection", pluginId);
};

const handleFetchNow = pluginId => {
  emit("fetch-now", pluginId);
};

const handleCustomAction = (pluginId, action) => {
  emit("custom-action", pluginId, action);
};

const handleAddInstance = pluginId => {
  emit("add-instance", pluginId);
};

const handleEditInstance = (pluginId, instance) => {
  emit("edit-instance", pluginId, instance);
};

const handleDeleteInstance = instanceId => {
  emit("delete-instance", instanceId);
};

const handleToggleInstance = (instanceId, enabled) => {
  emit("toggle-instance", instanceId, enabled);
};

const handleInstanceOrderChange = (pluginId, newOrder) => {
  emit("instance-order-change", pluginId, newOrder);
};

const handleUpload = file => {
  emit("upload", file);
};

const handleDeleteImage = imageId => {
  emit("delete-image", imageId);
};
</script>

<style scoped>
.plugin-manager {
  width: 100%;
}

.loading-state,
.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--ink-2);
}

.theme-info-message {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-2);
  border-radius: 6px;
}

.plugins-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.plugin-item {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 8px;
  transition: all 0.2s ease;
}

.plugin-item:hover {
  border-color: var(--focus);
  box-shadow: 0 2px 4px var(--shadow);
}

.plugin-item.disabled {
  opacity: 0.6;
}
</style>
