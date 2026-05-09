<template>
  <div class="plugin-statusbar-items" :class="[`orientation-${orientation}`, { ghost }]">
    <SchemaStatusbarItem
      v-for="service in schemaServices"
      :key="service.id"
      :service-id="service.id"
      :schema="service.statusbar_schema"
    />
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { useWebServicesStore } from "../stores/webServices";
import SchemaStatusbarItem from "./plugins/SchemaStatusbarItem.vue";

defineOptions({ name: "PluginStatusbarItems" });

defineProps({
  ghost: {
    type: Boolean,
    default: false,
  },
  orientation: {
    type: String,
    default: "horizontal",
    validator: value => ["horizontal", "vertical"].includes(value),
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

.plugin-statusbar-items.orientation-vertical {
  flex-direction: column;
  gap: 0.5rem;
}

.plugin-statusbar-items.ghost {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}
</style>
