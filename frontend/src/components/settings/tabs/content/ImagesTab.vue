<template>
  <div class="images-tab">
    <SourceList
      :rows="rows"
      drag
      add-label="Add photos from…"
      empty-text="No photo sources yet. Add photos from this device or another app."
      :highlight-id="savedHighlightId || highlightId"
      :highlight-provider="highlightProvider"
      remove-title="Remove photo source"
      :remove-message="row => `Remove ${row.name}? Its photos stop showing in the rotation.`"
      @add="addButton?.open()"
      @toggle="handleToggle"
      @edit="handleEdit"
      @remove="handleRemove"
      @order-change="handleInstanceOrderChange"
    />

    <AddSourceButton
      ref="addButton"
      kind="photos"
      upload
      @saved="handleSaved"
      @upload="openUpload"
    />

    <WhereItShows
      kind="photos"
      title="photos"
      :config="config"
      :sources="rows.map(row => ({ id: row.id, name: row.name }))"
    />

    <PhotoUpload ref="photoUpload" />

    <InstanceModal
      :show="showModal"
      :plugin="editingPlugin"
      :instance="editingInstance"
      @close="closeModal"
      @save="handleEditSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useImagesStore } from "@/stores/images";
import { usePlugins } from "@/composables";
import * as pluginsApi from "@/services/pluginsApi";
import SourceList from "@/components/settings/specialized/SourceList.vue";
import AddSourceButton from "@/components/settings/specialized/AddSourceButton.vue";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";
import PhotoUpload from "@/components/settings/tabs/content/PhotoUpload.vue";
import WhereItShows from "@/components/settings/specialized/WhereItShows.vue";
import { buildSourceRow } from "@/utils/instanceSummary";
import { logError } from "@/utils/logger";

// Every photo source in one list, in the order photos rotate (§3.1). Local
// uploads are a source like any other; the picker offers them first.
defineProps({
  config: {
    type: Object,
    default: () => ({}),
  },
  highlightId: {
    type: String,
    default: "",
  },
  highlightProvider: {
    type: String,
    default: "",
  },
});

const imagesStore = useImagesStore();
const { plugins, pluginInstances, loadingPlugins, loadPlugins, updateInstanceOrder } = usePlugins();

const addButton = ref(null);
const photoUpload = ref(null);
const showModal = ref(false);
const editingPlugin = ref(null);
const editingInstance = ref(null);
const savedHighlightId = ref("");

const imagePlugins = computed(() => {
  const filtered = plugins.value.filter(plugin => plugin.type === "image");
  return [...filtered].sort((a, b) => {
    const orderA = a.display_order ?? pluginInstances.value[a.id]?.[0]?.display_order ?? 0;
    const orderB = b.display_order ?? pluginInstances.value[b.id]?.[0]?.display_order ?? 0;
    return orderA - orderB;
  });
});

const rows = computed(() =>
  imagePlugins.value.flatMap(plugin => {
    const instances = [...(pluginInstances.value[plugin.id] || [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    return instances.map(instance => {
      const row = buildSourceRow(plugin, instance);
      // The built-in local source is where uploads land; say so instead of a
      // config value the user never chose.
      if (plugin.id === "local-images") {
        const count = imagesStore.images?.length ?? 0;
        row.summary = `Uploaded · ${count} ${count === 1 ? "photo" : "photos"}`;
      }
      return row;
    });
  })
);

const handleToggle = async (row, enabled) => {
  try {
    await pluginsApi.updatePluginInstance(row.id, {
      name: row.name,
      enabled,
      plugin_id: row.providerId,
      config: row.instance?.config || {},
    });
    await loadPlugins();
  } catch (error) {
    logError("[ImagesTab]", "Failed to toggle photo source:", error);
  }
};

const handleEdit = row => {
  editingPlugin.value = row.plugin;
  editingInstance.value = row.instance;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  editingPlugin.value = null;
  editingInstance.value = null;
};

const handleEditSaved = async () => {
  closeModal();
  await loadPlugins();
};

const handleRemove = async row => {
  try {
    await pluginsApi.deletePluginInstance(row.id);
    await Promise.all([loadPlugins(), imagesStore.fetchImages()]);
  } catch (error) {
    logError("[ImagesTab]", "Failed to remove photo source:", error);
  }
};

const openUpload = () => photoUpload.value?.openFilePicker();

const handleSaved = async payload => {
  savedHighlightId.value = payload?.instanceName
    ? (pluginInstances.value[payload.pluginId] || []).find(i => i.name === payload.instanceName)
        ?.id || payload.pluginId
    : payload?.pluginId || "";
  setTimeout(() => {
    savedHighlightId.value = "";
  }, 1500);
  await Promise.all([loadPlugins(), imagesStore.fetchImages()]);
};

const handleInstanceOrderChange = async newOrder => {
  const pluginId = newOrder[0]?.providerId;
  if (!pluginId) return;
  // Instance order is per plugin: only this provider's rows have a meaningful
  // position in the API, so a drag that spans providers reorders within each.
  const ordered = newOrder.filter(row => row.providerId === pluginId);
  try {
    await updateInstanceOrder(pluginId, ordered);
  } catch (error) {
    logError("[ImagesTab]", "Failed to reorder photo sources:", error);
  }
};

onMounted(async () => {
  if (plugins.value.length === 0 && !loadingPlugins.value) await loadPlugins();
  if (!imagesStore.images?.length) void imagesStore.fetchImages();
});
</script>
