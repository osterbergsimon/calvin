import {
  mdiWeatherCloudy,
  mdiWeatherFog,
  mdiWeatherLightning,
  mdiWeatherNight,
  mdiWeatherPartlyCloudy,
  mdiWeatherPouring,
  mdiWeatherRainy,
  mdiWeatherSnowy,
  mdiWeatherSunny,
  mdiWeatherWindy,
} from "@mdi/js";

const weatherIcons = {
  "mdi:weather-sunny": mdiWeatherSunny,
  "mdi:weather-night": mdiWeatherNight,
  "mdi:weather-partly-cloudy": mdiWeatherPartlyCloudy,
  "mdi:weather-cloudy": mdiWeatherCloudy,
  "mdi:weather-rainy": mdiWeatherRainy,
  "mdi:weather-pouring": mdiWeatherPouring,
  "mdi:weather-snowy": mdiWeatherSnowy,
  "mdi:weather-lightning": mdiWeatherLightning,
  "mdi:weather-fog": mdiWeatherFog,
  "mdi:weather-windy": mdiWeatherWindy,
};

export function weatherIconPath(iconId) {
  return weatherIcons[iconId] || mdiWeatherCloudy;
}

export function isKnownWeatherIcon(iconId) {
  return Boolean(weatherIcons[iconId]);
}
