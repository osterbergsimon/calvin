<template>
  <button
    type="button"
    class="add-web-page-btn"
    data-test="add-web-page"
    :disabled="candidates.length === 0"
    :title="candidates.length === 0 ? 'Enable a web-service plugin first' : ''"
    @click="open"
  >
    Add a web page
  </button>

  <ProviderPicker
    :show="showPicker"
    title="Add a web page or app"
    :providers="candidates"
    @select="openProvider"
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
import { usePlugins } from "@/composables";
import InstanceModal from "./InstanceModal.vue";
import ProviderPicker from "./ProviderPicker.vue";

// The "Add a web page" flow shared with Content › Web pages & services. A web
// page is one service plugin among several, so the user always picks one:
// opening the first enabled service plugin's form (Mealie, say) added the wrong
// kind of source. One candidate skips the picker; more than one never opens a
// form until the user chooses.
const { plugins, loadPlugins } = usePlugins();

const showPicker = ref(false);
const showModal = ref(false);
const selectedPlugin = ref(null);

// The iframe plugin is the plain "web page" one, so it leads the list.
const candidates = computed(() =>
  plugins.value
    .filter(plugin => plugin.type === "service" && plugin.enabled)
    .sort((a, b) => Number(isIframe(b)) - Number(isIframe(a)))
    .map(plugin => ({
      id: plugin.id,
      plugin,
      label: isIframe(plugin) ? "Web page (any address)" : plugin.name,
      description: plugin.description,
    }))
);

const isIframe = plugin => plugin.display_schema?.kind === "iframe";

onMounted(async () => {
  if (plugins.value.length === 0) await loadPlugins();
});

const open = () => {
  if (candidates.value.length === 1) {
    openProvider(candidates.value[0]);
    return;
  }
  if (candidates.value.length > 1) showPicker.value = true;
};

const openProvider = provider => {
  showPicker.value = false;
  selectedPlugin.value = provider.plugin;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  selectedPlugin.value = null;
};

const handleSaved = async () => {
  closeModal();
  await loadPlugins();
};
</script>

<style scoped>
.add-web-page-btn {
  min-height: var(--touch-target);
  padding: 0 1.25rem;
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.add-web-page-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}
.add-web-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.add-web-page-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
