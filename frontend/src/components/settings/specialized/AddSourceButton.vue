<template>
  <ProviderPicker
    :show="showPicker"
    :title="config.title"
    :providers="providers"
    :catalog-providers="catalogProviders"
    :more-label="moreLabel"
    @select="choose"
    @install="requestInstall"
    @more="goToPlugins"
    @close="showPicker = false"
  />

  <InstanceModal
    :show="showModal"
    :plugin="selectedPlugin"
    :instance="null"
    @close="closeModal"
    @save="handleSaved"
  />

  <ConfirmModal
    :show="showInstallConfirm"
    :title="installConfirmTitle"
    :message="installConfirmMessage"
    confirm-text="Install"
    @confirm="confirmInstall"
    @cancel="cancelInstall"
  />
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePlugins } from "@/composables";
import { useConfigStore } from "@/stores/config";
import { mdiUpload } from "@mdi/js";
import InstanceModal from "./InstanceModal.vue";
import ProviderPicker from "./ProviderPicker.vue";
import ConfirmModal from "../shared/ConfirmModal.vue";
import { pickerCatalogRepo, isCatalogEntry, isTestPlugin } from "@/utils/pluginCatalog";

// The single "Add …" entry point for every Content section (§3.2). It picks a
// provider by what the user wants to see ("photos from…") instead of by plugin
// type, then opens that provider's own add form. There is deliberately no
// button of its own: the section's SourceList renders the Add control and
// calls `open()`.
//
// It also bridges discovery (§3.7): when the official catalog is reachable, a
// "From the Calvin catalog" group offers its plugins of this kind that are not
// installed. Install asks once, shows Installing…, then continues straight into
// the new plugin's add form. Only the official catalog is ever offered here —
// other repositories and local paths stay in Plugins (see utils/pluginCatalog).
const props = defineProps({
  kind: {
    type: String,
    required: true,
    validator: value => ["calendar", "photos", "services", "clock"].includes(value),
  },
  // Photos offers "Upload from this device" before the provider list.
  upload: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["saved", "upload"]);

const router = useRouter();
const configStore = useConfigStore();
const {
  plugins,
  loadPlugins,
  togglePlugin,
  catalogPlugins,
  enumerateCatalogPlugins,
  installPluginFromGitHub,
  pluginInstallError,
} = usePlugins();

const KIND_CONFIG = {
  calendar: { title: "Add a calendar", type: "calendar" },
  photos: { title: "Add photos from…", type: "image" },
  services: { title: "Add a web page or app", type: "service" },
  clock: { title: "Add clock bar info", type: "service" },
};

const config = computed(() => KIND_CONFIG[props.kind]);

const showPicker = ref(false);
const showModal = ref(false);
const selectedPlugin = ref(null);

const isIframe = plugin => plugin.display_schema?.kind === "iframe";

const matchesKind = plugin => {
  if (props.kind === "calendar") return plugin.type === "calendar";
  if (props.kind === "photos") return plugin.type === "image";
  if (props.kind === "services") return plugin.type === "service" && !!plugin.display_schema;
  // Clock-bar-only services have a tile and no page of their own (§3.1).
  return plugin.type === "service" && !!plugin.statusbar_schema && !plugin.display_schema;
};

const pluginProviders = computed(() =>
  plugins.value
    .filter(matchesKind)
    .sort((a, b) => Number(isIframe(b)) - Number(isIframe(a)))
    .map(plugin => ({
      id: plugin.id,
      plugin,
      label: props.kind === "services" && isIframe(plugin) ? "Web page (any address)" : plugin.name,
      description: plugin.description,
      icon: plugin.icon || "",
      disabled: !plugin.enabled,
    }))
);

const wantsUpload = computed(() => props.upload || props.kind === "photos");

const providers = computed(() => {
  const list = [];
  if (wantsUpload.value) {
    list.push({
      id: "__upload",
      action: "upload",
      label: "Upload from this device",
      description: "JPG, PNG, WebP or GIF into Local photos",
      // Not a plugin: a real upload glyph beats the "U" letter fallback.
      svg: mdiUpload,
    });
  }
  return [...list, ...pluginProviders.value];
});

// --- From the Calvin catalog (§3.7) -----------------------------------------

const catalogRepo = computed(() => pickerCatalogRepo(configStore.pluginCatalogRepo));
const catalogItems = ref([]);
const catalogLoaded = ref(false);
const catalogLoading = ref(false);
// id -> { status: "installing" | "installed" | "error", error }
const catalogProgress = ref({});

// Catalog rows carry only the manifest's `type`; the installed plugins list
// supplies the display/statusbar detail the picker uses for installed tiles.
const catalogMatchesKind = item => {
  if (props.kind === "calendar") return item.type === "calendar";
  if (props.kind === "photos") return item.type === "image";
  return item.type === "service";
};

const installedIds = computed(() => new Set(plugins.value.map(plugin => plugin.id)));

const catalogProviders = computed(() =>
  catalogItems.value
    .filter(item => isCatalogEntry(item))
    .filter(item => configStore.devMode || !isTestPlugin(item))
    .filter(
      item => catalogMatchesKind(item) && !item._installed && !installedIds.value.has(item.id)
    )
    .map(item => {
      const progress = catalogProgress.value[item.id] || {};
      return {
        id: item.id,
        path: item.path,
        label: item.name || item.id,
        description: item.description || "",
        icon: item.icon || "",
        status: progress.status || "idle",
        error: progress.error || "",
      };
    })
);

const ensureCatalog = async () => {
  if (catalogLoaded.value || catalogLoading.value) return;
  const repo = catalogRepo.value;
  // No catalog (or a configured non-official one) means no group: the footer's
  // "Get more in Plugins ›" stays the only way to browse other repositories.
  if (!repo || typeof enumerateCatalogPlugins !== "function") {
    catalogLoaded.value = true;
    return;
  }
  catalogLoading.value = true;
  try {
    // Enumerated into usePlugins' catalog list, so the Plugins section gets the
    // same result without a second GitHub round-trip.
    await enumerateCatalogPlugins(repo, "main");
    // An unreachable catalog leaves the list empty: the group is absent.
    catalogItems.value = (catalogPlugins?.value || []).filter(item => !item._installed);
  } catch {
    catalogItems.value = [];
  } finally {
    catalogLoading.value = false;
    catalogLoaded.value = true;
  }
};

const showInstallConfirm = ref(false);
const pendingInstall = ref(null);

const installConfirmTitle = computed(() =>
  pendingInstall.value ? `Install ${pendingInstall.value.label}?` : "Install add-on?"
);
const installConfirmMessage = computed(() =>
  pendingInstall.value
    ? `Install ${pendingInstall.value.label}? It adds an add-on to your Calvin server. You can remove it in Plugins.`
    : ""
);

const requestInstall = provider => {
  pendingInstall.value = provider;
  showInstallConfirm.value = true;
};

const cancelInstall = () => {
  showInstallConfirm.value = false;
  pendingInstall.value = null;
};

const confirmInstall = async () => {
  const provider = pendingInstall.value;
  showInstallConfirm.value = false;
  pendingInstall.value = null;
  if (!provider) return;

  const repo = catalogRepo.value;
  if (!repo || typeof installPluginFromGitHub !== "function") {
    catalogProgress.value = {
      ...catalogProgress.value,
      [provider.id]: { status: "error", error: "This add-on is not in the official catalog." },
    };
    return;
  }

  catalogProgress.value = {
    ...catalogProgress.value,
    [provider.id]: { status: "installing", error: "" },
  };

  const installedIdsResult = await installPluginFromGitHub(repo, provider.path, "main");
  if (!installedIdsResult || installedIdsResult.length === 0) {
    catalogProgress.value = {
      ...catalogProgress.value,
      [provider.id]: {
        status: "error",
        error: pluginInstallError?.value || `Could not install ${provider.label}.`,
      },
    };
    return;
  }

  catalogProgress.value = {
    ...catalogProgress.value,
    [provider.id]: { status: "installed", error: "" },
  };

  let plugin = plugins.value.find(item => item.id === provider.id);
  if (!plugin) {
    await loadPlugins();
    plugin = plugins.value.find(item => item.id === provider.id);
  }
  if (!plugin) {
    catalogProgress.value = {
      ...catalogProgress.value,
      [provider.id]: {
        status: "error",
        error: `${provider.label} installed, but Calvin could not load it yet.`,
      },
    };
    return;
  }

  showPicker.value = false;
  openProvider({ id: plugin.id, plugin });
};

// --- picker / modal --------------------------------------------------------

const moreLabel = "Get more in Plugins ›";

const open = () => {
  // Exactly one candidate (and Photos' upload choice is a second one) opens
  // that provider's form straight away; otherwise the user picks first.
  const single = pluginProviders.value.length === 1 ? pluginProviders.value[0] : null;
  if (!wantsUpload.value && single && !single.disabled) {
    openProvider(single);
    return;
  }
  showPicker.value = true;
  // The catalog is fetched on open, not on mount, so a section nobody adds to
  // never pays for a GitHub round-trip.
  void ensureCatalog();
};

const choose = async provider => {
  if (provider.action === "upload") {
    showPicker.value = false;
    emit("upload");
    return;
  }
  if (provider.disabled) {
    await togglePlugin(provider.id, true);
    showPicker.value = false;
    openProvider({ ...provider, disabled: false });
    return;
  }
  showPicker.value = false;
  openProvider(provider);
};

const openProvider = provider => {
  selectedPlugin.value = provider.plugin;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  selectedPlugin.value = null;
};

const handleSaved = async saveData => {
  const plugin = selectedPlugin.value;
  closeModal();
  await loadPlugins();
  emit("saved", {
    pluginId: plugin?.id || "",
    plugin,
    saveData: saveData || null,
    instanceName: saveData?.instanceName || "",
  });
};

const goToPlugins = () => {
  showPicker.value = false;
  router.push({
    path: "/settings",
    query: { setting: "plugins-install", pluginKind: config.value.type },
  });
};

onMounted(async () => {
  if (plugins.value.length === 0) await loadPlugins();
});

defineExpose({ open });
</script>
