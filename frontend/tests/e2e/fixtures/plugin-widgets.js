/**
 * Schema-widget fixtures for the plugin layout specs (calvin-xxe3).
 *
 * Each entry mirrors the display_schema a real plugin declares (Mealie, SL,
 * Yr) plus a payload shaped like its fetch() output, so the built-in renderers
 * are exercised exactly as on a kiosk. Nothing here reaches a real server: the
 * specs serve these through the API mock's `overrides`.
 */

const MEALS = ["Breakfast", "Lunch", "Dinner"];
const DISHES = [
  "Overnight oats with blueberries",
  "Chicken caesar wrap",
  "Slow-cooked beef stew with root vegetables",
  "Veggie omelette",
  "Tomato soup and grilled cheese",
  "Pad thai with prawns",
  "Pancakes with lingonberry jam",
  "Falafel bowl",
  "Salmon with dill potatoes",
];

function mealieDays(count) {
  return Array.from({ length: count }, (_, day) => ({
    title: `Day ${day + 1}`,
    meals: MEALS.map((type, i) => ({
      type,
      name: DISHES[(day * 3 + i) % DISHES.length],
      url: `https://mealie.example.com/recipe/${day}-${i}`,
    })),
  }));
}

function slDepartures(count) {
  const lines = ["14 Mörby centrum", "17 Åkeshov", "19 Hässelby strand", "4 Gullmarsplan"];
  return Array.from({ length: count }, (_, i) => ({
    label: lines[i % lines.length],
    display: i === 0 ? "Nu" : `${i * 3} min`,
    status: i === 5 ? "warn" : "ok",
  }));
}

function yrForecast(count) {
  const icons = ["mdi:weather-sunny", "mdi:weather-partly-cloudy", "mdi:weather-rainy"];
  const base = new Date("2026-11-09T00:00:00Z");
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    return {
      date: d.toISOString().slice(0, 10),
      icon: icons[i % icons.length],
      temp_min: 2 + (i % 4),
      temp_max: 7 + (i % 5),
      description: ["clear sky", "partly cloudy", "light rain"][i % 3],
    };
  });
}

export const WIDGETS = {
  mealie: {
    label: "CardGrid (Mealie)",
    pluginId: "mealie",
    display_schema: {
      kind: "card-grid",
      data_path: "$.days",
      layout: { columns: "auto-fit-220" },
      card: {
        title_path: "$.title",
        items_path: "$.meals",
        item: { label_path: "$.type", value_path: "$.name", click_url_path: "$.url" },
      },
      empty_text: "Nothing planned.",
      poll_interval_ms: 900000,
    },
    data: () => ({ days: mealieDays(7) }),
    // Selector for one repeating content unit.
    unit: ".card-grid__card",
  },
  sl: {
    label: "StatusRenderer (SL)",
    pluginId: "sl_departures",
    display_schema: {
      kind: "status",
      layout: "list",
      data_path: "$.departures",
      item: { label_path: "$.label", value_path: "$.display", status_path: "$.status" },
      poll_interval_ms: 30000,
    },
    data: () => ({ departures: slDepartures(12) }),
    unit: ".status__line",
  },
  yr: {
    label: "WeatherForecast (Yr)",
    pluginId: "yr_weather",
    display_schema: {
      kind: "weather-forecast",
      current_path: "$.current",
      forecast_path: "$.forecast",
      current: {
        temperature_path: "$.temperature",
        description_path: "$.description",
        icon_path: "$.icon",
        feels_like_path: "$.feels_like",
        humidity_path: "$.humidity",
        pressure_path: "$.pressure",
        wind_speed_path: "$.wind_speed",
      },
      forecast: {
        date_path: "$.date",
        icon_path: "$.icon",
        temp_min_path: "$.temp_min",
        temp_max_path: "$.temp_max",
        description_path: "$.description",
      },
      units: { temperature: "°C", wind: "m/s" },
      poll_interval_ms: 1800000,
    },
    data: () => ({
      current: {
        temperature: 6,
        description: "partly cloudy",
        icon: "mdi:weather-partly-cloudy",
        feels_like: 3,
        humidity: 81,
        pressure: 1006,
        wind_speed: 4,
      },
      forecast: yrForecast(10),
    }),
    unit: ".weather-forecast-renderer__item",
  },
  list: {
    label: "ItemList",
    pluginId: "feed",
    display_schema: {
      kind: "item-list",
      data_path: "$.items",
      item: {
        timestamp_path: "$.time",
        label_path: "$.title",
        value_path: "$.detail",
        click_url_path: "$.url",
      },
      poll_interval_ms: 600000,
    },
    data: () => ({
      items: Array.from({ length: 30 }, (_, i) => ({
        time: `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
        title: `Update ${i + 1}`,
        detail: "A short line of detail that a feed entry would carry",
        url: `https://feed.example.com/${i}`,
      })),
    }),
    unit: ".item-list__row",
  },
  metrics: {
    label: "MetricDashboard",
    pluginId: "system-monitor",
    display_schema: {
      kind: "metric-dashboard",
      data_path: "$.metrics",
      layout: { columns: "auto-square" },
      tile: { label_path: "$.label", value_path: "$.value", unit_path: "$.unit" },
      poll_interval_ms: 5000,
    },
    data: () => ({
      metrics: [
        { label: "CPU", value: 23, unit: "%" },
        { label: "Memory", value: 61, unit: "%" },
        { label: "Disk", value: 48, unit: "%" },
        { label: "Temp", value: 52, unit: "°C" },
        { label: "Load", value: 0.7, unit: "" },
        { label: "Uptime", value: 12, unit: "d" },
      ],
    }),
    unit: ".metric-dashboard__tile",
  },
  image: {
    label: "ImageWithCaption",
    pluginId: "nasa-apod",
    display_schema: {
      kind: "image-with-caption",
      image_url_path: "$.url",
      title_path: "$.title",
      caption_path: "$.explanation",
      poll_interval_ms: 3600000,
    },
    data: () => ({
      url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'><rect width='800' height='500' fill='%23345'/></svg>",
      title: "The Pillars of Creation",
      explanation:
        "A towering column of gas and dust in the Eagle Nebula, imaged in infrared by an orbiting telescope.",
    }),
    unit: ".image-caption",
  },
};

