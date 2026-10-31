<template>
  <div class="plugin-installer">
    <!-- From the Calvin catalog (§3.3): listed on open, nothing to type. -->
    <section class="catalog" aria-label="Install from the Calvin catalog">
      <h3 class="catalog-title">Install from the Calvin catalog</h3>

      <TextField
        v-model="searchQuery"
        class="plugin-search"
        label="Search plugins"
        type="search"
        placeholder="Search plugins…"
        :disabled="installing"
      />

      <div v-if="catalogTypeOptions.length > 1" class="catalog-filters">
        <SegmentedControl
          :model-value="activeTypeTab"
          :options="catalogTypeOptions"
          aria-label="Plugin kind"
          @update:model-value="activeTypeTab = $event"
        />
      </div>

      <InlineNote v-if="catalogEnumerating">Loading the catalog…</InlineNote>
      <InlineNote v-else-if="catalogError" tone="err">{{ catalogError }}</InlineNote>
      <InlineNote v-else-if="catalogRows.length === 0">
        Nothing in the catalog matches this filter.
      </InlineNote>

      <div v-else class="catalog-list">
        <ListRow
          v-for="plugin in catalogRows"
          :key="plugin.id"
          :name="plugin.name || plugin.id"
          :data-catalog-plugin-id="plugin.id"
          class="catalog-row"
        >
          <template #lead>
            <span class="catalog-icon" aria-hidden="true">
              <svg v-if="pluginIconPath(plugin)" class="catalog-icon-svg" viewBox="0 0 24 24">
                <path :d="pluginIconPath(plugin)" fill="currentColor" />
              </svg>
              <img
                v-else-if="isIconFile(plugin.icon)"
                class="catalog-icon-img"
                :src="pluginIconUrl(plugin)"
                alt=""
              />
              <template v-else>{{ catalogLetter(plugin) }}</template>
            </span>
          </template>

          <template #meta>
            <span class="catalog-meta">
              <Tag class="plugin-type-badge-small">{{ pluginKindLabel(plugin) }}</Tag>
              <span v-if="plugin.version" class="plugin-version-small">v{{ plugin.version }}</span>
              <span v-if="plugin.description" class="plugin-desc-inline">
                {{ plugin.description }}
              </span>
            </span>
          </template>

          <template #actions>
            <template v-if="plugin._installed">
              <Button
                v-if="hasUpdate(plugin)"
                variant="primary"
                :loading="installing"
                loading-label="Installing…"
                @click="handleInstallFromCatalog(plugin.path)"
              >
                Update
              </Button>
              <Tag v-else tone="ok" class="plugin-installed-badge">Installed</Tag>
              <Button
                v-if="!hasUpdate(plugin) && canAddSource(plugin)"
                variant="secondary"
                @click="$emit('add-source', plugin.id)"
              >
                Add a source
              </Button>
            </template>
            <Button
              v-else
              variant="primary"
              :loading="installing"
              loading-label="Installing…"
              @click="handleInstallFromCatalog(plugin.path)"
            >
              Install
            </Button>
          </template>
        </ListRow>
      </div>
    </section>

    <!-- Another GitHub source stays a deliberate visit (§3.3). -->
    <details class="install-disclosure">
      <summary>From another GitHub address</summary>
      <div class="plugin-install-content">
        <InlineNote class="help-text-compact">
          Paste a GitHub address and choose List plugins.
        </InlineNote>
        <div class="install-compact-row">
          <TextField
            :model-value="repoUrl"
            class="github-input-compact"
            label="GitHub address"
            placeholder="https://github.com/user/repo"
            :disabled="enumerating || installing"
            @update:model-value="handleRepoUrlInput"
          />
          <TextField
            :model-value="branch"
            class="github-branch-compact"
            label="Version"
            placeholder="main"
            :disabled="enumerating || installing"
            @update:model-value="handleBranchInput"
          />
          <Button
            variant="secondary"
            :disabled="!repoUrl || enumerating || installing"
            @click="handleListPlugins"
          >
            {{ enumerating ? "Loading…" : "List plugins" }}
          </Button>
        </div>

        <InlineNote
          v-if="branchSwitched && availablePlugins.length > 0"
          class="branch-switch-notice-compact"
        >
          Version: <strong>{{ actualBranch }}</strong>
        </InlineNote>

        <div v-if="filteredPlugins.length > 0" class="available-plugins-compact">
          <div class="plugin-list-header">
            <label class="plugin-check-all">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                @change="handleSelectAll"
              />
              <span>Select all</span>
            </label>
            <Button
              variant="secondary"
              :disabled="installing || selectedPlugins.length === 0"
              @click="handleInstallSelected"
            >
              {{
                installing
                  ? `Installing ${selectedPlugins.length}…`
                  : `Install selected (${selectedPlugins.length})`
              }}
            </Button>
          </div>

          <ListRow
            v-for="plugin in activeTypePlugins"
            :key="plugin.id"
            :name="plugin.name || plugin.id"
            class="plugin-item-inline"
          >
            <template #lead>
              <span class="plugin-checkbox-wrapper">
                <input
                  type="checkbox"
                  :checked="isSelected(plugin.id)"
                  :disabled="installing"
                  :aria-label="`Select ${plugin.name || plugin.id}`"
                  @change="handleToggleSelect(plugin.id)"
                />
              </span>
            </template>

            <template #meta>
              <span class="plugin-info-inline">
                <Tag class="plugin-type-badge-small">{{ pluginKindLabel(plugin) }}</Tag>
                <span v-if="plugin.version" class="plugin-version-small">
                  v{{ plugin.version }}
                </span>
                <Tag
                  v-if="plugin._installed"
                  class="plugin-installed-badge"
                  :tone="hasUpdate(plugin) ? 'warn' : 'ok'"
                  :title="
                    hasUpdate(plugin)
                      ? `Installed: v${plugin._installedVersion} → Update to v${plugin.version}`
                      : `Installed: v${plugin._installedVersion || '?'}`
                  "
                >
                  {{ hasUpdate(plugin) ? "Update" : "Installed" }}
                </Tag>
                <span v-if="plugin.description" class="plugin-desc-inline">
                  {{ plugin.description }}
                </span>
              </span>
            </template>

            <template #actions>
              <Button
                v-if="hasUpdate(plugin)"
                variant="primary"
                :loading="installing"
                loading-label="Installing…"
                @click="handleInstall(plugin.path)"
              >
                Update
              </Button>
              <Button
                v-else-if="plugin._installed"
                variant="secondary"
                :loading="installing"
                loading-label="Installing…"
                title="Reinstall this plugin"
                @click="handleForceUpdate(plugin.path)"
              >
                Reinstall
              </Button>
              <Button
                v-else
                variant="primary"
                :loading="installing"
                loading-label="Installing…"
                @click="handleInstall(plugin.path)"
              >
                Install
              </Button>
            </template>
          </ListRow>
        </div>
      </div>
    </details>

    <!-- Local path stays dev-only (§3.3). -->
    <details v-if="devMode" class="install-disclosure">
      <summary>Local path (development)</summary>
      <div class="plugin-install-content">
        <InlineNote class="help-text-compact">
          For plugin developers: install from a folder on the Calvin server.
        </InlineNote>
        <div class="install-compact-row">
          <TextField
            v-model="localPath"
            class="github-input-compact"
            label="Folder path"
            placeholder="/absolute/path/to/calvin-plugins"
            :disabled="enumerating || installing || detecting"
          />
          <Button
            variant="secondary"
            :disabled="enumerating || installing || detecting"
            title="Auto-detect sibling plugin repositories"
            @click="handleAutoDetect"
          >
            {{ detecting ? "Detecting…" : "Auto-detect" }}
          </Button>
          <Button
            variant="secondary"
            :disabled="!localPath || enumerating || installing || detecting"
            @click="handleListLocalPlugins"
          >
            {{ enumerating ? "Loading…" : "List plugins" }}
          </Button>
        </div>

        <div
          v-if="installSource === 'local' && filteredPlugins.length > 0"
          class="available-plugins-compact"
        >
          <div class="plugin-list-header">
            <label class="plugin-check-all">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                @change="handleSelectAll"
              />
              <span>Select all</span>
            </label>
            <Button
              variant="secondary"
              :disabled="installing || selectedPlugins.length === 0"
              @click="handleInstallSelectedLocal"
            >
              {{
                installing
                  ? `Installing ${selectedPlugins.length}…`
                  : `Install selected (${selectedPlugins.length})`
              }}
            </Button>
          </div>

          <ListRow
            v-for="plugin in activeTypePlugins"
            :key="plugin.id"
            :name="plugin.name || plugin.id"
            class="plugin-item-inline"
          >
            <template #lead>
              <span class="plugin-checkbox-wrapper">
                <input
                  type="checkbox"
                  :checked="isSelected(plugin.id)"
                  :disabled="installing"
                  :aria-label="`Select ${plugin.name || plugin.id}`"
                  @change="handleToggleSelect(plugin.id)"
                />
              </span>
            </template>

            <template #meta>
              <span class="plugin-info-inline">
                <Tag class="plugin-type-badge-small">{{ pluginKindLabel(plugin) }}</Tag>
                <span v-if="plugin.version" class="plugin-version-small"
                  >v{{ plugin.version }}</span
                >
                <Tag
                  v-if="plugin._installed"
                  tone="ok"
                  class="plugin-installed-badge"
                  :title="`Installed: v${plugin._installedVersion || '?'}`"
                >
                  Installed
                </Tag>
                <span v-if="plugin.description" class="plugin-desc-inline">
                  {{ plugin.description }}
                </span>
              </span>
            </template>

            <template #actions>
              <Button
                v-if="plugin._installed"
                variant="secondary"
                :loading="installing"
                loading-label="Installing…"
                @click="handleInstallLocal(plugin.path, true)"
              >
                Reinstall
              </Button>
              <Button
                v-else
                variant="primary"
                :loading="installing"
                loading-label="Installing…"
                @click="handleInstallLocal(plugin.path, false)"
              >
                Install
              </Button>
            </template>
          </ListRow>
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
          <Button
            variant="secondary"
            :loading="installing"
            loading-label="Installing…"
            @click="$refs.zipInput?.click()"
          >
            Choose zip file
          </Button>
          <span v-if="selectedFile" class="selected-file-compact">
            {{ selectedFile.name }}
          </span>
        </div>
      </div>
    </details>

    <!-- Installation Status Messages -->
    <InlineNote v-if="error" class="installer-note" tone="err">{{ error }}</InlineNote>
    <InlineNote v-if="success" class="installer-note" tone="ok">{{ success }}</InlineNote>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import Tag from "@/components/ui/Tag.vue";
