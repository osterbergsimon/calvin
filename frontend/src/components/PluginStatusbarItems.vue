<template>
  <div
    class="plugin-statusbar-items"
    :class="[`orientation-${orientation}`, { ghost }]"
    :style="sizeStyle"
  >
    <SchemaStatusbarItem
      v-for="service in schemaServices"
      :key="service.id"
      :service-id="service.id"
      :schema="service.statusbar_schema"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, defineComponent, h, onMounted } from "vue";
import { useWebServicesStore } from "../stores/webServices";
import { useProgressStore } from "../stores/progress";

defineOptions({ name: "PluginStatusbarItems" });

// The plugin renderer set (SchemaStatusbarItem -> SchemaRenderer ->
// rendererRegistry) is its own async chunk. It is requested only when a
// service actually declares a statusbar_schema, so a dashboard with none never
// downloads it (calvin-0fm6).
const StatusbarItemPlaceholder = defineComponent({
  name: "StatusbarItemPlaceholder",
  setup: () => () =>
    h("span", { class: "plugin-statusbar-items__placeholder", "aria-hidden": "true" }),
});

const SchemaStatusbarItem = defineAsyncComponent({
  loader: () => import("./plugins/SchemaStatusbarItem.vue"),
  loadingComponent: StatusbarItemPlaceholder,
  delay: 0,
});

const props = defineProps({
  ghost: {
    type: Boolean,
    default: false,
  },
  orientation: {
    type: String,
    default: "horizontal",
    validator: value => ["horizontal", "vertical"].includes(value),
  },
  // Readout value size (px). Overrides --plugin-value-size-sm for this bar only,
  // so plugin items size independently of the global plugin token. null = inherit.
  size: {
    type: Number,
    default: null,
  },
});

const sizeStyle = computed(() =>
  props.size != null ? { "--plugin-value-size-sm": `${props.size}px` } : null
);

const webServicesStore = useWebServicesStore();
const progressStore = useProgressStore();

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
    // Clock-bar and status plugins belong to no region: the app frame (CLV-115).
    progressStore.track("plugin:statusbar", () => webServicesStore.fetchServices());
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

/* While the async plugin chunk loads, hold a slot so the clock bar's layout
   does not jump when the real item appears. */
.plugin-statusbar-items__placeholder {
  display: inline-block;
  width: 4rem;
  height: 1.25em;
}
</style>
