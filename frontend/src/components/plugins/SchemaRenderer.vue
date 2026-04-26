<template>
  <div v-if="!renderer" class="schema-renderer schema-renderer--unknown">
    Unknown schema kind: {{ schema?.kind }}
  </div>
  <WebComponentHost
    v-else-if="schema.kind === 'web-component'"
    :schema="schema"
    :data="data"
    :plugin-id="pluginId"
  />
  <component v-else :is="renderer" :schema="schema" :data="data" />
</template>

<script setup>
import { computed } from "vue";
import StatusTile from "./renderers/StatusTile.vue";
import StatusList from "./renderers/StatusList.vue";
import CardGrid from "./renderers/CardGrid.vue";
import ItemList from "./renderers/ItemList.vue";
import ImageWithCaption from "./renderers/ImageWithCaption.vue";
import MetricDashboard from "./renderers/MetricDashboard.vue";
import WebComponentHost from "./WebComponentHost.vue";

const renderers = {
  "status-tile": StatusTile,
  "status-list": StatusList,
  "card-grid": CardGrid,
  "item-list": ItemList,
  "image-with-caption": ImageWithCaption,
  "metric-dashboard": MetricDashboard,
  "web-component": WebComponentHost,
};

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  pluginId: { type: String, default: "" },
});

const renderer = computed(() => renderers[props.schema?.kind] || null);
</script>

<style scoped>
.schema-renderer--unknown {
  padding: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.85em;
  font-style: italic;
}
</style>