import TextField from "@/components/ui/TextField.vue";
import * as pluginsApi from "@/services/pluginsApi";
import { pluginKindFilters, pluginKindKey, pluginKindLabel } from "@/utils/pluginKind";
import { isNewerVersion } from "@/utils/pluginVersions";
import { isIconFile, pluginIconPath, pluginIconUrl } from "@/utils/pluginIcon";
import { isCatalogEntry, isTestPlugin } from "@/utils/pluginCatalog";

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
// `catalog: false` entries are hidden in every mode: they are development-only
// or otherwise not for the picker.
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

const catalogList = computed(() =>
  withoutTestFixtures(enrichedCatalog.value).filter(isCatalogEntry)
);

const catalogFilters = computed(() => pluginKindFilters(catalogList.value));
const catalogTypeOptions = computed(() =>
  catalogFilters.value.map(option => ({ value: option.id, label: option.label }))
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

const handleRepoUrlInput = value => {
  emit("update:repoUrl", value);
};

const handleBranchInput = value => {
  emit("update:branch", value);
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
  padding: var(--panel-pad-y) var(--panel-pad-x);
}

.catalog {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}

.catalog-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.catalog-filters {
  display: flex;
  max-width: 100%;
  overflow-x: auto;
}

.catalog-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
}

.catalog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--bg-0);
  color: var(--ink-2);
  font-family: var(--font-ui);
  font-weight: var(--weight-title);
}

