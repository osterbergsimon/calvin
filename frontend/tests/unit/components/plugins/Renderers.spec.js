/** Tests for the schema-driven renderer suite. */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SchemaRenderer from "@/components/plugins/SchemaRenderer.vue";
import StatusRenderer from "@/components/plugins/renderers/StatusRenderer.vue";
import CardGrid from "@/components/plugins/renderers/CardGrid.vue";
import ItemList from "@/components/plugins/renderers/ItemList.vue";
import IframeRenderer from "@/components/plugins/renderers/IframeRenderer.vue";
import ImageWithCaption from "@/components/plugins/renderers/ImageWithCaption.vue";
import MetricDashboard from "@/components/plugins/renderers/MetricDashboard.vue";
import WeatherForecast from "@/components/plugins/renderers/WeatherForecast.vue";

describe("SchemaRenderer dispatcher", () => {
  it("renders the registered renderer for a known kind", () => {
    const wrapper = mount(SchemaRenderer, {
      props: {
        schema: { kind: "status", item: { label: "Ping", value: "42", unit: "ms" } },
        data: {},
      },
    });
    expect(wrapper.find(".status--tile").exists()).toBe(true);
    expect(wrapper.text()).toContain("42");
  });

  it("renders an unknown-kind placeholder for unregistered kinds", () => {
    const wrapper = mount(SchemaRenderer, {
      props: { schema: { kind: "not-a-real-kind" }, data: null },
    });
    expect(wrapper.text()).toContain("Unknown schema kind");
  });

  it("dispatches web-component schemas to the web component host", () => {
    const wrapper = mount(SchemaRenderer, {
      props: {
        schema: { kind: "web-component", element: "calvin-test-card", module: "dist.js" },
        data: { value: 42 },
        pluginId: "test-plugin",
      },
      global: {
        stubs: {
          WebComponentHost: {
            props: ["schema", "data", "pluginId"],
            template:
              '<div class="web-component-host-stub" :data-plugin-id="pluginId">{{ schema.element }} {{ data.value }}</div>',
          },
        },
      },
    });

    expect(wrapper.find(".web-component-host-stub").exists()).toBe(true);
    expect(wrapper.find(".web-component-host-stub").attributes("data-plugin-id")).toBe(
      "test-plugin"
    );
    expect(wrapper.text()).toContain("calvin-test-card 42");
  });
});

describe("SchemaRenderer content-scaling lever (calvin-fub)", () => {
  const cardGridSchema = {
    kind: "card-grid",
    card: { title: "Mon", item: { label: "Dinner", value: "Korean Noodle Bowl with Tofu" } },
  };

  it("marks a body renderer scaled in panel context so it reads --region-content-fs", () => {
    const wrapper = mount(SchemaRenderer, {
      props: { schema: cardGridSchema, data: [{}], context: "panel" },
    });
    expect(wrapper.find(".card-grid").classes()).toContain("schema-renderer__body--scaled");
  });

  it("does not scale in statusbar context (the clock bar keeps its own sizing)", () => {
    const wrapper = mount(SchemaRenderer, {
      props: {
        schema: { kind: "status", item: { label: "Ping", value: "42" } },
        data: {},
        context: "statusbar",
      },
    });
    expect(wrapper.find(".status").classes()).not.toContain("schema-renderer__body--scaled");
  });

  it("excludes iframe and web-component kinds (out of reach for restyling)", () => {
    const iframe = mount(SchemaRenderer, {
      props: {
        schema: { kind: "iframe", url: "https://example.test" },
        data: {},
        context: "panel",
      },
    });
    expect(iframe.classes()).not.toContain("schema-renderer__body--scaled");

    const webc = mount(SchemaRenderer, {
      props: {
        schema: { kind: "web-component", element: "calvin-test-card", module: "dist.js" },
        data: {},
        context: "panel",
      },
      global: {
        stubs: {
          WebComponentHost: { template: '<div class="wc-stub" />' },
        },
      },
    });
    expect(webc.find(".wc-stub").classes()).not.toContain("schema-renderer__body--scaled");
  });
});

