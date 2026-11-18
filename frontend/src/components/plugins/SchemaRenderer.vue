<template>
  <div v-if="!renderer" class="schema-renderer schema-renderer--unknown">
    This can't be shown here.
  </div>
  <component
    v-else
    :is="renderer"
    class="schema-renderer__body"
    :class="{ 'schema-renderer__body--scaled': scaled }"
    :schema="schema"
    :data="data"
    :plugin-id="pluginId"
    :plugin-name="pluginName"
    :context="context"
    :link-action="linkAction"
    v-bind="actionProps"
  />
</template>

<script setup>
import { computed } from "vue";
import { renderers } from "./rendererRegistry.js";
import { usePluginAction } from "../../composables/usePluginAction.js";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  pluginId: { type: String, default: "" },
  // The owning plugin's display name, so a failed render can name it.
  pluginName: { type: String, default: "" },
  // "panel" (dashboard region) or "statusbar" — lets a renderer adapt its
  // default presentation to the surface it's drawn on.
  context: { type: String, default: "panel" },
  linkAction: { type: String, default: null },
  // When the data last arrived (ms, from the query), changing on every
  // successful fetch even if the payload is identical. Only renderers that
  // declare it get it (switch-grid clears its settled states on it).
  dataUpdatedAt: { type: Number, default: 0 },
});

const renderer = computed(() => renderers[props.schema?.kind] || null);

// Renderers that act (switch-grid) take `runAction`; the rest never see it, so
// a function never lands on their root element as a stray attribute.
const runAction = usePluginAction(
  () => props.pluginId,
  () => props.schema?.data_path
);
const actionProps = computed(() => {
  const declared = renderer.value?.props || {};
  return {
    ...("runAction" in declared ? { runAction } : {}),
    ...("dataUpdatedAt" in declared ? { dataUpdatedAt: props.dataUpdatedAt } : {}),
  };
});

// Content scaling (calvin-fub phase 2): the six built-in body renderers set
// their base font-size from --region-content-fs (emitted on the dashboard root
// by regionChromeScale) and size internals in em, so plugin CONTENT grows with
// the "Dashboard size" setting alongside the region chrome. Gated to panel
// context — the statusbar has its own compact sizing — and excluded for iframe
// (sandboxed) and web-component (ships its own CSS) kinds, which we can't reach.
const UNSCALED_KINDS = new Set(["iframe", "web-component"]);
const scaled = computed(() => props.context === "panel" && !UNSCALED_KINDS.has(props.schema?.kind));
</script>

<style scoped>
.schema-renderer--unknown {
  padding: 0.5rem;
  color: var(--ink-2);
  font-size: 0.85em;
  font-style: italic;
}

.schema-renderer__body {
  min-height: 0;
}

/* One lever for content scaling: the base font-size flows from the dashboard's
   --region-content-fs (fallback 1rem == no change off-dashboard), and the shared
   readout tokens are re-expressed in em so they track that base. Renderer
   internals size in em against this same base, so all plugin content scales as
   one unit with the "Dashboard size" setting. */
.schema-renderer__body--scaled {
  font-size: var(--region-content-fs, var(--fs-base));
  --plugin-value-size: 2em;
  --plugin-value-size-lg: 2.6em;
  --plugin-value-size-sm: 1.05em;
}
</style>
