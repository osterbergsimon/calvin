<template>
  <div v-for="theme in themes" :key="theme" :class="{ dark: theme === 'dark' }">
    <div class="gallery" :data-theme="theme">
      <h1 class="gallery__heading">Renderer gallery — {{ theme }}</h1>

      <!-- statusbar strip -->
      <div class="gallery__bar">
        <span class="gallery__clock">21:47</span>
        <SchemaRenderer :schema="fixtures.statusRow.schema" :data="fixtures.statusRow.data" context="statusbar" />
      </div>

      <div class="gallery__grid">
        <section v-for="f in panels" :key="f.title" class="gallery__panel focus-panel-mock" :style="{ gridColumn: f.wide ? 'span 2' : 'span 1' }">
          <header class="gallery__panel-header">{{ f.title }}</header>
          <div class="gallery__panel-body">
            <SchemaRenderer :schema="f.schema" :data="f.data" :context="f.context || 'panel'" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import SchemaRenderer from "../components/plugins/SchemaRenderer.vue";

// ?theme=dark / ?theme=light renders a single theme (handy for screenshots)
const themeParam = new URLSearchParams(window.location.search).get("theme");
const themes = themeParam ? [themeParam] : ["light", "dark"];

const svgImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23334155'/><stop offset='1' stop-color='%230e7490'/></linearGradient></defs><rect width='800' height='500' fill='url(%23g)'/><circle cx='620' cy='120' r='60' fill='%23f3b052' opacity='0.9'/></svg>`
  );

const fixtures = {
  statusRow: {
    schema: {
      kind: "status",
      data_path: "$.items",
      item: {
        icon_path: "$.icon",
        label_path: "$.label",
        value_path: "$.value",
        unit_path: "$.unit",
        status_path: "$.status",
      },
    },
    data: {
      items: [
        { icon: "", label: "CPU", value: "34", unit: "%", status: "ok" },
        { icon: "", label: "Temp", value: "71", unit: "°C", status: "warn" },
        { icon: "", label: "Disk", value: "82", unit: "%", status: "ok" },
      ],
    },
  },
};

