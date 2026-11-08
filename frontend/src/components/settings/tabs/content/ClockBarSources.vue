<template>
  <div class="clock-bar-sources">
    <SourceList
      :rows="rows"
      add-label="Add clock bar info"
      empty-text="No clock bar info yet. Add one to show it beside the clock."
      :highlight-id="savedHighlightId || highlightId"
      :highlight-provider="highlightProvider"
      remove-title="Remove clock bar info"
      :remove-message="removeMessage"
      @add="addButton?.open()"
      @toggle="handleToggle"
      @edit="handleEdit"
      @remove="handleRemove"
    >
      <template #meta="{ row }">
        <span class="cbs-place">
          <template v-if="row.inClockBar">In the clock bar</template>
          <template v-else>Hidden from the clock bar</template>
          ·
          <Button variant="link" class="cbs-link" @click="openClockBarEditor">
            Edit clock bar look…
          </Button>
        </span>
      </template>
    </SourceList>

    <AddSourceButton ref="addButton" kind="clock" @saved="handleSaved" />

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
import { useRoute, useRouter } from "vue-router";
import { usePlugins } from "@/composables";
import { useConfigStore } from "@/stores/config";
import * as pluginsApi from "@/services/pluginsApi";
import Button from "@/components/ui/Button.vue";
import SourceList from "@/components/settings/specialized/SourceList.vue";
import AddSourceButton from "@/components/settings/specialized/AddSourceButton.vue";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";
import { buildSourceRow } from "@/utils/instanceSummary";
import { hideTileInDesign, showTileInDesign } from "@/utils/clockBarDesign";
import { logError } from "@/utils/logger";

// Clock-bar-only sources (§3.1, §3.6): a service plugin that ships a tile and
// no page. Adding one switches its tile on, so it actually appears; the row
// says whether it is showing and links to the show/hide list.
defineProps({
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
const route = useRoute();
const configStore = useConfigStore();
const { plugins, pluginInstances, loadingPlugins, loadPlugins } = usePlugins();

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

// Every service plugin that declares a clock-bar tile, including those that also
// have a page (calvin-shsj): a source with both shows here and under Web pages &
// apps, one instance with one state.
const clockPlugins = computed(() =>
  plugins.value.filter(plugin => plugin.type === "service" && !!plugin.statusbar_schema)
);

const rows = computed(() =>
  clockPlugins.value.flatMap(plugin =>
    (pluginInstances.value[plugin.id] || []).map(instance => ({
      ...buildSourceRow(plugin, instance),
      inClockBar: isClockBarShown(instance),
    }))
  )
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
    logError("[ClockBarSources]", "Failed to toggle clock bar source:", error);
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

// A source that also has a page is listed here for its tile only: Remove takes
// the tile off the clock bar and leaves the instance, its page and any screen
// region using it alone. Deleting stays with clock-bar-only sources.
const hasPage = row => !!row.plugin?.display_schema;

const removeMessage = row =>
  hasPage(row)
    ? `Take ${row.name} off the clock bar? Its page stays under Web pages & apps.`
    : `Remove ${row.name}? Its tile leaves the clock bar.`;

const hideTile = async row => {
  await pluginsApi.updatePluginInstance(row.id, {
    name: row.name,
    enabled: row.instance?.enabled !== false,
    plugin_id: row.providerId,
    config: { ...(row.instance?.config || {}), show_in_statusbar: false },
  });
  // The design wins over show_in_statusbar once a tile is listed in it.
  if (configStore.clockBarDesign) {
    await configStore.updateConfig({
      clockBarDesign: hideTileInDesign(configStore.clockBarDesign, row.id),
    });
  }
};

const handleRemove = async row => {
  try {
    if (hasPage(row)) await hideTile(row);
    else await pluginsApi.deletePluginInstance(row.id);
    await loadPlugins();
  } catch (error) {
    logError("[ClockBarSources]", "Failed to remove clock bar source:", error);
  }
};

const handleSaved = async payload => {
  const instance = (pluginInstances.value[payload?.pluginId] || []).find(
    item => item.name === payload?.instanceName
  );
  if (instance) {
    try {
      // Adding clock bar info means showing it: a tile that stays hidden would
      // make the add look like it did nothing.
      await pluginsApi.updatePluginInstance(instance.id, {
        name: instance.name,
        enabled: instance.enabled !== false,
        plugin_id: payload.pluginId,
        config: { ...(instance.config || {}), show_in_statusbar: true },
      });
      // The design wins over show_in_statusbar once a tile is listed in it, so
      // remove it from the Not shown shelf too (§7.2).
      if (configStore.clockBarDesign) {
        await configStore.updateConfig({
          clockBarDesign: showTileInDesign(configStore.clockBarDesign, instance.id),
        });
      }
    } catch (error) {
      logError("[ClockBarSources]", "Failed to switch the new tile on:", error);
    }
    savedHighlightId.value = instance.id;
    setTimeout(() => {
      savedHighlightId.value = "";
    }, 1500);
  }
  await loadPlugins();
};

const openClockBarEditor = () =>
  router.push({ path: "/settings", query: { setting: "clock-bar", edit: "clock-bar" } });

onMounted(async () => {
  if (plugins.value.length === 0 && !loadingPlugins.value) await loadPlugins();
  // Dashboard › Clock bar items' empty state links here to add the first tile
  // (§3.5), so arrival with add=clock opens the provider picker for that kind.
  if (route?.query?.add === "clock") addButton.value?.open();
});
</script>