.catalog-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.catalog-icon-svg {
  width: 62%;
  height: 62%;
}

.catalog-meta,
.plugin-info-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline);
}

.plugin-desc-inline {
  flex-basis: 100%;
  margin: 0;
  font-size: var(--text-meta);
  color: var(--ink-2);
}

.plugin-version-small {
  color: var(--ink-2);
  font-size: var(--text-caption);
  font-family: var(--font-data);
}

.install-disclosure {
  margin-top: var(--gap-5);
  padding-top: var(--gap-3);
  border-top: 1px solid var(--line);
}

.install-disclosure > summary {
  display: flex;
  align-items: center;
  min-height: var(--touch-target);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink-2);
}

.install-disclosure > summary:hover {
  color: var(--ink);
}

.install-disclosure > summary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Closed disclosures must take no room: Chromium keeps a skipped
   `::details-content` subtree's last layout boxes around, which leaves
   invisible inputs behind the next summary (and makes them hit-testable).
   A descendant selector, because `details > *` no longer matches through
   Chromium's `::details-content` wrapper. */
.install-disclosure:not([open]) .plugin-install-content {
  display: none;
}

.plugin-install-content {
  padding: var(--gap-4) 0 0;
}

.install-compact-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--gap-3);
}

.github-input-compact {
  flex: 1;
  min-width: 12rem;
}

.github-branch-compact {
  width: 6rem;
}

.help-text-compact {
  margin-bottom: var(--gap-3);
}

.branch-switch-notice-compact,
.installer-note {
  margin-top: var(--gap-4);
}

.available-plugins-compact {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
  margin-top: var(--gap-4);
}

.plugin-list-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-3);
}

.plugin-check-all {
  display: flex;
  align-items: center;
  gap: var(--gap-inline);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.plugin-check-all input[type="checkbox"],
.plugin-checkbox-wrapper input[type="checkbox"] {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: var(--focus);
}

.plugin-checkbox-wrapper {
  display: flex;
  align-items: center;
}

.selected-file-compact {
  color: var(--ink-2);
  font-size: var(--text-meta);
}
</style>
