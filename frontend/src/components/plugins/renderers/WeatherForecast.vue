<template>
  <section v-if="data && !data.error" class="weather-forecast-renderer">
    <header class="weather-forecast-renderer__header">
      <h3>{{ title }}</h3>
    </header>

    <div v-if="current" class="weather-forecast-renderer__current">
      <div class="weather-forecast-renderer__main">
        <svg class="weather-forecast-renderer__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="weatherIconPath(currentIcon)" />
        </svg>
        <div class="weather-forecast-renderer__temp">
          <span class="weather-forecast-renderer__temp-value">{{ round(currentTemperature) }}</span>
          <span class="weather-forecast-renderer__temp-unit">{{ temperatureUnit }}</span>
        </div>
        <div v-if="currentDescription" class="weather-forecast-renderer__desc">
          {{ capitalize(currentDescription) }}
        </div>
      </div>

      <div class="weather-forecast-renderer__details">
        <div v-if="hasValue(feelsLike)" class="weather-forecast-renderer__detail">
          <span class="weather-forecast-renderer__detail-label">Feels like</span>
          <span class="weather-forecast-renderer__detail-value">
            {{ round(feelsLike) }}{{ temperatureUnit }}
          </span>
        </div>
        <div v-if="hasValue(humidity)" class="weather-forecast-renderer__detail">
          <span class="weather-forecast-renderer__detail-label">Humidity</span>
          <span class="weather-forecast-renderer__detail-value">{{ round(humidity) }}%</span>
        </div>
        <div v-if="hasValue(windSpeed)" class="weather-forecast-renderer__detail">
          <span class="weather-forecast-renderer__detail-label">Wind</span>
          <span class="weather-forecast-renderer__detail-value">
            {{ round(windSpeed) }} {{ windUnit }}
          </span>
        </div>
        <div v-if="hasValue(pressure)" class="weather-forecast-renderer__detail">
          <span class="weather-forecast-renderer__detail-label">Pressure</span>
          <span class="weather-forecast-renderer__detail-value">{{ round(pressure) }} hPa</span>
        </div>
      </div>
    </div>

    <div v-if="forecast.length" class="weather-forecast-renderer__forecast">
      <h4>Forecast</h4>
      <div class="weather-forecast-renderer__items">
        <article
          v-for="(day, index) in forecast"
          :key="dateFor(day) || index"
          class="weather-forecast-renderer__item"
        >
          <div class="weather-forecast-renderer__date">{{ formatForecastDate(dateFor(day)) }}</div>
          <svg class="weather-forecast-renderer__small-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path :d="weatherIconPath(iconFor(day))" />
          </svg>
          <div class="weather-forecast-renderer__temps">
            <span class="weather-forecast-renderer__high">
              {{ round(tempMaxFor(day)) }}{{ temperatureUnit }}
            </span>
            <span class="weather-forecast-renderer__low">
              {{ round(tempMinFor(day)) }}{{ temperatureUnit }}
            </span>
          </div>
          <div v-if="descriptionFor(day)" class="weather-forecast-renderer__forecast-desc">
            {{ capitalize(descriptionFor(day)) }}
          </div>
        </article>
      </div>
    </div>
  </section>
  <div v-else-if="data?.error" class="weather-forecast-renderer weather-forecast-renderer__error">
    <p>{{ data.error }}</p>
    <p v-if="data.message">{{ data.message }}</p>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { weatherIconPath } from "../../../utils/weatherIcons";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array], default: null },
});

const currentSpec = computed(() => props.schema.current || {});
const forecastSpec = computed(() => props.schema.forecast || {});
const units = computed(() => props.schema.units || {});

const title = computed(
  () => pick(props.data, props.schema.title_path, props.schema.title) || "Weather"
);
const current = computed(() =>
  props.schema.current_path
    ? resolvePath(props.data, props.schema.current_path)
    : props.data?.current
);
const forecast = computed(() => {
  const items = props.schema.forecast_path
    ? resolvePath(props.data, props.schema.forecast_path)
    : props.data?.forecast;
  return Array.isArray(items) ? items : [];
});

const temperatureUnit = computed(() => units.value.temperature || "°C");
const windUnit = computed(() => units.value.wind || "m/s");

function pick(source, path, literal) {
  return path ? resolvePath(source, path) : literal;
}

function currentPick(pathKey, literalKey) {
  const spec = currentSpec.value;
  return pick(current.value, spec[pathKey], spec[literalKey]);
}

const currentIcon = computed(() => currentPick("icon_path", "icon") || "mdi:weather-cloudy");
const currentTemperature = computed(() => currentPick("temperature_path", "temperature"));
const currentDescription = computed(() => currentPick("description_path", "description"));
const feelsLike = computed(() => currentPick("feels_like_path", "feels_like"));
const humidity = computed(() => currentPick("humidity_path", "humidity"));
const pressure = computed(() => currentPick("pressure_path", "pressure"));
const windSpeed = computed(() => currentPick("wind_speed_path", "wind_speed"));

function forecastPick(day, pathKey, literalKey) {
  const spec = forecastSpec.value;
  return pick(day, spec[pathKey], spec[literalKey]);
}

const dateFor = day => forecastPick(day, "date_path", "date");
const iconFor = day => forecastPick(day, "icon_path", "icon") || "mdi:weather-cloudy";
const descriptionFor = day => forecastPick(day, "description_path", "description");
const tempMinFor = day => forecastPick(day, "temp_min_path", "temp_min");
const tempMaxFor = day => forecastPick(day, "temp_max_path", "temp_max");

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function round(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return Math.round(value);
}

function formatForecastDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forecastDate = new Date(date);
  forecastDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((forecastDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function capitalize(value) {
  if (!value) return "";
  const str = String(value);
  return str.charAt(0).toUpperCase() + str.slice(1);
}
</script>

<style scoped>
.weather-forecast-renderer {
  width: 100%;
  height: 100%;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
  box-sizing: border-box;
}

.weather-forecast-renderer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.weather-forecast-renderer__header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.weather-forecast-renderer__current {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.weather-forecast-renderer__main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  flex-shrink: 0;
}

.weather-forecast-renderer__icon {
  width: 80px;
  height: 80px;
  fill: var(--accent-primary);
}

.weather-forecast-renderer__temp {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.weather-forecast-renderer__temp-value {
  font-size: 3rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.weather-forecast-renderer__temp-unit {
  font-size: 2rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.weather-forecast-renderer__desc {
  font-size: 1.25rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.weather-forecast-renderer__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.weather-forecast-renderer__detail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.weather-forecast-renderer__detail-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.weather-forecast-renderer__detail-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.weather-forecast-renderer__forecast {
  margin-top: 0.5rem;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.weather-forecast-renderer__forecast h4 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  color: var(--text-primary);
  flex-shrink: 0;
}

.weather-forecast-renderer__items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.75rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.weather-forecast-renderer__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
  text-align: center;
}

.weather-forecast-renderer__date {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1rem;
}

.weather-forecast-renderer__small-icon {
  width: 48px;
  height: 48px;
  fill: var(--accent-primary);
}

.weather-forecast-renderer__temps {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.weather-forecast-renderer__high {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.weather-forecast-renderer__low {
  font-size: 1rem;
  color: var(--text-secondary);
}

.weather-forecast-renderer__forecast-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.weather-forecast-renderer__error {
  justify-content: center;
  text-align: center;
  color: var(--accent-error);
}
</style>
