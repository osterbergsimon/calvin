<template>
  <div class="plugin-installer">
    <!-- From the Calvin catalog (§3.3): listed on open, nothing to type. -->
    <section class="catalog" aria-label="Install from the Calvin catalog">
      <h3 class="catalog-title">Install from the Calvin catalog</h3>

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
        v-if="catalogTypeTabs.length > 1"
        :tabs="catalogTypeTabs"
        :active-tab="activeTypeTab"
        @tab-change="activeTypeTab = $event"
      />

      <p v-if="catalogEnumerating" class="catalog-status">Loading the catalog…</p>
      <p v-else-if="catalogError" class="catalog-status">{{ catalogError }}</p>
      <p v-else-if="catalogRows.length === 0" class="catalog-status">
        Nothing in the catalog matches this filter.
      </p>

      <div v-else class="catalog-list">
        <div
          v-for="plugin in catalogRows"
          :key="plugin.id"
          class="catalog-row"
          :data-catalog-plugin-id="plugin.id"
        >
          <span class="catalog-icon" aria-hidden="true">
            <img
              v-if="isIconFile(plugin.icon)"
              class="catalog-icon-img"
              :src="pluginIconUrl(plugin)"
              alt=""
            />
            <template v-else-if="plugin.icon">{{ plugin.icon }}</template>
            <template v-else>{{ catalogLetter(plugin) }}</template>
          </span>
          <div class="catalog-info">
            <strong>{{ plugin.name || plugin.id }}</strong>
            <span class="plugin-type-badge-small" :class="`type-${plugin.type}`">
              {{ pluginKindLabel(plugin) }}
            </span>
            <span v-if="plugin.version" class="plugin-version-small">v{{ plugin.version }}</span>
            <p v-if="plugin.description" class="plugin-desc-inline">{{ plugin.description }}</p>
          </div>
          <div class="catalog-actions">
            <template v-if="plugin._installed">
              <button
                v-if="hasUpdate(plugin)"
                type="button"
                class="btn-install btn-update"
                :disabled="installing"
                @click="handleInstallFromCatalog(plugin.path)"
              >
                {{ installing ? "Installing…" : "Update" }}
              </button>
              <span v-else class="plugin-installed-badge">Installed ✓</span>
              <button
                v-if="!hasUpdate(plugin) && canAddSource(plugin)"
                type="button"
                class="btn-reinstall"
                @click="$emit('add-source', plugin.id)"
              >
                Add a source
              </button>
            </template>
            <button
              v-else
              type="button"
              class="btn-install"
              :disabled="installing"
              @click="handleInstallFromCatalog(plugin.path)"
            >
              {{ installing ? "Installing…" : "Install" }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Another GitHub repository stays a deliberate visit (§3.3). -->
    <details class="install-disclosure">
      <summary>From another GitHub repository</summary>
      <div class="plugin-install-content">
        <p class="help-text-compact">
          Enter a GitHub repository URL and click "List plugins" to see available plugins and
          themes.
        </p>
        <div class="install-compact-row">
          <input
            :value="repoUrl"
            type="text"
            placeholder="https://github.com/user/repo"
            class="github-input-compact"
            :disabled="enumerating || installing"
            @input="handleRepoUrlInput"
          />
          <input
            :value="branch"
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

        <div
          v-if="branchSwitched && availablePlugins.length > 0"
          class="branch-switch-notice-compact"
        >
          Using branch <strong>{{ actualBranch }}</strong>
        </div>

        <div v-if="filteredPlugins.length > 0" class="available-plugins-compact">
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
                {{ pluginKindLabel(plugin) }}
              </span>
              <span v-if="plugin.version" class="plugin-version-small">
                v{{ plugin.version }}
              </span>
              <span
                v-if="plugin._installed"
                class="plugin-installed-badge"
                :class="{ 'plugin-update-available': hasUpdate(plugin) }"
              >
                {{
                  hasUpdate(plugin)
                    ? `Installed: v${plugin._installedVersion} → Update to v${plugin.version}`
                    : `Installed: v${plugin._installedVersion || "?"}`
                }}
              </span>
              <p v-if="plugin.description" class="plugin-desc-inline">{{ plugin.description }}</p>
            </div>
            <div class="plugin-actions">
              <button
                v-if="hasUpdate(plugin)"
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
    </details>

    <!-- Local path stays dev-only (§3.3). -->
    <details v-if="devMode" class="install-disclosure">
      <summary>Local path (development)</summary>
      <div class="plugin-install-content">
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

        <div
          v-if="installSource === 'local' && filteredPlugins.length > 0"
          class="available-plugins-compact"
        >
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
                pluginKindLabel(plugin)
              }}</span>
              <span v-if="plugin.version" class="plugin-version-small">v{{ plugin.version }}</span>
              <span v-if="plugin._installed" class="plugin-installed-badge">
                Installed: v{{ plugin._installedVersion || "?" }}
              </span>
              <p v-if="plugin.description" class="plugin-desc-inline">{{ plugin.description }}</p>
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
    </details>

    <!-- A zip file remains a supported offline install path. -->
    <details class="install-disclosure">
      <summary>From a zip file</summary>
      <div class="plugin-install-content">
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
    </details>

    <!-- Installation Status Messages -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
    <div v-if="success" class="success-message">
      {{ success }}
      <div v-if="branchSwitched" class="branch-switch-notice">
        ℹ️ Branch switched from 'main' to 'master' (main branch not found)
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import TabNavigation from "../shared/TabNavigation.vue";
import * as pluginsApi from "@/services/pluginsApi";
import { pluginKindFilters, pluginKindKey, pluginKindLabel } from "@/utils/pluginKind";
import { isNewerVersion } from "@/utils/pluginVersions";
import { isIconFile, pluginIconUrl } from "@/utils/pluginIcon";

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
  // The official catalog (§3.3), enumerated by the category on open. Kept apart
  // from `availablePlugins` so browsing another repository can never put its
  // rows under the "Calvin catalog" heading.
  catalogPlugins: {
    type: Array,
    default: () => [],
  },
  catalogRepoUrl: {
    type: String,
    default: "",
  },
  // Installed plugin metadata, so a catalog row for an installed plugin gets
  // its plain kind (e.g. Weather is "Clock bar", not "Web page & app").
  knownPlugins: {
    type: Array,
    default: () => [],
  },
  catalogBranch: {
    type: String,
    default: "main",
  },
  catalogEnumerating: {
    type: Boolean,
    default: false,
  },
  catalogError: {
    type: String,
    default: "",
  },
  error: {
    type: String,
    default: "",
  },
  success: {
    type: String,
    default: "",
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
  // Arrived from a Content picker's "Get more in Plugins ›": open on that kind.
  initialType: {
    type: String,
    default: "all",
  },
});

