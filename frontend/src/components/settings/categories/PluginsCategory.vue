<template>
  <div class="plugins-category">
    <!-- Plugin Installation Section -->
    <CollapsibleSection title="Install New Plugin" icon="📦" :expanded="true">
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
        @update:repoUrl="githubRepoUrl = $event"
        @update:branch="githubBranch = $event"
        @zip-select="handleZipSelect"
        @list-plugins="handleListPlugins"
        @install="handleInstall"
        @install-selected="handleInstallSelected"
        @restart="handleRestart"
      />
    </CollapsibleSection>

    <!-- Plugin Management -->
    <CollapsibleSection title="Installed Plugins" icon="🔌" :expanded="true">
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
    </CollapsibleSection>

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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { usePlugins } from "@/composables";
import { useSystem } from "@/composables";
import { useImagesStore } from "@/stores/images";
import * as pluginsApi from "@/services/pluginsApi";
import * as calendarApi from "@/services/calendarApi";
import CollapsibleSection from "../shared/CollapsibleSection.vue";
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
  loadPlugins,
  installPluginFromZip,
  enumeratePluginsFromGitHub,
  installPluginFromGitHub,
  installPluginsFromGitHub,
  uninstallPlugin,
  togglePlugin,
} = usePlugins();

const { restartBackend } = useSystem();
const imagesStore = useImagesStore();

// Local state
const activePluginTab = ref("calendar");
const expandedPlugins = ref({});
const pluginFormData = ref({});
const savingPlugin = ref(null);
const testingPlugin = ref({});
const fetchingPlugin = ref({});
const pluginSaveStatus = ref({});
const pluginTestStatus = ref({});
const pluginFetchStatus = ref({});
const uploading = ref(false);
const uploadError = ref("");
const uploadSuccess = ref("");

// Computed for images
const imagesList = computed(() => imagesStore.images);

// Computed
const hasInstalledThemes = computed(() => {
  return plugins.value.some((p) => p.type === "theme" && p._installed);
});

// Handlers
const handleZipSelect = async (file) => {
  await installPluginFromZip(file);
};

const handleListPlugins = async ({ repoUrl, branch }) => {
  await enumeratePluginsFromGitHub(repoUrl, branch);
};

const handleInstall = async ({ path, repoUrl, branch }) => {
  await installPluginFromGitHub(repoUrl, path, branch);
};

const handleInstallSelected = async ({ plugins, repoUrl, branch }) => {
  await installPluginsFromGitHub(plugins, repoUrl, branch);
};

const handleRestart = async () => {
  await restartBackend();
};

const handleToggleExpand = (pluginId) => {
  expandedPlugins.value[pluginId] = !expandedPlugins.value[pluginId];
  if (expandedPlugins.value[pluginId]) {
    // Load plugin config when expanding
    loadPluginConfig(pluginId);
  }
};

const handleToggleEnabled = async (pluginId, enabled) => {
  await togglePlugin(pluginId, enabled);
};

const handleUninstall = (pluginId, pluginType) => {
  const plugin = plugins.value.find((p) => p.id === pluginId);
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
  if (!pluginFormData.value[pluginId]) {
    pluginFormData.value[pluginId] = {};
  }
  pluginFormData.value[pluginId][key] = value;
};

const handleSaveConfig = async (pluginId) => {
  savingPlugin.value = pluginId;
  pluginSaveStatus.value[pluginId] = null;

  try {
    const config = pluginFormData.value[pluginId] || {};
    await pluginsApi.updatePlugin(pluginId, { config });
    pluginSaveStatus.value[pluginId] = {
      success: true,
      message: "Configuration saved successfully",
    };
    setTimeout(() => {
      pluginSaveStatus.value[pluginId] = null;
    }, 5000);
  } catch (error) {
    pluginSaveStatus.value[pluginId] = {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        "Failed to save configuration",
    };
  } finally {
    savingPlugin.value = null;
  }
};

