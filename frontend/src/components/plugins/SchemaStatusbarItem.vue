<template>
  <SchemaRenderer :schema="schema" :data="query.data" :plugin-id="serviceId" />
</template>

<script setup>
import { toRef } from "vue";
import SchemaRenderer from "./SchemaRenderer.vue";
import { useSchemaData } from "../../composables/useSchemaData";

const props = defineProps({
  serviceId: { type: String, required: true },
  schema: { type: Object, required: true },
});

const query = useSchemaData(toRef(props, "serviceId"), toRef(props, "schema"));
</script>
