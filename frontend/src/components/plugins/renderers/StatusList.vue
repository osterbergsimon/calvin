<template>
  <ul class="status-list">
    <li v-for="(item, idx) in items" :key="idx" class="status-list__row">
      <StatusTile :schema="itemSchemaFor(item)" :data="item" />
    </li>
  </ul>
</template>

<script setup>
import { computed } from "vue";
import StatusTile from "./StatusTile.vue";
import { resolvePath } from "../../../utils/jsonPath";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
});

const items = computed(() => {
  const slice = props.schema.data_path
    ? resolvePath(props.data, props.schema.data_path)
    : props.data;
  return Array.isArray(slice) ? slice : [];
});

function itemSchemaFor() {
  return { kind: "status-tile", ...(props.schema.item || {}) };
}
</script>

<style scoped>
.status-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-list__row {
  padding: 0.5rem 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}
</style>
