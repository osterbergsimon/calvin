<template>
  <div :key="service.id" class="service-viewer">
    <!-- Loading plugin component -->
    <div v-if="pluginComponentLoading" class="loading-state">
      <div class="spinner" />
      <p>Loading component...</p>
    </div>

    <!-- Plugin-provided component (highest priority) -->
    <component
      v-if="pluginComponent && !pluginComponentLoading && !pluginComponentError"
      :is="pluginComponent"
      :service-id="service.id"
      :api-endpoint="apiEndpoint"
      :url="service.url || service.config?.url || ''"
    />

    <!-- Generic viewers (fallback for plugins without custom components) -->
    <WeatherViewer
      v-else-if="displayType === 'api' && renderTemplate === 'weather'"
      :service-id="service.id"
      :service-name="service.name"
    />
    <GenericApiViewer v-else-if="displayType === 'api'" :service="service" />
    <div v-else class="unknown-service">
      <p>Unknown service type: {{ displayType }}</p>
      <p v-if="pluginComponentError" class="error-text">
        Component error: {{ pluginComponentError }}
      </p>
      <p v-if="componentPath" class="error-text">
        Component path: {{ componentPath }}
      </p>
      <p v-if="!componentPath && displayType === 'iframe'" class="error-text">
        No component path found for iframe service. Check
        display_schema.component.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import WeatherViewer from "./WeatherViewer.vue";
import GenericApiViewer from "./GenericApiViewer.vue";
import { usePluginComponent } from "../../composables/usePluginComponent";

const props = defineProps({
  service: {
    type: Object,
    required: true,
  },
});

const displayType = computed(() => {
  if (props.service.display_schema?.type) {
    return props.service.display_schema.type;
  }
  // If service has a URL, assume it's an iframe service
  if (props.service.url || props.service.config?.url) {
    return "iframe";
  }
  // If service has plugin_id but no URL, it might be an API service
  if (props.service.plugin_id) {
    return "api";
  }
  // Default to iframe
  return "iframe";
});

const renderTemplate = computed(() => {
  return props.service.display_schema?.render_template;
});

const apiEndpoint = computed(() => {
  if (props.service.display_schema?.api_endpoint) {
    return props.service.display_schema.api_endpoint.replace(
      "{service_id}",
      props.service.id,
    );
  }
  // For plugins without api_endpoint in display_schema, use the new plugin API format
  if (props.service.plugin_id && props.service.id) {
    return `/api/plugins/${props.service.id}/data`;
  }
  // Support both old format (service.url) and new format (service.config?.url)
  return props.service.url || props.service.config?.url || "";
});

// Try to load plugin-provided component
const {
  component: pluginComponent,
  loading: pluginComponentLoading,
  error: pluginComponentError,
  componentPath,
} = usePluginComponent(props.service);

// Debug logging
watch(
  () => props.service,
  (service) => {
    console.log("[ServiceViewer] Service data:", {
      id: service?.id,
      name: service?.name,
      plugin_id: service?.plugin_id,
      display_schema: service?.display_schema,
      url: service?.url,
      config: service?.config,
    });
  },
  { immediate: true },
);

watch(componentPath, (path) => {
  console.log("[ServiceViewer] Component path:", path);
});

watch(pluginComponent, (comp) => {
  console.log("[ServiceViewer] Plugin component loaded:", comp);
});

watch(pluginComponentError, (err) => {
  if (err) {
    console.error("[ServiceViewer] Component error:", err);
  }
});
</script>

<style scoped>
.service-viewer {
  width: 100%;
  height: 100%;
}

.unknown-service {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  color: var(--text-secondary);
}
</style>
