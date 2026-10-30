<template>
  <div class="plugins-category">
    <!-- Plugin Management -->
    <SettingsSection id="plugins-installed" title="Installed">
      <PluginManager
        :plugins="plugins"
        :instances="pluginInstances"
        :loading="loadingPlugins"
        :active-tab="activePluginTab"
        :expanded-plugins="expandedPlugins"
        :form-data="pluginFormData"
        :saving="savingPlugin"
        :testing="testingPlugin"
        :fetching="fetchingPlugin"
        :save-status="pluginSaveStatus"
        :test-status="pluginTestStatus"
        :fetch-status="pluginFetchStatus"
        :images="imagesList"
        :uploading="uploading"
        :upload-error="uploadError"
        :upload-success="uploadSuccess"
        :show-theme-info="!hasInstalledThemes"
        :latest-versions="catalogUpdates"
        :updating-plugin="updatingPlugin"
        @tab-change="activePluginTab = $event"
        @toggle-expand="handleToggleExpand"
        @toggle-enabled="handleToggleEnabled"
        @uninstall="handleUninstall"
        @update-form-value="handleUpdateFormValue"
        @save-config="handleSaveConfig"
        @test-connection="handleTestConnection"
        @fetch-now="handleFetchNow"
        @custom-action="handleCustomAction"
        @used-by="openSourcesFor"
        @add-source="openSourcesFor"
        @update="handleUpdate"
        @open-appearance="openAppearance"
        @upload="handleUpload"
        @delete-image="handleDeleteImage"
      />
    </SettingsSection>

    <!-- Plugin Installation Section -->
    <SettingsSection id="plugins-install" title="Install">
      <PluginInstaller
        :repo-url="githubRepoUrl"
        :branch="githubBranch"
        :enumerating="enumeratingPlugins"
        :installing="installingPlugin"
        :available-plugins="availablePlugins"
        :catalog-plugins="catalogPlugins"
        :catalog-repo-url="catalogRepo"
        :catalog-branch="catalogBranch"
        :catalog-enumerating="catalogEnumerating"
        :catalog-error="catalogError"
        :known-plugins="plugins"
        :error="pluginInstallError"
        :success="pluginInstallSuccess"
        :branch-switched="pluginBranchSwitched"
        :actual-branch="pluginActualBranch"
        :dev-mode="configStore.devMode"
        :initial-type="installKindFilter"
        @update:repoUrl="githubRepoUrl = $event"
        @update:branch="githubBranch = $event"
        @zip-select="handleZipSelect"
        @list-plugins="handleListPlugins"
        @install="handleInstall"
        @install-selected="handleInstallSelected"
        @install-local="handleInstallLocal"
        @install-selected-local="handleInstallSelectedLocal"
        @force-update="handleForceUpdate"
        @add-source="openSourcesFor"
      />
    </SettingsSection>

    <!-- Turn-off Confirm Modal -->
    <ConfirmModal
      :show="showDisableModal"
      :title="`Turn off ${pendingDisable?.name || 'this add-on'}?`"
      :message="disableMessage"
      confirm-text="Turn off"
      @confirm="confirmDisable"
      @cancel="cancelDisable"
    />

    <!-- Uninstall Confirm Modal -->
    <ConfirmModal
      :show="showUninstallModal"
      title="Uninstall plugin"
      :message="uninstallMessage"
      confirm-text="Uninstall"
      @confirm="confirmUninstall"
      @cancel="cancelUninstall"
    />

    <!-- Pip Security Warning Modal -->
    <div v-if="showPipWarningModal" class="modal-overlay" @click.self="cancelPipInstall">
      <div class="modal-content pip-warning-modal">
        <div class="modal-header">
          <h3>⚠️ Security Warning</h3>
          <IconButton variant="ghost" label="Close" @click="cancelPipInstall">×</IconButton>
        </div>
        <div class="modal-body">
          <p>
            <strong>{{ pipWarningPluginName }}</strong> requires installing the following Python
            {{ pipWarningPackages.length === 1 ? "package" : "packages" }}
            into the server environment:
          </p>
          <ul class="pip-package-list">
            <li v-for="pkg in pipWarningPackages" :key="pkg">
              <code>{{ pkg }}</code>
            </li>
          </ul>
          <p class="pip-warning-text">
            Only install plugins from sources you trust. A malicious pip package can execute
            arbitrary code on your server.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="cancelPipInstall">Cancel</button>
          <button class="btn-danger" @click="confirmPipInstall">Install Anyway</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { usePlugins } from "@/composables";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";