describe("StatusRenderer", () => {
  const itemSpec = {
    label_path: "$.label",
    value_path: "$.value",
    unit_path: "$.unit",
    status_path: "$.status",
  };

  it("renders a list row per item", () => {
    const wrapper = mount(StatusRenderer, {
      props: {
        schema: { kind: "status", layout: "list", data_path: "$.items", item: itemSpec },
        data: {
          items: [
            { label: "CPU", value: "42%" },
            { label: "Mem", value: "1.2 GB" },
          ],
        },
      },
    });
    const rows = wrapper.findAll(".status__line");
    expect(rows).toHaveLength(2);
    expect(wrapper.find(".status--list").classes()).toContain("calvin-plugin-list");
    expect(rows[0].classes()).toContain("calvin-plugin-row");
    expect(rows[0].text()).toContain("CPU");
    expect(rows[1].text()).toContain("1.2 GB");
  });

  it("renders row cells with alert tint only for warn/error", () => {
    const wrapper = mount(StatusRenderer, {
      props: {
        schema: { kind: "status", layout: "row", data_path: "$.tiles", item: itemSpec },
        data: {
          tiles: [
            { label: "CPU", value: 42, unit: "%", status: "ok" },
            { label: "RAM", value: 58, unit: "%", status: "warn" },
          ],
        },
      },
    });
    const cells = wrapper.findAll(".status__cell");
    expect(cells).toHaveLength(2);
    expect(cells[0].text()).toContain("CPU");
    expect(cells[0].text()).toContain("42");
    expect(cells[0].classes()).not.toContain("status--warn");
    expect(cells[1].classes()).toContain("status--warn");
  });

  it("defaults to row layout in the statusbar and tile layout in panels", () => {
    const props = {
      schema: { kind: "status", item: itemSpec },
      data: { label: "CPU", value: 42 },
    };
    const statusbar = mount(StatusRenderer, { props: { ...props, context: "statusbar" } });
    expect(statusbar.find(".status--row").exists()).toBe(true);
    const panel = mount(StatusRenderer, { props });
    expect(panel.find(".status--tile").exists()).toBe(true);
  });

  it("renders tile readouts with formatted value and unit", () => {
    const wrapper = mount(StatusRenderer, {
      props: {
        schema: {
          kind: "status",
          layout: "tile",
          data_path: "$.current",
          item: { ...itemSpec, value_path: "$.temperature", value_format: "round-1" },
        },
        data: {
          current: { label: "Weather", temperature: 12.456, unit: "°C", status: "ok" },
        },
      },
    });
    const readout = wrapper.find(".calvin-plugin-readout");
    expect(readout.exists()).toBe(true);
    expect(readout.text()).toContain("12.5");
    expect(readout.text()).toContain("°C");
    expect(readout.classes()).not.toContain("calvin-plugin-readout--warn");
  });

  it("supports literal icon/label/value/unit when no paths are given", () => {
    const wrapper = mount(StatusRenderer, {
      props: {
        schema: { kind: "status", item: { icon: "⚡", label: "Power", value: "120", unit: "W" } },
        data: {},
      },
    });
    expect(wrapper.text()).toContain("⚡");
    expect(wrapper.text()).toContain("Power");
    expect(wrapper.text()).toContain("120");
    expect(wrapper.text()).toContain("W");
  });

  it("omits the value span when the value does not resolve", () => {
    const wrapper = mount(StatusRenderer, {
      props: {
        schema: { kind: "status", item: { label: "Empty", value_path: "$.missing" } },
        data: {},
      },
    });
    expect(wrapper.find(".calvin-plugin-readout__value").exists()).toBe(false);
  });

  it("renders no items when the data array is empty", () => {
    const wrapper = mount(StatusRenderer, {
      props: {
        schema: { kind: "status", layout: "row", data_path: "$.tiles", item: itemSpec },
        data: { tiles: [] },
      },
    });
    expect(wrapper.findAll(".status__cell")).toHaveLength(0);
  });
});

describe("CardGrid", () => {
  const mealData = {
    days: [
      { date: "2026-04-26", meals: [{ type: "dinner", name: "Pasta", url: "https://x/r/pasta" }] },
      { date: "2026-04-27", meals: [{ type: "lunch", name: "Salad" }] },
    ],
  };
  const schema = {
    kind: "card-grid",
    data_path: "$.days",
    card: {
      title_path: "$.date",
      items_path: "$.meals",
      item: { label_path: "$.type", value_path: "$.name", click_url_path: "$.url" },
    },
    layout: { columns: 2 },
  };

  it("renders one card per data entry with header + sub-items", () => {
    const wrapper = mount(CardGrid, { props: { schema, data: mealData } });
    const cards = wrapper.findAll(".card-grid__card");
    expect(cards).toHaveLength(2);
    expect(wrapper.classes()).toContain("calvin-plugin-grid");
    expect(cards[0].classes()).toContain("calvin-plugin-surface");
    expect(cards[0].text()).toContain("dinner");
    expect(cards[0].text()).toContain("Pasta");
    expect(cards[1].text()).toContain("Salad");
  });

  it("applies fixed column count", () => {
    const wrapper = mount(CardGrid, { props: { schema, data: mealData } });
    expect(wrapper.attributes("style") || "").toContain("repeat(2, 1fr)");
  });

  it("auto-square columns scale with item count", () => {
    const wrapper = mount(CardGrid, {
      props: {
        schema: { ...schema, layout: { columns: "auto-square" } },
        data: { days: new Array(9).fill({ date: "x", meals: [] }) },
      },
    });
    expect(wrapper.attributes("style") || "").toContain("repeat(3, 1fr)");
  });

  it("marks rows as clickable when click_url_path resolves", () => {
    const wrapper = mount(CardGrid, { props: { schema, data: mealData } });
    const items = wrapper.findAll(".card-grid__item");
    expect(items[0].classes()).toContain("card-grid__item--clickable");
    expect(items[0].classes()).toContain("calvin-plugin-clickable");
    expect(items[1].classes()).not.toContain("card-grid__item--clickable");
  });

  it("marks the grid as a fit-scroll container", () => {
    const wrapper = mount(CardGrid, { props: { schema, data: mealData } });
    expect(wrapper.find(".card-grid").classes()).toContain("calvin-plugin-scroll-shade");
  });
});

