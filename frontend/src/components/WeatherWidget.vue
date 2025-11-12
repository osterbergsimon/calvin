<template>
  <div class="weather-widget">
    <div v-if="data && !data.error" class="weather-content">
      <div class="weather-header">
        <h3>{{ data.location || 'Weather' }}</h3>
        <button class="btn-refresh" @click="$emit('refresh')" title="Refresh weather">
          ↻
        </button>
      </div>
      
      <!-- Current Weather -->
      <div v-if="data.current" class="weather-current">
        <div class="weather-main">
          <div class="weather-icon">
            <img 
              :src="`https://openweathermap.org/img/wn/${data.current.icon}@2x.png`" 
              :alt="data.current.description"
            />
          </div>
          <div class="weather-temp">
            <span class="temp-value">{{ Math.round(data.current.temperature) }}</span>
            <span class="temp-unit">{{ getTempUnit() }}</span>
          </div>
          <div class="weather-desc">{{ capitalize(data.current.description) }}</div>
        </div>
        <div class="weather-details">
          <div class="weather-detail-item">
            <span class="detail-label">Feels like</span>
            <span class="detail-value">{{ Math.round(data.current.feels_like) }}{{ getTempUnit() }}</span>
          </div>
          <div class="weather-detail-item">
            <span class="detail-label">Humidity</span>
            <span class="detail-value">{{ data.current.humidity }}%</span>
          </div>
          <div class="weather-detail-item">
            <span class="detail-label">Wind</span>
            <span class="detail-value">{{ formatWindSpeed(data.current.wind_speed) }} {{ getWindUnit() }}</span>
          </div>
          <div class="weather-detail-item">
            <span class="detail-label">Pressure</span>
            <span class="detail-value">{{ data.current.pressure }} hPa</span>
          </div>
        </div>
      </div>

      <!-- Forecast -->
      <div v-if="data.forecast && data.forecast.length > 0" class="weather-forecast">
        <h4>Forecast</h4>
        <div class="forecast-items">
          <div 
            v-for="day in data.forecast" 
            :key="day.date"
            class="forecast-item"
          >
            <div class="forecast-date">{{ formatForecastDate(day.date) }}</div>
            <div class="forecast-icon">
              <img 
                :src="`https://openweathermap.org/img/wn/${day.icon}@2x.png`" 
                :alt="day.description"
              />
            </div>
            <div class="forecast-temps">
              <span class="temp-high">{{ Math.round(day.temp_max) }}{{ getTempUnit() }}</span>
              <span class="temp-low">{{ Math.round(day.temp_min) }}{{ getTempUnit() }}</span>
            </div>
            <div class="forecast-desc">{{ capitalize(day.description) }}</div>
          </div>
        </div>
      </div>

      <!-- Error Display -->
      <div v-if="data.error" class="weather-error">
        <p>⚠️ {{ data.error }}</p>
        <p v-if="data.message" class="error-detail">{{ data.message }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  data: {
    type: Object,
    default: null,
  },
});

defineEmits(['refresh']);

// Weather helper functions
const getTempUnit = () => {
  if (!props.data) return "°C";
  const units = props.data.units || "metric";
  if (units === "imperial") return "°F";
  if (units === "kelvin") return "K";
  return "°C";
};

const getWindUnit = () => {
  if (!props.data) return "m/s";
  const units = props.data.units || "metric";
  if (units === "imperial") return "mph";
  return "m/s";
};

const formatWindSpeed = (speed) => {
  if (!speed) return "0";
  return Math.round(speed);
};

const formatForecastDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forecastDate = new Date(date);
  forecastDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.round((forecastDate - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const capitalize = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};
</script>

<style scoped>
.weather-widget {
  width: 100%;
  height: 100%;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
  box-sizing: border-box;
}

.weather-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.weather-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.btn-refresh {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: var(--bg-tertiary);
  transform: rotate(90deg);
}

.weather-current {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.weather-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  flex-shrink: 0;
}

.weather-icon img {
  width: 80px;
  height: 80px;
}

.weather-temp {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.temp-value {
  font-size: 3rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.temp-unit {
  font-size: 2rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.weather-desc {
  font-size: 1.25rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.weather-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.weather-detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.detail-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.weather-forecast {
  margin-top: 0.5rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.weather-forecast h4 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: var(--text-primary);
  flex-shrink: 0;
}

.forecast-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.75rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.forecast-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
  text-align: center;
  flex-shrink: 0;
}

.forecast-date {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
}

.forecast-icon img {
  width: 48px;
  height: 48px;
}

.forecast-temps {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.temp-high {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.temp-low {
  font-size: 1rem;
  color: var(--text-secondary);
}

.forecast-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.weather-error {
  padding: 2rem;
  text-align: center;
  color: var(--accent-error);
}

.error-detail {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
</style>

