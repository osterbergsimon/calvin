<template>
  <div :key="service.id" class="service-viewer">
    <SchemaRenderer
      v-if="schemaKind"
      :schema="service.display_schema"
      :data="schemaData"
      :plugin-id="service.id"
    />
    <div v-else class="unknown-service">
      <p>Service has no display schema.</p>
      <p class="error-text">
        display_schema.kind is missing — this plugin may need updating to the v2 contract.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import SchemaRenderer from "../plugins/SchemaRenderer.vue";
import { useSchemaData } from "../../composables/useSchemaData";
import { logDebug } from "../../utils/logger";

const props = defineProps({
  service: {
    type: Object,
    required: true,
  },
});

const schemaKind = computed(() => props.service.display_schema?.kind || null);
const schemaQuery = useSchemaData(
  computed(() => props.service.id),
  computed(() => props.service.display_schema || {}),
  computed(() => Boolean(schemaKind.value))
);
const schemaData = computed(() => schemaQuery.data.value);

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
}

.unknown-service {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  color: var(--text-secondary);
  gap: 0.5rem;
}

.error-text {
  font-size: 0.85em;
  font-style: italic;
}
</style>