export const SIZES = {
  small: { width: 800, height: 480 },
  medium: { width: 1280, height: 800 },
  large: { width: 2560, height: 1440 },
};

function screensFor(instanceId) {
  return {
    dashboardScreens: {
      version: 2,
      activeScreenId: "widget",
      screens: [
        {
          id: "widget",
          name: "Widget",
          layout: {
            version: 1,
            preset: "single",
            regions: [
              { id: "region-1", kind: "service", instanceIds: [instanceId], size: 100 },
            ],
          },
          activeRegionId: "region-1",
        },
      ],
    },
    availableScreens: ["widget"],
    defaultScreenId: "widget",
  };
}

/**
 * Mock overrides serving `widget` as the only service plugin, with an instance
 * `inst-<key>` and a data endpoint whose hits are counted in `hits.data`.
 */
export function widgetOverrides(key, hits) {
  const widget = WIDGETS[key];
  const instanceId = `inst-${key}`;
  const plugin = {
    id: widget.pluginId,
    name: widget.label,
    type: "service",
    version: "1.0.0",
    enabled: true,
    description: widget.label,
    instance_config_schema: {},
    display_schema: widget.display_schema,
    statusbar_schema: null,
  };
  const instance = {
    id: instanceId,
    plugin_id: widget.pluginId,
    name: widget.label,
    enabled: true,
    running: true,
    display_order: 0,
    config: {},
  };
  const reply = (route, body) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  return {
    instanceId,
    config: screensFor(instanceId),
    overrides: [
      [
        /^\/api\/plugins$/,
        (route, { method, url }) => {
          if (method !== "GET") return false;
          const type = url.searchParams.get("plugin_type");
          return reply(route, { plugins: !type || type === "service" ? [plugin] : [] });
        },
      ],
      [
        new RegExp(`^/api/plugins/${widget.pluginId}$`),
        route => reply(route, plugin),
      ],
      [
        new RegExp(`^/api/plugins/${widget.pluginId}/instances$`),
        route => reply(route, { instances: [instance] }),
      ],
      [
        new RegExp(`^/api/plugins/${instanceId}/data$`),
        route => {
          hits.data += 1;
          return reply(route, widget.data());
        },
      ],
    ],
  };
}
