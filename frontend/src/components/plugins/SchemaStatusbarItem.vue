<template>
  <SchemaRenderer :schema="schema" :data="data" :plugin-id="serviceId" />
</template>

<script setup>
import { computed, toRef } from "vue";
import SchemaRenderer from "./SchemaRenderer.vue";
import { useSchemaData } from "../../composables/useSchemaData";

const props = defineProps({
  serviceId: { type: String, required: true },
  schema: { type: Object, required: true },
});

const query = useSchemaData(toRef(props, "serviceId"), toRef(props, "schema"));
const data = computed(() => query.data.value);
</script>
