<template>
  <div class="service-viewer" :key="service.id">
    <!-- Loading plugin component -->
    <div v-if="pluginComponentLoading" class="loading-state">
      <div class="spinner" />
      <p>Loading component...</p>
    </div>
    
    <!-- Plugin-provided component (highest priority) -->
    <component
      v-else-if="pluginComponent"
      :is="pluginComponent"
      :service-id="service.id"
      :api-endpoint="apiEndpoint"
    />
    
    <!-- Generic viewers (fallback) -->
    <IframeViewer
      v-else-if="displayType === 'iframe'"
      :url="service.url"
    />
    <WeatherViewer
      v-else-if="displayType === 'api' && renderTemplate === 'weather'"
      :service-id="service.id"
    />
    <GenericApiViewer
      v-else-if="displayType === 'api'"
      :service="service"
    />
    <div v-else class="unknown-service">
      <p>Unknown service type: {{ displayType }}</p>
      <p v-if="pluginComponentError" class="error-text">
        Component error: {{ pluginComponentError }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import IframeViewer from "./IframeViewer.vue";
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
  // Default to iframe
  return "iframe";
});

const renderTemplate = computed(() => {
  return props.service.display_schema?.render_template;
});

const apiEndpoint = computed(() => {
  if (props.service.display_schema?.api_endpoint) {
    return props.service.display_schema.api_endpoint.replace("{service_id}", props.service.id);
  }
  return props.service.url;
});

// Try to load plugin-provided component
const {
  component: pluginComponent,
  loading: pluginComponentLoading,
  error: pluginComponentError,
} = usePluginComponent(props.service);
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

