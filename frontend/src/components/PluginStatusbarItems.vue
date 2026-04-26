<template>
  <div class="plugin-statusbar-items" :class="{ ghost }">
    <SchemaStatusbarItem
      v-for="service in schemaServices"
      :key="service.id"
      :service-id="service.id"
      :schema="service.statusbar_schema"
    />
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
import SchemaStatusbarItem from "./plugins/SchemaStatusbarItem.vue";

defineOptions({ name: "PluginStatusbarItems" });

defineProps({
  ghost: {
    type: Boolean,
    default: false,
  },
});

const webServicesStore = useWebServicesStore();

function asBoolean(value) {
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
}

function isStatusbarVisible(service) {
  const cfg = service.config || {};
  if ("show_in_statusbar" in cfg) return asBoolean(cfg.show_in_statusbar);
  return true;
}

const schemaServices = computed(() =>
  webServicesStore.services.filter(s => s.statusbar_schema?.kind && isStatusbarVisible(s))
);

const legacyServices = computed(() =>
  webServicesStore.services.filter(
    s => !s.statusbar_schema?.kind && s.statusbar_schema?.component && isStatusbarVisible(s)
  )
);

const loadedItems = ref([]);

watch(
  legacyServices,
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
