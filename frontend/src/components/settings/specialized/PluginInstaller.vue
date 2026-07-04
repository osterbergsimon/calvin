<template>
  <div class="plugin-installer">
    <div class="install-method">
      <SegmentedControl
        :model-value="installMethod"
        :options="installMethodOptions"
        aria-label="Install method"
        @update:model-value="installMethod = $event"
      />
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
          {{ installing ? "Installing…" : "Choose zip file" }}
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
          {{ enumerating ? "Loading…" : "List plugins" }}
        </button>
      </div>

      <!-- Branch Switch Notice -->
      <div
        v-if="branchSwitched && availablePlugins.length > 0"
        class="branch-switch-notice-compact"
      >
        Using branch <strong>{{ actualBranch }}</strong>
      </div>

      <!-- Available Plugins List -->
      <div v-if="filteredPlugins.length > 0" class="available-plugins-compact">
        <!-- Search Bar -->
        <div class="plugin-search-container">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search plugins…"
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
                ? `Installing ${selectedPlugins.length}…`
                : `Install selected (${selectedPlugins.length})`
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
              {{ installing ? "Installing…" : "Update" }}
            </button>
            <button
              v-else-if="plugin._installed"
              type="button"
              class="btn-install btn-reinstall"
              :disabled="installing"
              @click="handleForceUpdate(plugin.path)"
              title="Reinstall this plugin"
            >
              {{ installing ? "Installing…" : "Reinstall" }}
            </button>
            <button
              v-else
              type="button"
              class="btn-install"
              :disabled="installing"
              @click="handleInstall(plugin.path)"
            >
              {{ installing ? "Installing…" : "Install" }}
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
          {{ detecting ? "Detecting…" : "Auto-detect" }}
        </button>
        <button
          type="button"
          class="btn-browse"
          :disabled="!localPath || enumerating || installing || detecting"
          @click="handleListLocalPlugins"
        >
          {{ enumerating ? "Loading…" : "List plugins" }}
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
            placeholder="Search plugins…"
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
                ? `Installing ${selectedPlugins.length}…`
                : `Install selected (${selectedPlugins.length})`
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
              {{ installing ? "Installing…" : "Reinstall" }}
            </button>
            <button
              v-else
              type="button"
              class="btn-install"
              :disabled="installing"
              @click="handleInstallLocal(plugin.path, false)"
            >
              {{ installing ? "Installing…" : "Install" }}
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
            Restart backend now
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
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
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

const installMethodOptions = computed(() => {
  const opts = [
    { value: "zip", label: "Zip file" },
    { value: "github", label: "GitHub" },
  ];
  if (props.devMode) opts.push({ value: "local", label: "Local path" });
  return opts;
});
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
  const tabs = [{ id: "all", label: "All" }];
  const typeLabels = {
    calendar: "Calendar",
    image: "Image",
    service: "Service",
    backend: "Backend",
    theme: "Theme",
  };

  Object.entries(filteredPluginsByType.value).forEach(([type, plugins]) => {
    if (plugins.length > 0) {
      tabs.push({
        id: type,
        label: typeLabels[type] || type,
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
/* Rendered inside the "Install" SettingsSection panel, below the repository-URL
   row. Divide from that row and inset content to the same 1.25rem as SettingRow. */
.plugin-installer {
  width: 100%;
  padding: 1rem 1.25rem 1.25rem;
  border-top: 1px solid var(--line-soft);
}

.install-method {
  margin-bottom: 0.5rem;
}

.plugin-install-content {
  padding: 1rem 0 0;
}

.install-compact-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.help-text-compact {
  font-size: 0.875rem;
  color: var(--ink-2);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.selected-file-compact {
  color: var(--ink-2);
  font-size: 0.875rem;
}

/* Buttons — two roles, design tokens, no hover lift.
   Primary: focus fill. Secondary: bg-2 + border. */
.btn-upload,
.btn-browse,
.btn-install,
.btn-install-selected,
.btn-primary {
  padding: 0.5rem 1rem;
  min-height: var(--touch-target);
  background: var(--focus);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}
.btn-upload:hover:not(:disabled),
.btn-browse:hover:not(:disabled),
.btn-install:hover:not(:disabled),
.btn-install-selected:hover:not(:disabled),
.btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--focus), black 12%);
}
.btn-upload:focus-visible,
.btn-browse:focus-visible,
.btn-install:focus-visible,
.btn-install-selected:focus-visible,
.btn-primary:focus-visible,
.btn-autodetect:focus-visible,
.btn-reinstall:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.btn-upload:disabled,
.btn-browse:disabled,
.btn-install:disabled,
.btn-install-selected:disabled,
.btn-autodetect:disabled,
.btn-reinstall:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-autodetect,
.btn-reinstall {
  padding: 0.5rem 1rem;
  min-height: var(--touch-target);
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease;
}
.btn-autodetect:hover:not(:disabled),
.btn-reinstall:hover:not(:disabled) {
  border-color: var(--focus);
}

.btn-update {
  background: var(--warn);
  color: var(--ink);
}
.btn-update:hover:not(:disabled) {
  background: color-mix(in srgb, var(--warn), black 12%);
}

/* Inputs */
.github-input-compact,
.github-branch-compact,
.plugin-search-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-2);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 0.9rem;
}
.github-input-compact {
  flex: 1;
  min-width: 200px;
}
.github-branch-compact {
  width: 100px;
}
.plugin-search-input {
  width: 100%;
}
.github-input-compact:focus-visible,
.github-branch-compact:focus-visible,
.plugin-search-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-color: var(--focus);
}
.plugin-search-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.plugin-search-container {
  margin-bottom: 1rem;
}

