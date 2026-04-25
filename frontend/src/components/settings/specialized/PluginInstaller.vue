<template>
  <div class="plugin-installer">
    <div class="plugin-install-tabs">
      <button
        class="install-tab"
        :class="{ active: installMethod === 'zip' }"
        @click="installMethod = 'zip'"
      >
        📦 Zip File
      </button>
      <button
        class="install-tab"
        :class="{ active: installMethod === 'github' }"
        @click="installMethod = 'github'"
      >
        🐙 GitHub
      </button>
      <button
        v-if="devMode"
        class="install-tab install-tab--dev"
        :class="{ active: installMethod === 'local' }"
        @click="installMethod = 'local'"
        title="Dev mode: install from local filesystem path"
      >
        🗂️ Local Path
      </button>
    </div>

    <!-- Zip File Upload -->
    <div v-show="installMethod === 'zip'" class="plugin-install-content">
      <input
        ref="zipInput"
        type="file"
        accept=".zip"
        style="display: none"
        @change="handleZipSelect"
      />
      <div class="install-compact-row">
        <button
          type="button"
          class="btn-upload"
          :disabled="installing"
          @click="$refs.zipInput?.click()"
        >
          {{ installing ? "Installing..." : "📦 Choose Zip File" }}
        </button>
        <span v-if="selectedFile" class="selected-file-compact">
          {{ selectedFile.name }}
        </span>
      </div>
    </div>

    <!-- GitHub Repository -->
    <div v-show="installMethod === 'github'" class="plugin-install-content">
      <p class="help-text-compact">
        Enter a GitHub repository URL and click "List Plugins" to see available plugins and themes.
      </p>
      <div class="install-compact-row">
        <input
          :model-value="repoUrl"
          type="text"
          placeholder="https://github.com/user/repo"
          class="github-input-compact"
          :disabled="enumerating || installing"
          @input="handleRepoUrlInput"
        />
        <input
          :model-value="branch"
          type="text"
          placeholder="main"
          class="github-branch-compact"
          :disabled="enumerating || installing"
          @input="handleBranchInput"
        />
        <button
          type="button"
          class="btn-browse"
          :disabled="!repoUrl || enumerating || installing"
          @click="handleListPlugins"
        >
          {{ enumerating ? "Loading..." : "🔍 List Plugins" }}
        </button>
      </div>

      <!-- Branch Switch Notice -->
      <div
        v-if="branchSwitched && availablePlugins.length > 0"
        class="branch-switch-notice-compact"
      >
        ℹ️ Using branch: <strong>{{ actualBranch }}</strong>
      </div>

      <!-- Available Plugins List -->
      <div v-if="filteredPlugins.length > 0" class="available-plugins-compact">
        <!-- Search Bar -->
        <div class="plugin-search-container">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="🔍 Search plugins..."
            class="plugin-search-input"
            :disabled="installing"
          />
        </div>

        <!-- Type Tabs -->
        <TabNavigation
          :tabs="pluginTypeTabs"
          :active-tab="activeTypeTab"
          @tab-change="activeTypeTab = $event"
        />

        <!-- Plugin List Header -->
        <div class="plugin-list-header">
          <label class="select-all-checkbox">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="someSelected"
              @change="handleSelectAll"
            />
            <span>Select All</span>
          </label>
          <button
            type="button"
            class="btn-install-selected"
            :disabled="installing || selectedPlugins.length === 0"
            @click="handleInstallSelected"
          >
            {{
              installing
                ? `Installing ${selectedPlugins.length}...`
                : `⬇️ Install Selected (${selectedPlugins.length})`
            }}
          </button>
        </div>

        <!-- Plugins List -->
        <div
          v-for="plugin in activeTypePlugins"
          :key="plugin.id"
          class="plugin-item-inline"
          :class="{ 'plugin-installed': plugin._installed }"
        >
          <div class="plugin-checkbox-wrapper">
            <input
              type="checkbox"
              :checked="isSelected(plugin.id)"
              :disabled="installing"
              @change="handleToggleSelect(plugin.id)"
            />
          </div>
          <div class="plugin-info-inline">
            <strong>{{ plugin.name || plugin.id }}</strong>
            <span class="plugin-type-badge-small" :class="`type-${plugin.type}`">
              {{ plugin.type }}
            </span>
            <span v-if="plugin.version" class="plugin-version-small"> v{{ plugin.version }} </span>
            <span
              v-if="plugin._installed"
              class="plugin-installed-badge"
              :class="{
                'plugin-update-available':
                  plugin._installedVersion &&
                  plugin.version &&
                  plugin._installedVersion !== plugin.version,
              }"
            >
              {{
                plugin._installedVersion &&
                plugin.version &&
                plugin._installedVersion !== plugin.version
                  ? `Installed: v${plugin._installedVersion} → Update to v${plugin.version}`
                  : `Installed: v${plugin._installedVersion || "?"}`
              }}
            </span>
          </div>
          <div class="plugin-actions">
            <button
              v-if="
                plugin._installed &&
                plugin._installedVersion &&
                plugin.version &&
                plugin._installedVersion !== plugin.version
              "
              type="button"
              class="btn-install btn-update"
              :disabled="installing"
              @click="handleInstall(plugin.path)"
            >
              {{ installing ? "Installing..." : "🔄 Update" }}
            </button>
            <button
              v-else-if="plugin._installed"
              type="button"
              class="btn-install btn-reinstall"
              :disabled="installing"
              @click="handleForceUpdate(plugin.path)"
              title="Reinstall this plugin"
            >
              {{ installing ? "Installing..." : "🔁 Reinstall" }}
            </button>
            <button
              v-else
              type="button"
              class="btn-install"
              :disabled="installing"
              @click="handleInstall(plugin.path)"
            >
              {{ installing ? "Installing..." : "⬇️ Install" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Local Path (dev mode only) -->
    <div v-if="devMode" v-show="installMethod === 'local'" class="plugin-install-content">
      <p class="help-text-compact">
        Install directly from a local cloned repository. Enter an absolute path to the repo root.
      </p>
      <div class="install-compact-row">
        <input
          v-model="localPath"
          type="text"
          placeholder="/absolute/path/to/calvin-plugins"
          class="github-input-compact"
          :disabled="enumerating || installing || detecting"
        />
        <button
          type="button"
          class="btn-autodetect"
          :disabled="enumerating || installing || detecting"
          @click="handleAutoDetect"
          title="Auto-detect sibling plugin repositories"
        >
          {{ detecting ? "Detecting..." : "📂 Auto-detect" }}
        </button>
        <button
          type="button"
          class="btn-browse"
          :disabled="!localPath || enumerating || installing || detecting"
          @click="handleListLocalPlugins"
        >
          {{ enumerating ? "Loading..." : "🔍 List Plugins" }}
        </button>
      </div>

      <!-- Available Plugins List (reuses same filteredPlugins/availablePlugins state) -->
      <div
        v-if="installSource === 'local' && filteredPlugins.length > 0"
        class="available-plugins-compact"
      >
        <div class="plugin-search-container">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="🔍 Search plugins..."
            class="plugin-search-input"
            :disabled="installing"
          />
        </div>
        <TabNavigation
          :tabs="pluginTypeTabs"
          :active-tab="activeTypeTab"
          @tab-change="activeTypeTab = $event"
        />
        <div class="plugin-list-header">
          <label class="select-all-checkbox">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="someSelected"
              @change="handleSelectAll"
            />
            <span>Select All</span>
          </label>
          <button
            type="button"
            class="btn-install-selected"
            :disabled="installing || selectedPlugins.length === 0"
            @click="handleInstallSelectedLocal"
          >
            {{
              installing
                ? `Installing ${selectedPlugins.length}...`
                : `⬇️ Install Selected (${selectedPlugins.length})`
            }}
          </button>
        </div>
        <div
          v-for="plugin in activeTypePlugins"
          :key="plugin.id"
          class="plugin-item-inline"
          :class="{ 'plugin-installed': plugin._installed }"
        >
          <div class="plugin-checkbox-wrapper">
            <input
              type="checkbox"
              :checked="isSelected(plugin.id)"
              :disabled="installing"
              @change="handleToggleSelect(plugin.id)"
            />
          </div>
          <div class="plugin-info-inline">
            <strong>{{ plugin.name || plugin.id }}</strong>
            <span class="plugin-type-badge-small" :class="`type-${plugin.type}`">{{
              plugin.type
            }}</span>
            <span v-if="plugin.version" class="plugin-version-small">v{{ plugin.version }}</span>
            <span v-if="plugin._installed" class="plugin-installed-badge">
              Installed: v{{ plugin._installedVersion || "?" }}
            </span>
          </div>
          <div class="plugin-actions">
            <button
              v-if="plugin._installed"
              type="button"
              class="btn-install btn-reinstall"
              :disabled="installing"
              @click="handleInstallLocal(plugin.path, true)"
            >
              {{ installing ? "Installing..." : "🔁 Reinstall" }}
            </button>
            <button
              v-else
              type="button"
              class="btn-install"
              :disabled="installing"
              @click="handleInstallLocal(plugin.path, false)"
            >
              {{ installing ? "Installing..." : "⬇️ Install" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Installation Status Messages -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
    <div v-if="success" class="success-message">
      {{ success }}
      <!-- Branch Switch Notification -->
      <div v-if="branchSwitched" class="branch-switch-notice">
        ℹ️ Branch switched from 'main' to 'master' (main branch not found)
      </div>
    </div>

    <!-- Frontend Rebuild Progress -->
    <div
      v-if="rebuildStatus !== 'idle'"
      :class="['rebuild-status', `rebuild-status--${rebuildStatus}`]"
    >
      <span v-if="rebuildStatus === 'building'" class="rebuild-spinner" aria-hidden="true"></span>
      <span class="rebuild-status-text">{{ rebuildMessage }}</span>
      <button v-if="rebuildStatus === 'done'" class="btn-refresh-inline" @click="handleRefresh">
        Refresh Now
      </button>
    </div>

    <!-- Restart Required Notice -->
    <div v-if="requiresRestart" class="restart-notice">
      <div class="restart-notice-content">
        <strong>⚠️ Server Restart Required</strong>
        <p>
          The plugin has been installed but won't appear in the UI until the backend server is
          restarted. This is because plugin types are registered in the database during server
          startup.
        </p>
        <div class="restart-actions">
          <button type="button" class="btn-primary" @click="handleRestart">
            🔄 Restart Backend Now
          </button>
          <span class="restart-alternative">
            Or restart manually via SSH:
            <code>sudo systemctl restart calvin-backend</code>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import TabNavigation from "../shared/TabNavigation.vue";
import * as pluginsApi from "@/services/pluginsApi";

const props = defineProps({
  installing: {
    type: Boolean,
    default: false,
  },
  enumerating: {
    type: Boolean,
    default: false,
  },
  selectedFile: {
    type: File,
    default: null,
  },
  repoUrl: {
    type: String,
    default: "",
  },
  branch: {
    type: String,
    default: "main",
  },
  availablePlugins: {
    type: Array,
    default: () => [],
  },
  error: {
    type: String,
    default: "",
  },
  success: {
    type: String,
    default: "",
  },
  requiresRestart: {
    type: Boolean,
    default: false,
  },
  branchSwitched: {
    type: Boolean,
    default: false,
  },
  actualBranch: {
    type: String,
    default: "",
  },
  devMode: {
    type: Boolean,
    default: false,
  },
  rebuildStatus: {
    type: String,
    default: "idle", // idle | building | done | error
  },
  rebuildMessage: {
    type: String,
    default: "",
  },
});

const emit = defineEmits([
  "zip-select",
  "list-plugins",
  "install",
  "install-selected",
  "install-local",
  "install-selected-local",
  "restart",
  "update:repoUrl",
  "update:branch",
  "force-update",
]);

const installMethod = ref("zip");
const installSource = ref("github"); // 'github' | 'local'
const localPath = ref("");
const detecting = ref(false);
const selectedPluginIds = ref(new Set());
const searchQuery = ref("");
const activeTypeTab = ref("all");

// Filter plugins by search query
const filteredPlugins = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.availablePlugins;
  }
  const query = searchQuery.value.toLowerCase();
  return props.availablePlugins.filter(
    p =>
      (p.name || "").toLowerCase().includes(query) ||
      (p.id || "").toLowerCase().includes(query) ||
      (p.description || "").toLowerCase().includes(query)
  );
});

// Group plugins by type
const filteredPluginsByType = computed(() => {
  const grouped = {
    calendar: [],
    image: [],
    service: [],
    backend: [],
    theme: [],
  };
  filteredPlugins.value.forEach(plugin => {
    if (grouped[plugin.type]) {
      grouped[plugin.type].push(plugin);
    }
  });
  return grouped;
});

// Get plugin type tabs
const pluginTypeTabs = computed(() => {
  const tabs = [{ id: "all", label: "All", icon: "📦" }];
  const typeLabels = {
    calendar: { label: "Calendar", icon: "📅" },
    image: { label: "Image", icon: "🖼️" },
    service: { label: "Service", icon: "⚙️" },
    backend: { label: "Backend", icon: "🔧" },
    theme: { label: "Theme", icon: "🎨" },
  };

  Object.entries(filteredPluginsByType.value).forEach(([type, plugins]) => {
    if (plugins.length > 0) {
      tabs.push({
        id: type,
        label: typeLabels[type]?.label || type,
        icon: typeLabels[type]?.icon || "📦",
        badge: plugins.length.toString(),
      });
    }
  });

  return tabs;
});

// Get plugins for active tab
const activeTypePlugins = computed(() => {
  if (activeTypeTab.value === "all") {
    return filteredPlugins.value;
  }
  return filteredPluginsByType.value[activeTypeTab.value] || [];
});

// Computed properties
const selectedPlugins = computed(() => {
  return filteredPlugins.value.filter(p => selectedPluginIds.value.has(p.id));
});

const allSelected = computed(() => {
  return (
    activeTypePlugins.value.length > 0 &&
    activeTypePlugins.value.every(p => selectedPluginIds.value.has(p.id))
  );
});

const someSelected = computed(() => {
  const selectedCount = activeTypePlugins.value.filter(p =>
    selectedPluginIds.value.has(p.id)
  ).length;
  return selectedCount > 0 && selectedCount < activeTypePlugins.value.length;
});

// Methods
const isSelected = pluginId => {
  return selectedPluginIds.value.has(pluginId);
};

const handleToggleSelect = pluginId => {
  if (selectedPluginIds.value.has(pluginId)) {
    selectedPluginIds.value.delete(pluginId);
  } else {
    selectedPluginIds.value.add(pluginId);
  }
};

const handleSelectAll = event => {
  if (event.target.checked) {
    activeTypePlugins.value.forEach(p => selectedPluginIds.value.add(p.id));
  } else {
    activeTypePlugins.value.forEach(p => selectedPluginIds.value.delete(p.id));
  }
};

const handleInstallSelected = () => {
  const pluginsToInstall = selectedPlugins.value.map(p => ({
    path: p.path,
    id: p.id,
  }));
  emit("install-selected", {
    plugins: pluginsToInstall,
    repoUrl: props.repoUrl,
    branch: props.branch,
  });
  selectedPluginIds.value.clear();
};

const handleZipSelect = event => {
  const file = event.target.files?.[0];
  if (file) {
    emit("zip-select", file);
  }
};

const handleListPlugins = () => {
  installSource.value = "github";
  emit("list-plugins", {
    repoUrl: props.repoUrl,
    branch: props.branch,
  });
};

const handleAutoDetect = async () => {
  detecting.value = true;
  try {
    const result = await pluginsApi.suggestLocalPath();
    if (result.suggestions && result.suggestions.length > 0) {
      localPath.value = result.suggestions[0];
    }
  } catch {
    // silently ignore — user can type path manually
  } finally {
    detecting.value = false;
  }
};

const handleListLocalPlugins = () => {
  installSource.value = "local";
  emit("list-plugins", {
    source: "local",
    localPath: localPath.value,
  });
};

const handleInstall = pluginPath => {
  emit("install", {
    path: pluginPath,
    repoUrl: props.repoUrl,
    branch: props.branch,
    force: false,
  });
};

const handleInstallLocal = (pluginPath, force) => {
  emit("install-local", {
    path: pluginPath,
    localPath: localPath.value,
    force,
  });
};

const handleInstallSelectedLocal = () => {
  const pluginsToInstall = selectedPlugins.value.map(p => ({
    path: p.path,
    id: p.id,
  }));
  emit("install-selected-local", {
    plugins: pluginsToInstall,
    localPath: localPath.value,
  });
  selectedPluginIds.value.clear();
};

const handleForceUpdate = pluginPath => {
  emit("force-update", {
    path: pluginPath,
    repoUrl: props.repoUrl,
    branch: props.branch,
    force: true,
  });
};

const handleRestart = () => {
  emit("restart");
};

const handleRefresh = () => {
  window.location.reload();
};

const handleRepoUrlInput = event => {
  emit("update:repoUrl", event.target.value);
};

const handleBranchInput = event => {
  emit("update:branch", event.target.value);
};

// Watch for availablePlugins changes to clear selection when list changes
watch(
  () => props.availablePlugins.length,
  () => {
    selectedPluginIds.value.clear();
    // Reset to "all" tab when plugins change
    activeTypeTab.value = "all";
  }
);

// Watch for search query changes to reset to "all" tab
watch(searchQuery, () => {
  if (activeTypeTab.value !== "all") {
    // If searching and on a specific tab, check if that tab still has results
    const tabPlugins = filteredPluginsByType.value[activeTypeTab.value] || [];
    if (tabPlugins.length === 0) {
      activeTypeTab.value = "all";
    }
  }
});
</script>

<style scoped>
.plugin-installer {
  width: 100%;
}

.plugin-install-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
}

