<template>
  <div class="plugins-category">
    <!-- Plugin Installation Section -->
    <SettingsSection id="plugins-install" title="Install">
      <SettingRow
        label="Plugin repository URL"
        description="Default GitHub repository the install browser points at."
      >
        <input
          type="url"
          class="repo-url-input"
          :value="configStore.pluginRepositoryUrl"
          @change="onRepoUrlChange"
          placeholder="https://github.com/owner/repo"
        />
      </SettingRow>
      <PluginInstaller
        :repo-url="githubRepoUrl"
        :branch="githubBranch"
        :enumerating="enumeratingPlugins"
        :installing="installingPlugin"
        :available-plugins="availablePlugins"
        :error="pluginInstallError"
        :success="pluginInstallSuccess"
        :requires-restart="pluginRequiresRestart"
        :branch-switched="pluginBranchSwitched"
        :actual-branch="pluginActualBranch"
        :dev-mode="configStore.devMode"
        @update:repoUrl="githubRepoUrl = $event"
        @update:branch="githubBranch = $event"
        @zip-select="handleZipSelect"
        @list-plugins="handleListPlugins"
        @install="handleInstall"
        @install-selected="handleInstallSelected"
        @install-local="handleInstallLocal"
        @install-selected-local="handleInstallSelectedLocal"
        @force-update="handleForceUpdate"
        @restart="handleRestart"
      />
    </SettingsSection>

    <!-- Plugin Management -->
    <SettingsSection id="plugins-installed" title="Installed Plugins">
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
        @tab-change="activePluginTab = $event"
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
    </SettingsSection>

    <!-- Instance Modal -->
    <InstanceModal
      :show="showInstanceModal"
      :plugin="currentPlugin"
      :instance="editingInstance"
      @close="handleCloseInstanceModal"
      @save="handleInstanceModalSave"
    />

    <!-- Uninstall Confirm Modal -->
    <ConfirmModal
      :show="showUninstallModal"
      title="Uninstall Plugin"
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
          <button class="btn-close-modal" @click="cancelPipInstall">×</button>
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
import { ref, computed, onMounted } from "vue";
import { usePlugins } from "@/composables";
import { useSystem } from "@/composables";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";
import * as pluginsApi from "@/services/pluginsApi";
import * as calendarApi from "@/services/calendarApi";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import PluginInstaller from "../specialized/PluginInstaller.vue";
import PluginManager from "../specialized/PluginManager.vue";
import InstanceModal from "../specialized/InstanceModal.vue";
import ConfirmModal from "../shared/ConfirmModal.vue";

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
  pluginInstallError,
  pluginInstallSuccess,
  pluginRequiresRestart,
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

const { restartBackend } = useSystem();
const configStore = useConfigStore();
const imagesStore = useImagesStore();

// Plugin repository URL change handler (persists via the existing store action)
const onRepoUrlChange = event => {
  const value = event.target.value.trim();
  configStore.updateConfig({ pluginRepositoryUrl: value });
};

// Local state
const activePluginTab = ref("calendar");
const uploading = ref(false);
const uploadError = ref("");
const uploadSuccess = ref("");

// Computed for images
const imagesList = computed(() => imagesStore.images);

