<template>
  <div class="generic-api-viewer">
    <div v-if="loading" class="loading-state">
      <div class="spinner" />
      <p>Loading service data...</p>
    </div>
    <div v-else-if="error" class="error-state">
      <h3>⚠️ Error Loading Service Data</h3>
      <p>{{ error }}</p>
      <button class="btn-retry" @click="loadData">Retry</button>
    </div>
    <div v-else-if="data" class="service-data-content">
      <!-- Render based on display_schema render_template -->
      <!-- Generic component-based rendering -->
      <component 
        v-if="component"
        :is="component"
        :data="data"
        @refresh="loadData"
      />
      <!-- Generic API data display (fallback) -->
      <div v-else class="generic-api-content">
        <pre>{{ JSON.stringify(data, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import axios from "axios";
import { getCachedData, setCachedData } from "../../utils/cache";
import { useConnectionStore } from "../../stores/connection";

const props = defineProps({
  service: {
    type: Object,
    required: true,
  },
});

const loading = ref(false);
const error = ref(null);
const data = ref(null);

// Component registry for generic components
const componentRegistry = {
  // Add registered components here
  // Components can be registered by plugins via display_schema.component_name
};

const component = computed(() => {
  const componentName = props.service.display_schema?.component_name;
  if (componentName && componentRegistry[componentName]) {
    return componentRegistry[componentName];
  }
  return null;
});

const getApiEndpoint = () => {
  if (props.service.display_schema?.api_endpoint) {
    return props.service.display_schema.api_endpoint.replace("{service_id}", props.service.id);
  }
  return props.service.url;
};

const loadData = async () => {
  if (!props.service) return;

  loading.value = true;
  error.value = null;

  const connectionStore = useConnectionStore();
  const cacheKey = `service_data_${props.service.id}`;
  const cacheTTL = 10 * 60 * 1000; // 10 minutes

  // Try to load from cache first if offline
  if (!connectionStore.isFullyOnline()) {
    const cachedData = getCachedData(cacheKey, cacheTTL);
    if (cachedData) {
      console.log(`[ServiceViewer] Using cached data for ${props.service.id}`);
      data.value = cachedData;
      loading.value = false;
      return;
    }
  }

  try {
    const apiEndpoint = getApiEndpoint();
    const response = await axios.get(apiEndpoint);
    data.value = response.data;
    
    // Cache the response
    setCachedData(cacheKey, response.data);
  } catch (err) {
    // If online but request failed, try cache
    if (connectionStore.isFullyOnline()) {
      const cachedData = getCachedData(cacheKey, cacheTTL);
      if (cachedData) {
        console.log(`[ServiceViewer] Request failed, using cached data for ${props.service.id}`);
        data.value = cachedData;
        loading.value = false;
        return;
      }
    }
    
    error.value = err.response?.data?.detail || err.message || "Failed to load service data";
    console.error("Error loading service data:", err);
    data.value = { error: error.value };
  } finally {
    loading.value = false;
  }
};

// Load data when service changes
watch(
  () => props.service?.id,
  () => {
    data.value = null;
    error.value = null;
    loadData();
  },
  { immediate: true }
);
</script>

<style scoped>
.generic-api-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  height: 100%;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state h3 {
  margin: 0;
  color: var(--accent-error);
}

.error-state p {
  color: var(--text-secondary);
  text-align: center;
}

.btn-retry {
  padding: 0.75rem 1.5rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-retry:hover {
  background: var(--bg-tertiary);
}

.service-data-content {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 1.5rem;
}

.generic-api-content {
  width: 100%;
  height: 100%;
}

.generic-api-content pre {
  margin: 0;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9rem;
  color: var(--text-primary);
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>