const panels = [
  {
    title: "status · tile",
    schema: {
      kind: "status",
      layout: "tile",
      data_path: "$.items",
      item: {
        label_path: "$.label",
        value_path: "$.value",
        unit_path: "$.unit",
        status_path: "$.status",
      },
    },
    data: {
      items: [
        { label: "Indoor", value: "21.4", unit: "°C", status: "ok" },
        { label: "CPU temp", value: "78", unit: "°C", status: "warn" },
        { label: "Feed", value: "down", unit: "", status: "error" },
      ],
    },
  },
  {
    title: "status · list",
    schema: {
      kind: "status",
      layout: "list",
      data_path: "$.items",
      item: {
        label_path: "$.label",
        value_path: "$.value",
        unit_path: "$.unit",
        status_path: "$.status",
      },
    },
    data: {
      items: [
        { label: "Uptime", value: "14 d", status: "ok" },
        { label: "Memory", value: "612", unit: "MB", status: "ok" },
        { label: "SD card", value: "94", unit: "%", status: "error" },
        { label: "Wi-Fi", value: "-52", unit: "dBm", status: "ok" },
      ],
    },
  },
  {
    title: "metric-dashboard",
    schema: {
      kind: "metric-dashboard",
      data_path: "$.metrics",
      layout: { columns: 2 },
      tile: {
        label_path: "$.label",
        value_path: "$.value",
        unit_path: "$.unit",
        status_path: "$.status",
      },
    },
    data: {
      metrics: [
        { label: "CPU", value: "34", unit: "%", status: "ok" },
        { label: "Memory", value: "58", unit: "%", status: "ok" },
        { label: "Temp", value: "78", unit: "°C", status: "warn" },
        { label: "Disk", value: "94", unit: "%", status: "error" },
      ],
    },
  },
  {
    title: "weather-forecast",
    wide: true,
    schema: {
      kind: "weather-forecast",
      current_path: "$.current",
      forecast_path: "$.forecast",
      current: {
        temperature_path: "$.temp",
        description_path: "$.desc",
        icon_path: "$.icon",
        feels_like_path: "$.feels",
        humidity_path: "$.humidity",
        wind_speed_path: "$.wind",
      },
      forecast: {
        date_path: "$.date",
        icon_path: "$.icon",
        temp_min_path: "$.min",
        temp_max_path: "$.max",
      },
      units: { temperature: "°", wind: "m/s" },
    },
    data: {
      current: {
        temp: 3.6,
        desc: "light snow",
        icon: "mdi:weather-snowy",
        feels: -1.2,
        humidity: 86,
        wind: 6.4,
      },
      forecast: [
        { date: "2026-07-01", icon: "mdi:weather-snowy", min: -2, max: 4 },
        { date: "2026-07-02", icon: "mdi:weather-partly-cloudy", min: -1, max: 6 },
        { date: "2026-07-03", icon: "mdi:weather-sunny", min: 0, max: 8 },
        { date: "2026-07-04", icon: "mdi:weather-rainy", min: 2, max: 7 },
        { date: "2026-07-05", icon: "mdi:weather-cloudy", min: 1, max: 5 },
      ],
    },
  },
  {
    title: "card-grid",
    wide: true,
    schema: {
      kind: "card-grid",
      data_path: "$.days",
      layout: { columns: 3 },
      card: {
        title_path: "$.day",
        items_path: "$.meals",
        item: { label_path: "$.type", value_path: "$.name" },
      },
      empty_text: "Nothing planned.",
    },
    data: {
      days: [
        {
          day: "Tuesday",
          meals: [
            { type: "Lunch", name: "Tomato soup with grilled cheese" },
            { type: "Dinner", name: "Chicken tikka masala" },
          ],
        },
        {
          day: "Wednesday",
          meals: [{ type: "Dinner", name: "Pasta carbonara" }],
        },
        { day: "Thursday", meals: [] },
      ],
    },
  },
  {
    title: "item-list",
    schema: {
      kind: "item-list",
      data_path: "$.entries",
      item: {
        timestamp_path: "$.time",
        label_path: "$.title",
        value_path: "$.detail",
      },
    },
    data: {
      entries: [
        { time: "08:12", title: "Backup finished", detail: "412 photos synced from Immich" },
        { time: "07:30", title: "Mail checked", detail: "2 new photo attachments saved" },
        { time: "06:00", title: "Meal plan updated", detail: "This week from Mealie" },
      ],
    },
  },
  {
    title: "image-with-caption",
    schema: {
      kind: "image-with-caption",
      image_url_path: "$.url",
      title_path: "$.title",
      caption_path: "$.caption",
      metadata_path: "$.meta",
    },
    data: {
      url: svgImage,
      title: "Sunset over the bay",
      caption: "From the family album",
      meta: "2026-06-28 · Immich",
    },
  },
  {
    title: "status · empty payload",
    schema: { kind: "status", layout: "list", data_path: "$.missing", item: { label: "x" } },
    data: {},
  },
];
</script>

<style scoped>
.gallery {
  background: var(--bg-0);
  padding: 2rem;
  min-height: 100vh;
  font-family: var(--font-ui);
}

.gallery__heading {
  color: var(--ink-3);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin: 0 0 1rem;
}

.gallery__bar {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.4rem 1rem;
  margin-bottom: 1.5rem;
  width: fit-content;
}

.gallery__clock {
  font-family: var(--font-data);
  font-weight: 600;
  color: var(--ink);
}

.gallery__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
  max-width: 1400px;
}

.gallery__panel {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  min-height: 320px;
  overflow: hidden;
}

.gallery__panel-header {
  padding: 0.5rem 1rem;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}

.gallery__panel-body {
  flex: 1;
  min-height: 0;
  padding: 1rem;
  overflow: hidden;
}
</style>