import { useNotificationsStore } from "@/stores/notifications";
import * as pluginsApi from "@/services/pluginsApi";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import IconButton from "@/components/ui/IconButton.vue";
import PluginInstaller from "../specialized/PluginInstaller.vue";
import PluginManager from "../specialized/PluginManager.vue";
import ConfirmModal from "../shared/ConfirmModal.vue";
import { pluginKindKey } from "@/utils/pluginKind";
import { isOfficialCatalogRepo } from "@/utils/pluginCatalog";
import { errorDetailMessage } from "@/utils/apiErrors";
import { isNewerVersion } from "@/utils/pluginVersions";

// Use composables
const {
  plugins,
  pluginInstances,
  loadingPlugins,
  installingPlugin,
  enumeratingPlugins,
  githubRepoUrl,
  githubBranch,
  availablePlugins,
  catalogPlugins,
  catalogEnumerating,
  catalogError,
  pluginInstallError,
  pluginInstallSuccess,
  pluginBranchSwitched,
  pluginActualBranch,
  expandedPlugins,
  pluginFormData,
  savingPlugin,
  testingPlugin,
  fetchingPlugin,
  pluginSaveStatus,
  pluginTestStatus,
  pluginFetchStatus,
  loadPlugins,
  installPluginFromZip,
  enumeratePluginsFromGitHub,
  enumerateCatalogPlugins,
  installPluginFromGitHub,
  installPluginsFromGitHub,
  enumeratePluginsFromLocal,
  installPluginFromLocal,
  installPluginsFromLocal,
  uninstallPlugin,
  loadPluginConfig,
  updatePluginFormValue,
  savePluginConfig,
  testPluginConnection,
  fetchPluginNow,
  togglePlugin,
} = usePlugins();

const configStore = useConfigStore();
const imagesStore = useImagesStore();
const notificationsStore = useNotificationsStore();
const router = useRouter();
const route = useRoute();

// Local state
const activePluginTab = ref("all");
const uploading = ref(false);
const uploadError = ref("");
const uploadSuccess = ref("");

// Computed for images
const imagesList = computed(() => imagesStore.images);

// Computed
const hasInstalledThemes = computed(() => {
  return plugins.value.some(p => p.type === "theme" && p._installed);
});

// "Get more in Plugins ›" from a Content picker arrives with the kind it was
// shopping for, so Install opens on that filter.
const installKindFilter = computed(() =>
  typeof route?.query?.pluginKind === "string" ? route.query.pluginKind : "all"
);

// The official catalog (§3.3): listed on open, and the only source of an
// Update on an Installed card. A non-official repository is never one-click
// installable — that stays the disclosure's deliberate "List plugins" path.
const catalogRepo = computed(() => configStore.pluginCatalogRepo || "");
const officialCatalog = computed(() => isOfficialCatalogRepo(catalogRepo.value));
const catalogBranch = "main";
const updatingPlugin = ref("");

const catalogUpdates = computed(() => {
  if (!officialCatalog.value) return {};
  const byId = Object.fromEntries(catalogPlugins.value.map(plugin => [plugin.id, plugin]));
  const updates = {};
  for (const plugin of plugins.value) {
    if (!plugin._installed) continue;
    const entry = byId[plugin.id];
    if (entry && isNewerVersion(entry.version, plugin.version)) {
      updates[plugin.id] = entry.version;
    }
  }
  return updates;
});

// Pip security warning modal state
const showPipWarningModal = ref(false);
const pipWarningPackages = ref([]);
const pipWarningPluginName = ref("");
const pendingInstallAction = ref(null);

const triggerPipWarning = (packages, pluginName, onConfirm) => {
  pipWarningPackages.value = [...new Set(packages)];
  pipWarningPluginName.value = pluginName;
  pendingInstallAction.value = onConfirm;
  showPipWarningModal.value = true;
};

const confirmPipInstall = async () => {
  showPipWarningModal.value = false;
  const action = pendingInstallAction.value;
  pendingInstallAction.value = null;
  if (action) await action();
};

const cancelPipInstall = () => {
  showPipWarningModal.value = false;
  pendingInstallAction.value = null;
};

// Mirrors what PluginCard renders when expanded: plugin-level settings,
// actions or custom sections. Sources are added in Content now, so a plugin
// with only an instance schema has nothing to expand into.
const cardHasBody = plugin =>
  Object.entries(plugin.common_config_schema || {}).some(
    ([key, schema]) => !key.startsWith("_") && !schema?.ui?.hidden
  ) ||
  (plugin.ui_actions || []).length > 0 ||
  (plugin.ui_sections || []).length > 0;