// Computed
const hasInstalledThemes = computed(() => {
  return plugins.value.some(p => p.type === "theme" && p._installed);
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

// Handlers
const handleZipSelect = async file => {
  try {
    const result = await pluginsApi.inspectPluginZip(file);
    const deps = result.manifest?.dependencies?.packages ?? [];
    if (deps.length > 0) {
      triggerPipWarning(deps, result.manifest?.name ?? file.name, () => installPluginFromZip(file));
      return;
    }
  } catch {
    // Inspection failed — let the install endpoint surface the real error
  }
  await installPluginFromZip(file);
};

const handleListPlugins = async ({ repoUrl, branch, source, localPath }) => {
  if (source === "local") {
    await enumeratePluginsFromLocal(localPath);
  } else {
    await enumeratePluginsFromGitHub(repoUrl, branch);
  }
};

const handleInstall = async ({ path, repoUrl, branch, force }) => {
  const plugin = availablePlugins.value.find(p => p.path === path);
  const deps = plugin?.manifest?.dependencies?.packages ?? [];
  const doInstall = () => installPluginFromGitHub(repoUrl, path, branch, force);
  if (deps.length > 0) {
    triggerPipWarning(deps, plugin?.name ?? path, doInstall);
    return;
  }
  await doInstall();
};

const handleForceUpdate = async ({ path, repoUrl, branch }) => {
  const plugin = availablePlugins.value.find(p => p.path === path);
  const deps = plugin?.manifest?.dependencies?.packages ?? [];
  const doInstall = () => installPluginFromGitHub(repoUrl, path, branch, true);
  if (deps.length > 0) {
    triggerPipWarning(deps, plugin?.name ?? path, doInstall);
    return;
  }
  await doInstall();
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
  const doInstall = () => installPluginsFromGitHub(pluginsToInstall, repoUrl, branch);
  if (allDeps.length > 0) {
    triggerPipWarning(allDeps, names.join(", "), doInstall);
    return;
  }
  await doInstall();
};

const handleInstallLocal = async ({ path, localPath, force }) => {
  const plugin = availablePlugins.value.find(p => p.path === path);
  const deps = plugin?.manifest?.dependencies?.packages ?? [];
  const doInstall = () => installPluginFromLocal(localPath, path, force);
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
  const doInstall = () => installPluginsFromLocal(pluginsToInstall, localPath);
  if (allDeps.length > 0) {
    triggerPipWarning(allDeps, names.join(", "), doInstall);
    return;
  }
  await doInstall();
};

const handleRestart = async () => {
  await restartBackend();
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
  await togglePlugin(pluginId, enabled);
};

const handleUninstall = (pluginId, pluginType) => {
  const plugin = plugins.value.find(p => p.id === pluginId);
  const pluginName = plugin?.name || pluginId;
  uninstallMessage.value = `Are you sure you want to uninstall "${pluginName}"? This action cannot be undone.`;
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

// Instance modal state
const showInstanceModal = ref(false);
const currentPlugin = ref(null);
const editingInstance = ref(null);

// Uninstall confirm modal state
const showUninstallModal = ref(false);
const pendingUninstall = ref({ pluginId: null, pluginType: null });
const uninstallMessage = ref("");

const handleAddInstance = pluginId => {
  const plugin = plugins.value.find(p => p.id === pluginId);
  if (!plugin) return;

  currentPlugin.value = plugin;
  editingInstance.value = null;
  showInstanceModal.value = true;
};

const handleEditInstance = (pluginId, instance) => {
  const plugin = plugins.value.find(p => p.id === pluginId);
  if (!plugin) return;

  currentPlugin.value = plugin;
  editingInstance.value = instance;
  showInstanceModal.value = true;
};

const handleCloseInstanceModal = () => {
  showInstanceModal.value = false;
  currentPlugin.value = null;
  editingInstance.value = null;
};

const handleInstanceModalSave = async calendarData => {
  await loadPlugins();

  // If a new calendar instance was created, create the calendar source
  if (calendarData?.isCalendar && currentPlugin.value) {
    try {
      const pluginTypeId = currentPlugin.value.id;

      // Wait a bit for plugins to fully reload
      await new Promise(resolve => setTimeout(resolve, 500));

      // Find the instance that was just created by name
      const instances = pluginInstances.value[pluginTypeId] || [];
      const newInstance = instances.find(inst => inst.name === calendarData.instanceName);

      if (newInstance) {
        // Create calendar source with the instance ID
        await calendarApi.addCalendarSource({
          id: newInstance.id,
          type: pluginTypeId,
          name: calendarData.instanceName,
          ical_url: calendarData.calendarConfig.ical_url,
          enabled: newInstance.enabled,
          color: calendarData.calendarConfig.color,
          show_time: calendarData.calendarConfig.show_time,
        });
      }
    } catch (error) {
      console.error("Failed to create calendar source:", error);
      // Don't show error to user - the instance was created successfully
    }
  }
};

const handleDeleteInstance = async instanceId => {
  try {
    await pluginsApi.deletePluginInstance(instanceId);
    await loadPlugins();
  } catch (error) {
    console.error("Failed to delete instance:", error);
  }
};

const handleToggleInstance = async (instanceId, enabled) => {
  try {
    await pluginsApi.updatePluginInstance(instanceId, { enabled });
    await loadPlugins();
  } catch (error) {
    console.error("Failed to toggle instance:", error);
  }
};

const handleInstanceOrderChange = async (pluginId, newOrder) => {
  try {
    // Convert array of instances to order map { instanceId: order }
    const instanceOrders = {};
    newOrder.forEach((instance, index) => {
      instanceOrders[instance.id] = index;
    });
    await pluginsApi.updatePluginInstanceOrder(pluginId, instanceOrders);
    await loadPlugins();
  } catch (error) {
    console.error("Failed to update instance order:", error);
  }
};

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
    uploadError.value = error.response?.data?.detail || error.message || "Failed to upload image";
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

  // Set initial active tab
  if (plugins.value.length > 0) {
    const types = ["calendar", "image", "service", "backend", "theme"];
    const firstType = types.find(type => plugins.value.some(p => p.type === type));
    if (firstType) {
      activePluginTab.value = firstType;
    }
  }

  // Prefill the GitHub install field with the configured repo when empty.
  if (!githubRepoUrl.value && configStore.pluginRepositoryUrl) {
    githubRepoUrl.value = configStore.pluginRepositoryUrl;
  }
});
</script>

<style scoped>
.plugins-category {
  width: 100%;
}

.repo-url-input {
  min-height: 44px;
  width: 320px;
  max-width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-family: var(--font-ui);
  font-size: 0.95rem;
}
.repo-url-input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-color: var(--focus);
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

.btn-close-modal {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--ink-2);
  cursor: pointer;
  padding: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.btn-close-modal:hover {
  background: var(--bg-2);
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
  min-height: 44px;
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
  min-height: 44px;
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