const emit = defineEmits([
  "zip-select",
  "list-plugins",
  "install",
  "install-selected",
  "install-local",
  "install-selected-local",
  "add-source",
  "update:repoUrl",
  "update:branch",
  "force-update",
]);

const installSource = ref("github"); // 'github' | 'local'
const localPath = ref("");
const detecting = ref(false);
const selectedPluginIds = ref(new Set());
const searchQuery = ref("");
const activeTypeTab = ref("all");

// A Content picker's "Get more" link hands over a kind; show the catalog with
// that filter already applied.
watch(
  () => props.initialType,
  type => {
    if (type && type !== "all") activeTypeTab.value = pluginKindKey({ type });
  },
  { immediate: true }
);

// The plugin repo ships fixtures for its own test suite ("test" keyword); end
// users shouldn't be offered them, developers in dev mode still are (F8).
const isTestPlugin = p => (p.keywords || p.manifest?.keywords || []).includes("test");
const withoutTestFixtures = list => (props.devMode ? list : list.filter(p => !isTestPlugin(p)));

// An Installed card's Update, and the catalog row's, only offer a genuinely
// newer version (never a downgrade).
const hasUpdate = plugin =>
  Boolean(plugin._installed) && isNewerVersion(plugin.version, plugin._installedVersion);