const handleTestConnection = async (pluginId) => {
  testingPlugin.value[pluginId] = true;
  pluginTestStatus.value[pluginId] = null;

  try {
    const response = await pluginsApi.testPlugin(pluginId);
    pluginTestStatus.value[pluginId] = {
      success: response.success || false,
      message: response.message || "Test completed",
    };
  } catch (error) {
    pluginTestStatus.value[pluginId] = {
      success: false,
      message: error.response?.data?.detail || error.message || "Test failed",
    };
  } finally {
    testingPlugin.value[pluginId] = false;
  }
};

const handleFetchNow = async (pluginId) => {
  fetchingPlugin.value[pluginId] = true;
  pluginFetchStatus.value[pluginId] = null;

  try {
    await pluginsApi.fetchPlugin(pluginId);
    pluginFetchStatus.value[pluginId] = {
      success: true,
      message: "Fetch initiated successfully",
    };
  } catch (error) {
    pluginFetchStatus.value[pluginId] = {
      success: false,
      message:
        error.response?.data?.detail ||
        error.message ||
        "Failed to initiate fetch",
    };
  } finally {
    fetchingPlugin.value[pluginId] = false;
  }
};

const handleCustomAction = async (_pluginId, _action) => {
  // Handle custom plugin actions
  // TODO: Implement custom plugin actions if needed
};

// Instance modal state
const showInstanceModal = ref(false);
const currentPlugin = ref(null);
const editingInstance = ref(null);

// Uninstall confirm modal state
const showUninstallModal = ref(false);
const pendingUninstall = ref({ pluginId: null, pluginType: null });
const uninstallMessage = ref("");

const handleAddInstance = (pluginId) => {
  const plugin = plugins.value.find((p) => p.id === pluginId);
  if (!plugin) return;

  currentPlugin.value = plugin;
  editingInstance.value = null;
  showInstanceModal.value = true;
};

const handleEditInstance = (pluginId, instance) => {
  const plugin = plugins.value.find((p) => p.id === pluginId);
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

const handleInstanceModalSave = async (calendarData) => {
  await loadPlugins();

  // If a new calendar instance was created, create the calendar source
  if (calendarData?.isCalendar && currentPlugin.value) {
    try {
      const pluginTypeId = currentPlugin.value.id;

      // Wait a bit for plugins to fully reload
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Find the instance that was just created by name
      const instances = pluginInstances.value[pluginTypeId] || [];
      const newInstance = instances.find(
        (inst) => inst.name === calendarData.instanceName,
      );

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

const handleDeleteInstance = async (instanceId) => {
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

const handleUpload = async (event) => {
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
    if (!filesArray.every((f) => f instanceof File)) {
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
    uploadError.value =
      error.response?.data?.detail || error.message || "Failed to upload image";
    setTimeout(() => {
      uploadError.value = "";
    }, 10000);
  } finally {
    uploading.value = false;
  }
};

const handleDeleteImage = async (imageId) => {
  try {
    await imagesStore.deleteImage(imageId);
  } catch (error) {
    console.error("Failed to delete image:", error);
  }
};

// Helper functions
const loadPluginConfig = async (pluginId) => {
  try {
    const response = await pluginsApi.getPluginConfig(pluginId);
    pluginFormData.value[pluginId] = response.config || {};
  } catch (error) {
    console.error(`Failed to load config for plugin ${pluginId}:`, error);
  }
};

// Initialize
onMounted(async () => {
  await loadPlugins();
  await imagesStore.fetchImages();

  // Set initial active tab
  if (plugins.value.length > 0) {
    const types = ["calendar", "image", "service", "backend", "theme"];
    const firstType = types.find((type) =>
      plugins.value.some((p) => p.type === type),
    );
    if (firstType) {
      activePluginTab.value = firstType;
    }
  }
});
</script>

<style scoped>
.plugins-category {
  width: 100%;
}
</style>
