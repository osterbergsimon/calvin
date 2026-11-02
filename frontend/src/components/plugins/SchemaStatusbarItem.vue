<template>
  <SchemaRenderer
    v-if="isStatusbarKind"
    :schema="schema"
    :data="data"
    :plugin-id="serviceId"
    context="statusbar"
  />
</template>

<script setup>
import { computed, toRef } from "vue";
import SchemaRenderer from "./SchemaRenderer.vue";
import { SUPPORTED_STATUSBAR_KINDS } from "./rendererRegistry.js";
import { useSchemaData } from "../../composables/useSchemaData";

const props = defineProps({
  serviceId: { type: String, required: true },
  schema: { type: Object, required: true },
});

// The statusbar has its own kind namespace — a statusbar item can't declare a
// full panel (iframe, card-grid, ...). The backend enforces this at plugin
// load; this guard keeps stale cached schemas from leaking through.
const isStatusbarKind = computed(() => SUPPORTED_STATUSBAR_KINDS.includes(props.schema?.kind));

const query = useSchemaData(toRef(props, "serviceId"), toRef(props, "schema"), isStatusbarKind);
const data = computed(() => query.data.value);
</script>