const canAddSource = plugin => ["calendar", "image", "service"].includes(plugin.type);

// --- catalog panel ---------------------------------------------------------

const enrichedCatalog = computed(() => {
  const knownById = Object.fromEntries((props.knownPlugins || []).map(item => [item.id, item]));
  return props.catalogPlugins.map(item => {
    const known = knownById[item.id];
    if (!known) return item;
    return {
      ...item,
      icon: item.icon ?? known.icon,
      display_schema: item.display_schema ?? known.display_schema,
      statusbar_schema: item.statusbar_schema ?? known.statusbar_schema,
    };
  });
});

const catalogList = computed(() => withoutTestFixtures(enrichedCatalog.value));

const catalogFilters = computed(() => pluginKindFilters(catalogList.value));
const catalogTypeTabs = computed(() =>
  catalogFilters.value.map(option => ({ id: option.id, label: option.label }))
);

const catalogRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return catalogList.value.filter(plugin => {
    const matchesKind =
      activeTypeTab.value === "all" || pluginKindKey(plugin) === activeTypeTab.value;
    const matchesQuery =
      !query ||
      (plugin.name || "").toLowerCase().includes(query) ||
      (plugin.id || "").toLowerCase().includes(query) ||
      (plugin.description || "").toLowerCase().includes(query);
    return matchesKind && matchesQuery;
  });
});

const catalogLetter = plugin => (plugin.name || plugin.id || "?").charAt(0).toUpperCase();

// Catalog rows install from the configured catalog only — never from whatever
// repository happens to sit in the "another repository" fields.
const handleInstallFromCatalog = pluginPath => {
  emit("install", {
    path: pluginPath,
    repoUrl: props.catalogRepoUrl,
    branch: props.catalogBranch || "main",
    force: false,
  });
};

// --- "another repository" / local lists ------------------------------------

// Filter plugins by search query
const filteredPlugins = computed(() => {
  const list = withoutTestFixtures(props.availablePlugins);
  if (!searchQuery.value.trim()) {
    return list;
  }
  const query = searchQuery.value.toLowerCase();
  return list.filter(
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
    const tabPlugins = filteredPluginsByType.value[activeTypeTab.value] || [];
    if (tabPlugins.length === 0) {
      activeTypeTab.value = "all";
    }
  }
});
</script>

<style scoped>
/* Sole content of the "Install" SettingsSection panel; inset to match SettingRow. */
.plugin-installer {
  width: 100%;
  padding: 1.25rem;
}

.catalog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.catalog-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink);
}

.catalog-status {
  margin: 0;
  padding: 0.5rem 0;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  color: var(--ink-3);
}

.catalog-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.catalog-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 1rem;
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
}

.catalog-row:last-child {
  border-bottom: 0;
}

.catalog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: var(--radius-sm);
  background: var(--bg-0);
  color: var(--ink-2);
  font-family: var(--font-ui);
  font-weight: 600;
}

.catalog-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.catalog-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.catalog-info strong {
  font-family: var(--font-ui);
  color: var(--ink);
}

.catalog-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
}

.install-disclosure {
  margin-top: 1.25rem;
  border-top: 1px solid var(--line);
  padding-top: 0.75rem;
}

.install-disclosure > summary {
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  color: var(--ink-2);
  min-height: var(--touch-target);
  display: flex;
  align-items: center;
}

.install-disclosure > summary:hover {
  color: var(--ink);
}

.install-disclosure > summary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
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
  margin-bottom: 0.25rem;
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
.plugin-desc-inline {
  flex-basis: 100%;
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-2);
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
  background: var(--bg-1);
  color: var(--ink-2);
  border: 1px solid var(--line);
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
</style>
