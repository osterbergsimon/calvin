<template>
  <div class="clock-bar-sources">
    <SourceList
      :rows="rows"
      add-label="Add clock bar info"
      empty-text="No clock bar info yet. Add one to show it beside the clock."
      :highlight-id="savedHighlightId || highlightId"
      :highlight-provider="highlightProvider"
      remove-title="Remove clock bar info"
      :remove-message="row => `Remove ${row.name}? Its tile leaves the clock bar.`"
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
          <button type="button" class="cbs-link" @click="openClockBarItems">Clock bar items</button>
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
import { useRouter } from "vue-router";
import { usePlugins } from "@/composables";
import * as pluginsApi from "@/services/pluginsApi";
import SourceList from "@/components/settings/specialized/SourceList.vue";
import AddSourceButton from "@/components/settings/specialized/AddSourceButton.vue";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";
import { buildSourceRow } from "@/utils/instanceSummary";
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

const clockPlugins = computed(() =>
  plugins.value.filter(
    plugin => plugin.type === "service" && !!plugin.statusbar_schema && !plugin.display_schema
  )
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

const handleRemove = async row => {
  try {
    await pluginsApi.deletePluginInstance(row.id);
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

const openClockBarItems = () =>
  router.push({ path: "/settings", query: { setting: "clock-bar-items" } });

onMounted(async () => {
  if (plugins.value.length === 0 && !loadingPlugins.value) await loadPlugins();
});
</script>

<style scoped>
.clock-bar-sources {
  width: 100%;
}
.cbs-place {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--ink-2);
}
.cbs-link {
  padding: 0;
  background: transparent;
  color: var(--ink-2);
  border: 0;
  border-bottom: 1px dotted currentColor;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  cursor: pointer;
}
.cbs-link:hover {
  color: var(--ink);
}
.cbs-link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
