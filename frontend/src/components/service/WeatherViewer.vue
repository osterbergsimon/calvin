<template>
  <div class="weather-viewer">
    <div v-if="query.isLoading.value" class="loading-state">
      <div class="spinner" />
      <p>Loading weather data...</p>
    </div>
    <div v-else-if="query.isError.value" class="error-state">
      <h3>⚠️ Error Loading Weather Data</h3>
      <p>
        {{
          query.error.value?.response?.data?.detail ||
          query.error.value?.message ||
          "Failed to load weather data"
        }}
      </p>
      <button class="btn-retry" @click="query.refetch()">Retry</button>
    </div>
    <WeatherWidget
      v-else-if="query.data.value"
      :data="query.data.value"
      @refresh="query.refetch()"
    />
  </div>
</template>

<script setup>
import { useWeatherData } from "../../composables/useWeatherData";
import WeatherWidget from "../WeatherWidget.vue";

const props = defineProps({
  serviceId: {
    type: String,
    required: true,
  },
});

const query = useWeatherData(props.serviceId, true);
</script>

<style scoped>
.weather-viewer {
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
</style>