describe("ItemList", () => {
  it("renders rows with timestamp + label + value", () => {
    const wrapper = mount(ItemList, {
      props: {
        schema: {
          kind: "item-list",
          data_path: "$.items",
          item: {
            timestamp_path: "$.date",
            timestamp_format: "weekday-short",
            label_path: "$.title",
            value_path: "$.summary",
          },
        },
        data: {
          items: [{ date: "2026-04-26", title: "Hello", summary: "world" }],
        },
      },
    });
    expect(wrapper.text()).toContain("Hello");
    expect(wrapper.text()).toContain("world");
    expect(wrapper.find("ul").classes()).toContain("calvin-plugin-list");
    expect(wrapper.find(".item-list__row").classes()).toContain("calvin-plugin-row");
  });

  it("shows empty state when items is empty", () => {
    const wrapper = mount(ItemList, {
      props: {
        schema: { kind: "item-list", data_path: "$.items", empty_text: "Nothing here" },
        data: { items: [] },
      },
    });
    expect(wrapper.find(".item-list__empty").text()).toBe("Nothing here");
  });
});

describe("ImageWithCaption", () => {
  it("renders image, title, and caption from paths", () => {
    const wrapper = mount(ImageWithCaption, {
      props: {
        schema: {
          kind: "image-with-caption",
          image_url_path: "$.url",
          title_path: "$.title",
          caption_path: "$.explanation",
        },
        data: {
          url: "https://example.test/pic.jpg",
          title: "Sunrise",
          explanation: "Photo from yesterday.",
        },
      },
    });
    expect(wrapper.find("img").attributes("src")).toBe("https://example.test/pic.jpg");
    expect(wrapper.text()).toContain("Sunrise");
    expect(wrapper.text()).toContain("Photo from yesterday.");
  });

  it("omits figcaption when no text fields resolve", () => {
    const wrapper = mount(ImageWithCaption, {
      props: {
        schema: { kind: "image-with-caption", image_url_path: "$.url" },
        data: { url: "x" },
      },
    });
    expect(wrapper.find("figcaption").exists()).toBe(false);
  });
});

describe("MetricDashboard", () => {
  it("renders one tile per metric with formatted value", () => {
    const wrapper = mount(MetricDashboard, {
      props: {
        schema: {
          kind: "metric-dashboard",
          data_path: "$.metrics",
          tile: {
            label_path: "$.name",
            value_path: "$.value",
            value_format: "round-1",
            unit_path: "$.unit",
            status_path: "$.status",
          },
          layout: { columns: 2 },
        },
        data: {
          metrics: [
            { name: "Temp", value: 21.456, unit: "°C", status: "ok" },
            { name: "Load", value: 92.0, unit: "%", status: "warn" },
          ],
        },
      },
    });
    const tiles = wrapper.findAll(".metric-dashboard__tile");
    expect(tiles).toHaveLength(2);
    expect(wrapper.classes()).toContain("calvin-plugin-grid");
    expect(tiles[0].classes()).toContain("calvin-plugin-metric");
    expect(tiles[0].text()).toContain("21.5");
    expect(tiles[0].classes()).not.toContain("calvin-plugin-readout--warn");
    expect(tiles[1].classes()).toContain("calvin-plugin-readout--warn");
  });
});

