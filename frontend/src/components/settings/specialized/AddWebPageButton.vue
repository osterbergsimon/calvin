<template>
  <button
    type="button"
    class="add-web-page-btn"
    data-test="add-web-page"
    :disabled="!servicePlugin"
    :title="servicePlugin ? '' : 'Enable a web-service plugin first'"
    @click="openModal"
  >
    Add a web page
  </button>

  <InstanceModal
    :show="showModal"
    :plugin="servicePlugin"
    :instance="null"
    @close="closeModal"
    @save="handleSaved"
  />
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { usePlugins } from "@/composables";
import InstanceModal from "./InstanceModal.vue";

// The "Add a web page" flow shared with the Content › Web pages & services
// destination. It reuses the same instance modal the Plugins category uses
// for a service plugin, so there is one add flow, not two.
const { plugins, loadPlugins } = usePlugins();

const showModal = ref(false);
const servicePlugin = computed(
  () => plugins.value.find(plugin => plugin.type === "service" && plugin.enabled) || null
);

onMounted(async () => {
  if (plugins.value.length === 0) await loadPlugins();
});

const openModal = () => {
  if (servicePlugin.value) showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const handleSaved = async () => {
  showModal.value = false;
  await loadPlugins();
};
</script>

<style scoped>
.add-web-page-btn {
  min-height: var(--touch-target);
  padding: 0 1.25rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 10px;
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
