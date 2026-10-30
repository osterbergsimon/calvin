<template>
  <ProviderPicker
    :show="showPicker"
    :title="config.title"
    :providers="providers"
    :more-label="moreLabel"
    @select="choose"
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
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePlugins } from "@/composables";
import InstanceModal from "./InstanceModal.vue";
import ProviderPicker from "./ProviderPicker.vue";

// The single "Add …" entry point for every Content section (§3.2). It picks a
// provider by what the user wants to see ("photos from…") instead of by plugin
// type, then opens that provider's own add form. There is deliberately no
// button of its own: the section's SourceList renders the Add control and
// calls `open()`.
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
const { plugins, loadPlugins, togglePlugin } = usePlugins();

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
    });
  }
  return [...list, ...pluginProviders.value];
});

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