.available-plugins-compact {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.plugin-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}

.select-all-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ink);
  font-family: var(--font-ui);
}
.select-all-checkbox input[type="checkbox"],
.plugin-checkbox-wrapper input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--focus);
}

.plugin-item-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.plugin-item-inline.plugin-installed {
  background: color-mix(in srgb, var(--ok) 5%, transparent);
  border-color: color-mix(in srgb, var(--ok) 30%, transparent);
}

.plugin-checkbox-wrapper {
  display: flex;
  align-items: center;
}

.plugin-info-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}
.plugin-info-inline strong {
  font-family: var(--font-ui);
  color: var(--ink);
}

.plugin-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
}

.plugin-type-badge-small {
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 600;
}

/* Plugin-type identity palette — categorical data colors, preserved per design spec */
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
  color: var(--ink-2);
  font-size: 0.75rem;
  font-family: var(--font-data);
}

.plugin-installed-badge {
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 500;
  background: color-mix(in srgb, var(--ok) 10%, transparent);
  color: var(--ok);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent);
}
.plugin-installed-badge.plugin-update-available {
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 30%, transparent);
}

/* Notices */
.branch-switch-notice-compact,
.branch-switch-notice {
  margin-top: 1rem;
  padding: 0.6rem 0.75rem;
  background: color-mix(in srgb, var(--ink-2) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ink-2) 25%, transparent);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  color: var(--ink-2);
}

.error-message {
  margin-top: 1rem;
  padding: 0.6rem 0.75rem;
  background: color-mix(in srgb, var(--err) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--err) 30%, transparent);
  border-radius: var(--radius-sm);
  color: var(--err);
  font-size: 0.875rem;
}

.success-message {
  margin-top: 1rem;
  padding: 0.6rem 0.75rem;
  background: color-mix(in srgb, var(--ok) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent);
  border-radius: var(--radius-sm);
  color: var(--ok);
  font-size: 0.875rem;
}

.restart-notice {
  margin-top: 1rem;
  padding: 1rem;
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
  border-radius: var(--radius-sm);
}
.restart-notice-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.restart-notice-content strong {
  color: var(--warn);
  font-size: 1rem;
}
.restart-notice-content p {
  margin: 0;
  color: var(--warn);
  font-size: 0.875rem;
}
.restart-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.btn-primary {
  align-self: flex-start;
}
.restart-alternative {
  font-size: 0.875rem;
  color: var(--ink-2);
}
.restart-alternative code {
  background: var(--bg-2);
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-xs);
  font-family: var(--font-data);
  font-size: 0.85rem;
}
</style>
