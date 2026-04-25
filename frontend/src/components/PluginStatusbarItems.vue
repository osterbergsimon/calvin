<template>
  <div class="plugin-statusbar-items" :class="{ ghost }">
    <component
      v-for="item in loadedItems"
      :is="item.component"
      :key="item.serviceId"
      :service-id="item.serviceId"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useWebServicesStore } from "../stores/webServices";
import { loadPluginComponent } from "../composables/usePluginComponent";

defineOptions({ name: "PluginStatusbarItems" });

defineProps({
  ghost: {
    type: Boolean,
    default: false,
  },
});

const webServicesStore = useWebServicesStore();

const statusbarServices = computed(() =>
  webServicesStore.services.filter(s => {
    if (!s.statusbar_schema?.component) return false;
    // If the plugin uses the show_in_statusbar convention, respect it.
    // Absence of the key means the plugin controls visibility itself (e.g. yr_weather).
    const cfg = s.config || {};
    if ("show_in_statusbar" in cfg) return !!cfg.show_in_statusbar;
    return true;
  })
);

const loadedItems = ref([]);

watch(
  statusbarServices,
  async services => {
    const items = await Promise.all(
      services.map(async service => {
        const component = await loadPluginComponent(service.statusbar_schema.component);
        return component ? { serviceId: service.id, component } : null;
      })
    );
    loadedItems.value = items.filter(Boolean);
  },
  { immediate: true }
);

onMounted(() => {
  if (webServicesStore.services.length === 0) {
    webServicesStore.fetchServices();
  }
});
</script>

<style scoped>
.plugin-statusbar-items {
  display: flex;
  align-items: center;
}

.plugin-statusbar-items.ghost {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}
</style>
