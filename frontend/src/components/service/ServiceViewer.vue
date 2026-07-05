<template>
  <div :key="service.id" class="service-viewer">
    <DashboardPanel
      :title="panelTitle"
      :subtitle="subtitle"
      :variant="panelVariant"
      :header-visible="headerVisible"
      :focused="focused"
    >
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>

      <SchemaRenderer
        v-if="schemaKind"
        :schema="service.display_schema"
        :data="schemaData"
        :plugin-id="service.id"
        :link-action="linkAction"
      />
      <div v-else class="unknown-service">
        <p>This service can't be shown.</p>
        <p class="error-text">Its plugin doesn't declare a display schema — update the plugin.</p>
      </div>
    </DashboardPanel>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import DashboardPanel from "../DashboardPanel.vue";
import SchemaRenderer from "../plugins/SchemaRenderer.vue";
import { useSchemaData } from "../../composables/useSchemaData";
import { resolvePath } from "../../utils/jsonPath";
import { logDebug } from "../../utils/logger";

const props = defineProps({
  service: {
    type: Object,
    required: true,
  },
  subtitle: {
    type: String,
    default: "",
  },
  headerVisible: {
    type: Boolean,
    default: true,
  },
  focused: {
    type: Boolean,
    default: false,
  },
  linkAction: { type: String, default: null },
});

const schemaKind = computed(() => props.service.display_schema?.kind || null);
const displaySchema = computed(() => props.service.display_schema || {});
const schemaQuery = useSchemaData(
  computed(() => props.service.id),
  displaySchema,
  computed(() => Boolean(schemaKind.value))
);
const schemaData = computed(() => schemaQuery.data.value);
const panelTitle = computed(() => {
  const pathTitle = displaySchema.value.title_path
    ? resolvePath(schemaData.value, displaySchema.value.title_path)
    : null;
  const resolvedTitle =
    typeof pathTitle === "string" || typeof pathTitle === "number" ? String(pathTitle) : null;
  return resolvedTitle || displaySchema.value.title || props.service.name || "Service";
});
const panelVariant = computed(() => {
  const variant = displaySchema.value.panel_variant;
  if (["default", "dense", "media", "iframe"].includes(variant)) return variant;
  return schemaKind.value === "iframe" ? "iframe" : "default";
});

watch(
  () => props.service,
  service => {
    logDebug("[ServiceViewer]", "Service data:", {
      id: service?.id,
      name: service?.name,
      plugin_id: service?.plugin_id,
      display_schema: service?.display_schema,
      url: service?.url,
      config: service?.config,
    });
  },
  { immediate: true }
);
</script>

<style scoped>
.service-viewer {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.unknown-service {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  color: var(--ink-2);
  gap: 0.5rem;
}

.error-text {
  font-size: 0.85em;
  font-style: italic;
}
</style>
