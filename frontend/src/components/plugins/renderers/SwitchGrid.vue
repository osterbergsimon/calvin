<template>
  <div class="switch-grid">
    <button v-for="item in items" :key="item.id" type="button" class="switch-tile">
      {{ item.label }}
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
});

const items = computed(() => {
  const slice = resolvePath(props.data, props.schema.data_path || "$.items");
  return Array.isArray(slice) ? slice : [];
});
</script>