// After an install (F5): a new plugin type lands disabled and on whatever tab
// was open, so switch it on, jump to it and say what to do next.
const afterInstall = async installedIds => {
  const installed = (installedIds || [])
    .map(id => plugins.value.find(p => p.id === id))
    .filter(Boolean);
  if (installed.length === 0) {
    if (installedIds?.length) {
      notificationsStore.notify({
        severity: "info",
        eyebrow: "Plugins",
        message: "Plugin installed — reload this page if it does not appear.",
      });
    }
    return;
  }

  for (const plugin of installed) {
    // Themes have no on/off switch; everything else becomes usable straight away.
    if (plugin.type !== "theme" && !plugin.enabled) {
      try {
        await togglePlugin(plugin.id, true);
      } catch (error) {
        console.error(`Failed to enable plugin ${plugin.id}:`, error);
      }
    }
  }

  const first = installed[0];
  const hasSetup = first.type !== "theme" && cardHasBody(first);
  activePluginTab.value = pluginKindKey(first);
  if (hasSetup) {
    expandedPlugins.value[first.id] = true;
    void Promise.resolve(loadPluginConfig(first.id)).catch(() => {});
  }
  await nextTick();
  document
    .querySelector(`[data-plugin-id="${CSS.escape(first.id)}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const names = installed.map(p => p.name || p.id).join(", ");
  notificationsStore.notify({
    severity: "success",
    eyebrow: "Plugin installed",
    message:
      first.type === "theme"
        ? `${names} installed — pick it under Dashboard › Appearance.`
        : hasSetup
          ? `${names} installed and enabled — finish its setup below.`
          : `${names} installed and enabled — add a source from Content when you need it.`,
  });
};

// Handlers
const handleZipSelect = async file => {
  try {
    const result = await pluginsApi.inspectPluginZip(file);
    const deps = result.manifest?.dependencies?.packages ?? [];
    if (deps.length > 0) {
      triggerPipWarning(deps, result.manifest?.name ?? file.name, async () =>
        afterInstall(await installPluginFromZip(file))
      );
      return;
    }
  } catch {
    // Inspection failed — let the install endpoint surface the real error
  }
  await afterInstall(await installPluginFromZip(file));
};

const handleListPlugins = async ({ repoUrl, branch, source, localPath }) => {
  if (source === "local") {
    await enumeratePluginsFromLocal(localPath);
  } else {
    // The GitHub field is now the remembered repository — persist it when the
    // user browses so it seeds the field again next session.
    const trimmed = (repoUrl || "").trim();
    if (trimmed && trimmed !== configStore.pluginRepositoryUrl) {
      configStore.updateConfig({ pluginRepositoryUrl: trimmed });
    }
    await enumeratePluginsFromGitHub(repoUrl, branch);
  }
};

const handleInstall = async ({ path, repoUrl, branch, force }) => {
  const plugin = availablePlugins.value.find(p => p.path === path);
  const deps = plugin?.manifest?.dependencies?.packages ?? [];
  const doInstall = async () =>
    afterInstall(await installPluginFromGitHub(repoUrl, path, branch, force));
  if (deps.length > 0) {
    triggerPipWarning(deps, plugin?.name ?? path, doInstall);
    return;
  }
  await doInstall();
};

const handleForceUpdate = async ({ path, repoUrl, branch }) => {
  const plugin = availablePlugins.value.find(p => p.path === path);
  const deps = plugin?.manifest?.dependencies?.packages ?? [];
  const doInstall = async () =>
    afterInstall(await installPluginFromGitHub(repoUrl, path, branch, true));
  if (deps.length > 0) {
    triggerPipWarning(deps, plugin?.name ?? path, doInstall);
    return;
  }
  await doInstall();
};

// Update from an Installed card (§3.3): install the catalog's newer version of
// the same plugin, from the official catalog only.
const handleUpdate = async pluginId => {
  const entry = catalogPlugins.value.find(plugin => plugin.id === pluginId);
  if (!entry || !officialCatalog.value) return;
  updatingPlugin.value = pluginId;
  try {
    await handleInstall({
      path: entry.path,
      repoUrl: catalogRepo.value,
      branch: catalogBranch,
    });
  } finally {
    updatingPlugin.value = "";
  }
};

const handleInstallSelected = async ({ plugins: pluginsToInstall, repoUrl, branch }) => {
  const allDeps = [];
  const names = [];
  for (const { path, id } of pluginsToInstall) {
    const p = availablePlugins.value.find(ap => ap.id === id || ap.path === path);
    const deps = p?.manifest?.dependencies?.packages ?? [];
    if (deps.length > 0) {
      allDeps.push(...deps);
      names.push(p?.name ?? id);
    }
  }
  const doInstall = async () =>
    afterInstall(await installPluginsFromGitHub(pluginsToInstall, repoUrl, branch));
  if (allDeps.length > 0) {
    triggerPipWarning(allDeps, names.join(", "), doInstall);
    return;
  }
  await doInstall();
};

const handleInstallLocal = async ({ path, localPath, force }) => {
  const plugin = availablePlugins.value.find(p => p.path === path);
  const deps = plugin?.manifest?.dependencies?.packages ?? [];
  const doInstall = async () => afterInstall(await installPluginFromLocal(localPath, path, force));
  if (deps.length > 0) {
    triggerPipWarning(deps, plugin?.name ?? path, doInstall);
    return;
  }
  await doInstall();
};

const handleInstallSelectedLocal = async ({ plugins: pluginsToInstall, localPath }) => {
  const allDeps = [];
  const names = [];
  for (const { path, id } of pluginsToInstall) {
    const p = availablePlugins.value.find(ap => ap.id === id || ap.path === path);
    const deps = p?.manifest?.dependencies?.packages ?? [];
    if (deps.length > 0) allDeps.push(...deps);
    names.push(p?.name ?? id);
  }
  const doInstall = async () =>
    afterInstall(await installPluginsFromLocal(pluginsToInstall, localPath));
  if (allDeps.length > 0) {
    triggerPipWarning(allDeps, names.join(", "), doInstall);
    return;
  }
  await doInstall();
};

const handleToggleExpand = pluginId => {
  expandedPlugins.value[pluginId] = !expandedPlugins.value[pluginId];
  if (expandedPlugins.value[pluginId]) {
    // Load plugin config when expanding
    void loadPluginConfig(pluginId).catch(error => {
      console.error(`Failed to load config for plugin ${pluginId}:`, error);
    });
  }
};

const handleToggleEnabled = async (pluginId, enabled) => {
  const plugin = plugins.value.find(p => p.id === pluginId);
  const count = (pluginInstances.value[pluginId] || []).length;
  // Turning an add-on off hides every source it provides; say how many first.
  if (!enabled && plugin && count > 0) {
    pendingDisable.value = { pluginId, name: plugin.name };
    showDisableModal.value = true;
    return;
  }
  await togglePlugin(pluginId, enabled);
};

const showDisableModal = ref(false);
const pendingDisable = ref(null);
const disableMessage = computed(() => {
  const pending = pendingDisable.value;
  if (!pending) return "";
  const count = (pluginInstances.value[pending.pluginId] || []).length;
  return `Its ${count} source${count === 1 ? "" : "s"} stop${count === 1 ? "s" : ""} showing until you turn it back on.`;
});

const confirmDisable = async () => {
  const pending = pendingDisable.value;
  showDisableModal.value = false;
  pendingDisable.value = null;
  if (pending) await togglePlugin(pending.pluginId, false);
};

const cancelDisable = () => {
  showDisableModal.value = false;
  pendingDisable.value = null;
};

// Sources live in Content (§3.1): both "Used by n sources" and "Add a source"
// open that section with this provider's rows highlighted.
const CONTENT_SECTION_BY_KIND = {
  calendar: "content-calendars",
  image: "content-photos",
  service: "content-services",
  clock: "content-clock-bar",
};

const openSourcesFor = pluginId => {
  const plugin = plugins.value.find(p => p.id === pluginId);
  const section = CONTENT_SECTION_BY_KIND[pluginKindKey(plugin)] || "content-services";
  router.replace({ query: { setting: section, highlight: pluginId } });
};

const openAppearance = () => {
  router.replace({ query: { setting: "dashboard-ui" } });
};

const handleUninstall = (pluginId, pluginType) => {
  const plugin = plugins.value.find(p => p.id === pluginId);
  const pluginName = plugin?.name || pluginId;
  const count = (pluginInstances.value[pluginId] || []).length;
  uninstallMessage.value = count
    ? `Uninstall ${pluginName}? Its ${count} source${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} removed too.`
    : `Uninstall ${pluginName}?`;
  pendingUninstall.value = { pluginId, pluginType };
  showUninstallModal.value = true;
};

const confirmUninstall = async () => {
  const { pluginId, pluginType } = pendingUninstall.value;
  showUninstallModal.value = false;
  try {
    await uninstallPlugin(pluginId, pluginType);
    await loadPlugins();
  } catch (error) {
    console.error("Failed to uninstall plugin:", error);
  } finally {
    pendingUninstall.value = { pluginId: null, pluginType: null };
  }
};

const cancelUninstall = () => {
  showUninstallModal.value = false;
  pendingUninstall.value = { pluginId: null, pluginType: null };
};

const handleUpdateFormValue = (pluginId, key, value) => {
  updatePluginFormValue(pluginId, key, value);
};

const handleSaveConfig = async pluginId => {
  await savePluginConfig(pluginId);
};

const handleTestConnection = async pluginId => {
  await testPluginConnection(pluginId);
};

const handleFetchNow = async pluginId => {
  await fetchPluginNow(pluginId);
};

const handleCustomAction = async (_pluginId, _action) => {
  // Handle custom plugin actions
};

// Uninstall confirm modal state
const showUninstallModal = ref(false);
const pendingUninstall = ref({ pluginId: null, pluginType: null });
const uninstallMessage = ref("");

const handleUpload = async event => {
  uploading.value = true;
  uploadError.value = "";
  uploadSuccess.value = "";

  try {
    // Event is [filesArray, section] from PluginSections
    // where filesArray is an Array of File objects
    let filesArray;
    if (Array.isArray(event) && event.length === 2) {
      // Event format: [filesArray, section] from PluginSections
      filesArray = event[0]; // This is an Array of File objects
    } else if (Array.isArray(event)) {
      // Event is directly an array of files
      filesArray = event;
    } else if (event instanceof FileList) {
      // Event is a FileList (fallback)
      filesArray = Array.from(event);
    } else if (event instanceof File) {
      // Event is a single File
      filesArray = [event];
    } else {
      console.error("Invalid file input:", event);
      throw new Error("Invalid file input: expected array of files or File");
    }

    if (!Array.isArray(filesArray) || filesArray.length === 0) {
      throw new Error("No files selected");
    }

    // Verify all items are File objects
    if (!filesArray.every(f => f instanceof File)) {
      throw new Error("Invalid file objects in selection");
    }

    // Upload each file sequentially to avoid overwhelming the server
    for (const file of filesArray) {
      await imagesStore.uploadImage(file);
    }

    uploadSuccess.value = `Successfully uploaded ${filesArray.length} image${filesArray.length > 1 ? "s" : ""}`;
    setTimeout(() => {
      uploadSuccess.value = "";
    }, 5000);
  } catch (error) {
    console.error("Upload error:", error);
    uploadError.value = errorDetailMessage(error, "Failed to upload image");
    setTimeout(() => {
      uploadError.value = "";
    }, 10000);
  } finally {
    uploading.value = false;
  }
};

const handleDeleteImage = async imageId => {
  try {
    await imagesStore.deleteImage(imageId);
  } catch (error) {
    console.error("Failed to delete image:", error);
  }
};

// Helper functions
// Initialize
onMounted(async () => {
  await loadPlugins();
  await imagesStore.fetchImages();

  // Installed opens on All: the filters are plain kinds, and All shows the
  // whole add-on list.
  activePluginTab.value = "all";

  // Prefill the GitHub install field with the configured repo when empty.
  if (!githubRepoUrl.value && configStore.pluginRepositoryUrl) {
    githubRepoUrl.value = configStore.pluginRepositoryUrl;
  }

  // Show the official catalog straight away instead of behind "List plugins"
  // (§3.3). The catalog list is module state in usePlugins, so this runs once
  // per page load.
  if (officialCatalog.value && catalogPlugins.value.length === 0 && !catalogEnumerating.value) {
    void enumerateCatalogPlugins(catalogRepo.value, catalogBranch);
  }
});
</script>

<style scoped>
.plugins-category {
  width: 100%;
}

/* Pip warning modal — mirrors ConfirmModal layout */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--ink) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-1);
  border-radius: 8px;
  box-shadow: 0 4px 20px var(--shadow);
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid var(--line);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ink);
}

.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.modal-body p {
  margin: 0;
  color: var(--ink);
  line-height: 1.5;
  font-size: 0.9rem;
}

.pip-package-list {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.pip-package-list li {
  font-size: 0.875rem;
}

.pip-package-list code {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--ink);
}

.pip-warning-text {
  color: var(--warn) !important;
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
  border-radius: 4px;
  padding: 0.6rem 0.75rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.25rem;
  border-top: 1px solid var(--line);
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-height: var(--touch-target);
}

.btn-secondary:hover {
  border-color: var(--focus);
}

.btn-danger {
  padding: 0.5rem 1rem;
  background: var(--err);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  min-height: var(--touch-target);
}

.btn-danger:hover {
  background: color-mix(in srgb, var(--err), black 12%);
}

.btn-secondary:focus-visible,
.btn-danger:focus-visible,
.btn-close-modal:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