.install-tab {
  padding: 0.75rem 1.25rem;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: -2px;
}

.install-tab:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.install-tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
  font-weight: 600;
}

.install-tab--dev {
  color: #e67e22;
}

.install-tab--dev.active {
  color: #e67e22;
  border-bottom-color: #e67e22;
}

.btn-autodetect {
  padding: 0.5rem 1rem;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-autodetect:hover:not(:disabled) {
  background: #5a6268;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-autodetect:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.plugin-install-content {
  padding: 1rem 0;
}

.install-compact-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.btn-upload {
  padding: 0.5rem 1rem;
  background: #2196f3;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-upload:hover:not(:disabled) {
  background: #1976d2;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.btn-upload:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.selected-file-compact {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.github-input-compact {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.github-branch-compact {
  width: 100px;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.btn-browse {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-browse:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-browse:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.help-text-compact {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.branch-switch-notice-compact {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(23, 162, 184, 0.1);
  border: 1px solid rgba(23, 162, 184, 0.3);
  border-radius: 4px;
  font-size: 0.875rem;
  color: #0c5460;
}

.available-plugins-compact {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.plugin-search-container {
  margin-bottom: 1rem;
}

.plugin-search-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.plugin-search-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(var(--accent-primary-rgb, 33, 150, 243), 0.2);
}

.plugin-search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.plugin-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 0.5rem;
}

.select-all-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
}

.select-all-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.btn-install-selected {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-install-selected:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-install-selected:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.plugin-item-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  gap: 0.75rem;
}

.plugin-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.plugin-item-inline.plugin-installed {
  background: rgba(40, 167, 69, 0.05);
  border-color: rgba(40, 167, 69, 0.3);
}

.plugin-checkbox-wrapper {
  display: flex;
  align-items: center;
}

.plugin-checkbox-wrapper input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.plugin-info-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.plugin-type-badge-small {
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.plugin-type-badge-small.type-calendar {
  background: #e3f2fd;
  color: #1976d2;
}

.plugin-type-badge-small.type-image {
  background: #f3e5f5;
  color: #7b1fa2;
}

.plugin-type-badge-small.type-service {
  background: #e8f5e9;
  color: #388e3c;
}

.plugin-type-badge-small.type-theme {
  background: #fff3e0;
  color: #f57c00;
}

.plugin-type-badge-small.type-backend {
  background: #e1bee7;
  color: #6a1b9a;
}

.plugin-version-small {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.plugin-installed-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 500;
  background: rgba(40, 167, 69, 0.1);
  color: #28a745;
  border: 1px solid rgba(40, 167, 69, 0.3);
}

.plugin-installed-badge.plugin-update-available {
  background: rgba(255, 193, 7, 0.1);
  color: #856404;
  border-color: rgba(255, 193, 7, 0.3);
}

.btn-update {
  background: #ffc107 !important;
  color: #000 !important;
}

.btn-update:hover:not(:disabled) {
  background: #ffb300 !important;
}

.btn-reinstall {
  padding: 0.5rem 1rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-reinstall:hover:not(:disabled) {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
}

.btn-reinstall:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-install {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-install:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.btn-install:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.rebuild-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
}

.rebuild-status--building {
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #3b82f6;
}

.rebuild-status--done {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #22c55e;
}

.rebuild-status--error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #ef4444;
}

.rebuild-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: rebuild-spin 0.8s linear infinite;
  flex-shrink: 0;
  opacity: 0.7;
}

@keyframes rebuild-spin {
  to {
    transform: rotate(360deg);
  }
}

.rebuild-status-text {
  flex: 1;
}

.btn-refresh-inline {
  padding: 0.25rem 0.625rem;
  background: rgba(34, 197, 94, 0.15);
  color: inherit;
  border: 1px solid currentColor;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.2s;
}

.btn-refresh-inline:hover {
  background: rgba(34, 197, 94, 0.3);
}

.error-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 4px;
  color: #dc3545;
  font-size: 0.875rem;
}

.success-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(40, 167, 69, 0.1);
  border: 1px solid rgba(40, 167, 69, 0.3);
  border-radius: 4px;
  color: #28a745;
  font-size: 0.875rem;
}

.branch-switch-notice {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(23, 162, 184, 0.1);
  border-radius: 4px;
  font-size: 0.875rem;
}

.restart-notice {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 4px;
}

.restart-notice-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.restart-notice-content strong {
  color: #856404;
  font-size: 1rem;
}

.restart-notice-content p {
  margin: 0;
  color: #856404;
  font-size: 0.875rem;
}

.restart-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.btn-primary {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-start;
}

.btn-primary:hover {
  background: var(--accent-secondary);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--shadow);
}

.restart-alternative {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.restart-alternative code {
  background: var(--bg-tertiary);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
}
</style>
