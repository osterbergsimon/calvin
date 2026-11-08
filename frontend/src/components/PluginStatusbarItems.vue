<template>
  <div
    class="plugin-statusbar-items"
    :class="[`orientation-${orientation}`, { ghost }]"
    :style="sizeStyle"
  >
    <SchemaStatusbarItem
      v-for="service in schemaServices"
      :key="`${service.id}:${retryKey}`"
      :service-id="service.id"
      :schema="service.statusbar_schema"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, defineComponent, h, onMounted, ref } from "vue";
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

// A failed chunk load (flaky Wi-Fi) is retried twice on its own, then replaced
// by a tap-to-retry control rather than a blank gap in the clock bar
// (calvin-o8c1). Bumping retryKey remounts the async wrapper, which loads again.
const retryKey = ref(0);
const StatusbarItemError = defineComponent({
  name: "StatusbarItemError",
  setup: () => () =>
    h(
      "button",
      {
        type: "button",
        class: "plugin-statusbar-items__retry",
        "data-test": "statusbar-retry",
        title: "Clock bar info did not load. Tap to retry.",
        "aria-label": "Clock bar info did not load. Retry",
        onClick: () => {
          retryKey.value += 1;
        },
      },
      "↻"
    ),
});

const SchemaStatusbarItem = defineAsyncComponent({
  loader: () => import("./plugins/SchemaStatusbarItem.vue"),
  loadingComponent: StatusbarItemPlaceholder,
  errorComponent: StatusbarItemError,
  delay: 0,
  onError(error, retry, fail, attempts) {
    if (attempts <= 2) setTimeout(retry, 1500 * attempts);
    else fail();
  },
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
  // An ordered list of instance ids (docs/design/2026-11-04-clock-bar-editor.md
  // §7.1). With ids the caller (the clock bar design) decides which tiles show,
  // so `show_in_statusbar` is not read. Without it, today's behaviour.
  ids: {
    type: Array,
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

const schemaServices = computed(() => {
  const barServices = webServicesStore.services.filter(service => service.statusbar_schema?.kind);
  if (Array.isArray(props.ids)) {
    const byId = new Map(barServices.map(service => [service.id, service]));
    return props.ids.map(id => byId.get(id)).filter(Boolean);
  }
  return barServices.filter(isStatusbarVisible);
});

onMounted(() => {
  if (webServicesStore.services.length === 0) {
    // Clock-bar and status plugins belong to no region: the app frame (CLV-115).
    progressStore.track("plugin:statusbar", () => webServicesStore.fetchServices());
  }
});
</script>

<style scoped>
.plugin-statusbar-items {
  /* A grid of minmax(0, max-content) columns: as wide as its tiles when there
     is room, but a floor of zero, so the zone holding it can shrink to its
     fixed parts and the tiles truncate. (A flex row would report its full
     width as the floor.) */
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, max-content);
  align-items: center;
  /* Tiles in a row never run together ("176·9'YR 2°"). */
  column-gap: var(--gap-inline);
  /* The tiles are the part of a bar that gives way: they shrink (their names
     truncate) instead of running over the zone beside them (calvin-r7lb). */
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
}

.plugin-statusbar-items.orientation-vertical {
  overflow: visible;
  column-gap: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.plugin-statusbar-items.ghost {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}

.plugin-statusbar-items__retry {
  min-width: 44px;
  min-height: 44px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* While the async plugin chunk loads, hold a slot so the clock bar's layout
   does not jump when the real item appears. */
.plugin-statusbar-items__placeholder {
  display: inline-block;
  width: 4rem;
  height: 1.25em;
}
</style>