describe("WeatherForecast", () => {
  const schema = {
    kind: "weather-forecast",
    title_path: "$.location",
    current_path: "$.current",
    current: {
      icon_path: "$.display.icon",
      temperature_path: "$.temperature",
      feels_like_path: "$.feels_like",
      humidity_path: "$.humidity",
      pressure_path: "$.pressure",
      wind_speed_path: "$.wind_speed",
      description_path: "$.description",
    },
    forecast_path: "$.forecast",
    forecast: {
      date_path: "$.date",
      icon_path: "$.display.icon",
      temp_min_path: "$.temp_min",
      temp_max_path: "$.temp_max",
      description_path: "$.description",
    },
    units: { temperature: "°C", wind: "m/s" },
  };

  it("renders current weather and forecast from schema paths", () => {
    const wrapper = mount(WeatherForecast, {
      props: {
        schema,
        data: {
          location: "Oslo",
          current: {
            temperature: 8.4,
            feels_like: 7.1,
            humidity: 82,
            pressure: 1012,
            wind_speed: 4.6,
            description: "light rain",
            display: { icon: "mdi:weather-rainy" },
          },
          forecast: [
            {
              date: "2099-01-01",
              temp_min: 2.2,
              temp_max: 9.8,
              description: "cloudy",
              display: { icon: "mdi:weather-cloudy" },
            },
          ],
        },
      },
    });

    expect(wrapper.find("h3").exists()).toBe(false);
    expect(wrapper.find(".weather-forecast-renderer__temp-value").text()).toBe("8");
    expect(wrapper.text()).toContain("Light rain");
    expect(wrapper.text()).toContain("Humidity");
    expect(wrapper.findAll(".weather-forecast-renderer__item")).toHaveLength(1);
    expect(wrapper.text()).toContain("10°C");
    expect(wrapper.findAll("svg path")[0].attributes("d")).toBeTruthy();
  });

  it("makes the forecast strip an inline fit-scroll container with natural columns", () => {
    const wrapper = mount(WeatherForecast, {
      props: {
        schema,
        data: {
          location: "Oslo",
          current: { temperature: 8, display: { icon: "mdi:weather-rainy" } },
          forecast: [
            { date: "2099-01-01", temp_min: 2, temp_max: 9, display: { icon: "mdi:weather-cloudy" } },
            { date: "2099-01-02", temp_min: 1, temp_max: 7, display: { icon: "mdi:weather-cloudy" } },
          ],
        },
      },
    });
    const strip = wrapper.find(".weather-forecast-renderer__items");
    expect(strip.classes()).toContain("calvin-plugin-scroll-shade");
    expect(strip.attributes("style")).toContain("grid-auto-columns");
    expect(strip.attributes("style")).toContain("max-content");
  });
});

describe("CardGrid — footprint vars (calvin-fub)", () => {
  const schema = {
    kind: "card-grid",
    layout: { columns: "auto-fit-220" },
    card: { title_path: "$.day", items_path: "$.meals", item: { value_path: "$.name" } },
  };
  const data = [{ day: "Mon", meals: [{ name: "Korean Noodle Bowl with Tofu" }] }];

  it("drives the auto-fit min-width from --card-min (fallback = schema min)", () => {
    const wrapper = mount(CardGrid, { props: { schema, data } });
    const grid = wrapper.find(".card-grid");
    // The grid-template-columns must reference the CSS var so a region can override it.
    expect(grid.attributes("style")).toContain("var(--card-min");
    expect(grid.attributes("style")).toContain("220px"); // schema fallback preserved
  });

  it("uses max-content rows so cards keep natural height (guards row-collapse)", () => {
    const wrapper = mount(CardGrid, { props: { schema, data } });
    // grid-auto-rows:max-content stops the grid from squishing rows to title
    // height under space pressure — without it the fit-clamp never sees overflow.
    expect(wrapper.find(".card-grid").attributes("style")).toContain("grid-auto-rows: max-content");
  });
});

describe("IframeRenderer", () => {
  it("renders an iframe with src resolved from url_path", () => {
    const wrapper = mount(IframeRenderer, {
      props: {
        schema: { kind: "iframe", url_path: "$.url" },
        data: { url: "https://example.test/dashboard" },
      },
    });
    expect(wrapper.find("iframe").attributes("src")).toBe("https://example.test/dashboard");
  });

  it("renders no iframe when the url cannot be resolved", () => {
    const wrapper = mount(IframeRenderer, {
      props: { schema: { kind: "iframe", url_path: "$.url" }, data: {} },
    });
    expect(wrapper.find("iframe").exists()).toBe(false);
  });

  it("falls back to a literal url when no path is given", () => {
    const wrapper = mount(IframeRenderer, {
      props: { schema: { kind: "iframe", url: "https://example.test/literal" }, data: null },
    });
    expect(wrapper.find("iframe").attributes("src")).toBe("https://example.test/literal");
  });
});
