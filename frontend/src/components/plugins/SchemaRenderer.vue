<template>
  <div v-if="!renderer" class="schema-renderer schema-renderer--unknown">
    Unknown schema kind: {{ schema?.kind }}
  </div>
  <component
    v-else
    :is="renderer"
    class="schema-renderer__body"
    :schema="schema"
    :data="data"
    :plugin-id="pluginId"
    :context="context"
    :link-action="linkAction"
  />
</template>

<script setup>
import { computed } from "vue";
import { renderers } from "./rendererRegistry.js";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  pluginId: { type: String, default: "" },
  // "panel" (dashboard region) or "statusbar" — lets a renderer adapt its
  // default presentation to the surface it's drawn on.
  context: { type: String, default: "panel" },
  linkAction: { type: String, default: null },
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

.schema-renderer__body {
  min-height: 0;
}
</style>
