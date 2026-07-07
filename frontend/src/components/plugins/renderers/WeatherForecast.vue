<template>
  <section v-if="data && !data.error" class="weather-forecast-renderer">
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
        <div v-if="hasValue(feelsLike)" class="calvin-plugin-readout">
          <span class="calvin-plugin-readout__label">Feels like</span>
          <span class="weather-forecast-renderer__detail-value">
            {{ round(feelsLike) }}{{ temperatureUnit }}
          </span>
        </div>
        <div v-if="hasValue(humidity)" class="calvin-plugin-readout">
          <span class="calvin-plugin-readout__label">Humidity</span>
          <span class="weather-forecast-renderer__detail-value">{{ round(humidity) }}%</span>
        </div>
        <div v-if="hasValue(windSpeed)" class="calvin-plugin-readout">
          <span class="calvin-plugin-readout__label">Wind</span>
          <span class="weather-forecast-renderer__detail-value">
            {{ round(windSpeed) }} {{ windUnit }}
          </span>
        </div>
        <div v-if="hasValue(pressure)" class="calvin-plugin-readout">
          <span class="calvin-plugin-readout__label">Pressure</span>
          <span class="weather-forecast-renderer__detail-value">{{ round(pressure) }} hPa</span>
        </div>
      </div>
    </div>

    <div v-if="forecast.length" class="weather-forecast-renderer__forecast">
      <h4 class="calvin-plugin-readout__label">Forecast</h4>
      <div
        ref="itemsEl"
        class="weather-forecast-renderer__items"
        :class="shadeClass"
        :style="[stripStyle, clampStyle]"
      >
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
  <div v-else-if="data?.error" class="weather-forecast-renderer calvin-plugin-error">
    <p>{{ data.error }}</p>
    <p v-if="data.message">{{ data.message }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import { weatherIconPath } from "../../../utils/weatherIcons";
import { useFitScroll } from "../../../composables/useFitScroll.js";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array], default: null },
});

const currentSpec = computed(() => props.schema.current || {});
const forecastSpec = computed(() => props.schema.forecast || {});
const units = computed(() => props.schema.units || {});

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

const itemsEl = ref(null);
const { clampStyle, shadeClass } = useFitScroll(itemsEl, {
  axis: "inline",
  itemSelector: ".weather-forecast-renderer__item",
  data: () => props.data,
});
// Natural column widths so the strip OVERFLOWS horizontally instead of shrinking
// columns to fit — that overflow is what useFitScroll clamps/scrolls (X-axis
// analogue of the card-grid grid-auto-rows:max-content fix).
const stripStyle = { gridAutoColumns: "minmax(90px, max-content)" };

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
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow: hidden;
  box-sizing: border-box;
}

.weather-forecast-renderer__current {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* The current conditions are the panel's one big display moment: open air,
   no box — the temperature carries the hierarchy by size alone. */
.weather-forecast-renderer__main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0 0.25rem;
  flex-shrink: 0;
}

.weather-forecast-renderer__icon {
  width: 72px;
  height: 72px;
  fill: var(--ink-2);
}

.weather-forecast-renderer__temp {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
}

.weather-forecast-renderer__temp-value {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 4em;
  font-weight: 500;
  color: var(--ink);
  line-height: 1;
}

.weather-forecast-renderer__temp-unit {
  font-family: var(--font-data);
  font-size: 1.75em;
  font-weight: 400;
  color: var(--ink-3);
}

.weather-forecast-renderer__desc {
  font-size: 1.05em;
  color: var(--ink-2);
}

.weather-forecast-renderer__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  border-top: 1px solid var(--line-soft);
  padding-top: 1rem;
}

.weather-forecast-renderer__detail-value {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
  font-size: 1.2em;
  font-weight: 600;
  color: var(--ink);
}

.weather-forecast-renderer__forecast {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--line-soft);
  padding-top: 0.9rem;
}

.weather-forecast-renderer__forecast h4 {
  margin: 0 0 0.75rem 0;
  flex-shrink: 0;
}

/* Day columns separated by hairlines — chassis, not boxes. */
.weather-forecast-renderer__items {
  display: grid;
  grid-auto-flow: column;
  overflow-y: hidden;
  flex: 1;
  min-height: 0;
}

.weather-forecast-renderer__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  text-align: center;
  padding: 0.25rem 0.5rem;
}

.weather-forecast-renderer__item + .weather-forecast-renderer__item {
  border-left: 1px solid var(--line-soft);
}

.weather-forecast-renderer__date {
  font-family: var(--font-ui);
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.weather-forecast-renderer__small-icon {
  width: 40px;
  height: 40px;
  fill: var(--ink-2);
}

.weather-forecast-renderer__temps {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}

.weather-forecast-renderer__high {
  font-size: 1.1em;
  font-weight: 600;
  color: var(--ink);
}

.weather-forecast-renderer__low {
  font-size: 0.9em;
  color: var(--ink-3);
}

.weather-forecast-renderer__forecast-desc {
  font-size: 0.8em;
  color: var(--ink-2);
}
</style>
