<template>
  <div class="services-tab">
    <SourceList
      :rows="rows"
      drag
      add-label="Add a web page or app"
      empty-text="No web pages or apps yet. Add one to show it in a page region."
      :empty-icon="mdiWeb"
      :highlight-id="savedHighlightId || highlightId"
      :highlight-provider="highlightProvider"
      remove-title="Remove web page or app"
      :remove-message="removeMessage"
      @add="addButton?.open()"
      @toggle="handleToggle"
      @edit="handleEdit"
      @remove="handleRemove"
      @order-change="handleInstanceOrderChange"
    >
      <template #meta="{ row }">
        <span class="svc-place">
          <template v-if="row.pages.length">
            On
            <Button variant="link" class="svc-link" @click="openPage(row.pages[0].id)">
              {{ pageNamesLabel(row.pages) }}
            </Button>
          </template>
          <template v-else>
            <span class="svc-unplaced">Not on any page yet</span>
            <Button
              :variant="row.id === savedHighlightId ? 'primary' : 'link'"
              :size="row.id === savedHighlightId ? 'sm' : 'md'"
              class="svc-link"
              @click="placeOnPage(row)"
            >
              Put it on a page
            </Button>
          </template>
          <template v-if="row.inClockBar"> · in the clock bar</template>
        </span>
      </template>
    </SourceList>

    <AddSourceButton ref="addButton" kind="services" @saved="handleSaved" />

    <WhereItShows
      kind="service"
      title="web pages & apps"
      :config="config"
      :sources="rows.map(row => ({ id: row.id, name: row.name }))"
    />

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
import { mdiWeb } from "@mdi/js";
import { useRouter } from "vue-router";
import { usePlugins } from "@/composables";
import { usePlacementRequest } from "@/composables/usePlacementRequest";
import * as pluginsApi from "@/services/pluginsApi";
import Button from "@/components/ui/Button.vue";
import SourceList from "@/components/settings/specialized/SourceList.vue";
import AddSourceButton from "@/components/settings/specialized/AddSourceButton.vue";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";
import WhereItShows from "@/components/settings/specialized/WhereItShows.vue";
import { buildSourceRow } from "@/utils/instanceSummary";
import { pageNamesLabel, pagesUsingService } from "@/utils/placement";
import { logError } from "@/utils/logger";

// Service sources are placed, not merged (§3.6): every row says which pages it
// shows on, or offers to put it on one. A plugin with a clock-bar tile as well
// says so on the same line.
const props = defineProps({
  config: {
    type: Object,
    required: true,
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

const router = useRouter();
const { requestPlacement } = usePlacementRequest();
const { plugins, pluginInstances, loadingPlugins, loadPlugins, updateInstanceOrder } = usePlugins();

const addButton = ref(null);
const showModal = ref(false);
const editingPlugin = ref(null);
const editingInstance = ref(null);
const savedHighlightId = ref("");

const isClockBarShown = instance => {
  const value = instance?.config?.show_in_statusbar;
  if (value === undefined) return true;
  if (typeof value === "string")
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  return value === true || value === 1;
};

const servicePlugins = computed(() =>
  plugins.value.filter(plugin => plugin.type === "service" && !!plugin.display_schema)
);

const rows = computed(() =>
  servicePlugins.value.flatMap(plugin => {
    const instances = [...(pluginInstances.value[plugin.id] || [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
    return instances.map(instance => {
      const row = buildSourceRow(plugin, instance);
      return {
        ...row,
        pages: pagesUsingService(props.config, instance.id),
        inClockBar: !!plugin.statusbar_schema && isClockBarShown(instance),
      };
    });
  })
);

const removeMessage = row => {
  const names = pageNamesLabel(row.pages);
  if (!names) return `Remove ${row.name}?`;
  return `Remove ${row.name}? It's on ${names}; ${row.pages.length === 1 ? "that region becomes" : "those regions become"} empty.`;
};

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
    logError("[ServicesTab]", "Failed to toggle web page or app:", error);
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
    await loadPlugins();
  } catch (error) {
    logError("[ServicesTab]", "Failed to remove web page or app:", error);
  }
};

const handleSaved = async payload => {
  const instance = (pluginInstances.value[payload?.pluginId] || []).find(
    item => item.name === payload?.instanceName
  );
  savedHighlightId.value = instance?.id || payload?.pluginId || "";
  setTimeout(() => {
    savedHighlightId.value = "";
  }, 1500);
  await loadPlugins();
};

const handleInstanceOrderChange = async newOrder => {
  const pluginId = newOrder[0]?.providerId;
  if (!pluginId) return;
  const ordered = newOrder.filter(row => row.providerId === pluginId);
  try {
    await updateInstanceOrder(pluginId, ordered);
  } catch (error) {
    logError("[ServicesTab]", "Failed to reorder web pages or apps:", error);
  }
};

const goTo = query => router.push({ path: "/settings", query });

const openPage = pageId => goTo({ setting: "dashboard-regions", page: pageId });

// Place mode: Pages & regions opens on the active page and asks for a region.
const placeOnPage = row => {
  requestPlacement({ serviceId: row.id, name: row.name });
  goTo({ setting: "dashboard-regions" });
};

onMounted(async () => {
  if (plugins.value.length === 0 && !loadingPlugins.value) await loadPlugins();
});
</script>
