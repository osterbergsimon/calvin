/** Tests for the schema-driven renderer suite. */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SchemaRenderer from "@/components/plugins/SchemaRenderer.vue";
import StatusList from "@/components/plugins/renderers/StatusList.vue";
import StatusRow from "@/components/plugins/renderers/StatusRow.vue";
import CardGrid from "@/components/plugins/renderers/CardGrid.vue";
import ItemList from "@/components/plugins/renderers/ItemList.vue";
import ImageWithCaption from "@/components/plugins/renderers/ImageWithCaption.vue";
import MetricDashboard from "@/components/plugins/renderers/MetricDashboard.vue";

describe("SchemaRenderer dispatcher", () => {
  it("renders the registered renderer for a known kind", () => {
    const wrapper = mount(SchemaRenderer, {
      props: {
        schema: { kind: "status-tile", value: "42", unit: "ms" },
        data: null,
      },
    });
    expect(wrapper.find(".status-tile").exists()).toBe(true);
    expect(wrapper.text()).toContain("42");
  });

  it("renders an unknown-kind placeholder for unregistered kinds", () => {
    const wrapper = mount(SchemaRenderer, {
      props: { schema: { kind: "not-a-real-kind" }, data: null },
    });
    expect(wrapper.text()).toContain("Unknown schema kind");
  });
});

describe("StatusList", () => {
  it("renders a row per item", () => {
    const wrapper = mount(StatusList, {
      props: {
        schema: {
          kind: "status-list",
          data_path: "$.items",
          item: { label_path: "$.label", value_path: "$.value" },
        },
        data: {
          items: [
            { label: "CPU", value: "42%" },
            { label: "Mem", value: "1.2 GB" },
          ],
        },
      },
    });
    const rows = wrapper.findAll(".status-list__row");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("CPU");
    expect(rows[1].text()).toContain("1.2 GB");
  });
});

describe("StatusRow", () => {
  const schema = {
    kind: "status-row",
    data_path: "$.tiles",
    item: {
      label_path: "$.label",
      value_path: "$.value",
      unit_path: "$.unit",
      status_path: "$.status",
    },
    separator: "·",
  };

  it("renders one item per tile with separators between", () => {
    const wrapper = mount(StatusRow, {
      props: {
        schema,
        data: {
          tiles: [
            { label: "CPU", value: 42, unit: "%", status: "ok" },
            { label: "RAM", value: 58, unit: "%", status: "warn" },
          ],
        },
      },
    });
    const items = wrapper.findAll(".status-row__item");
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("CPU");
    expect(items[0].text()).toContain("42");
    expect(items[0].classes()).toContain("status-row__item--ok");
    expect(items[1].classes()).toContain("status-row__item--warn");
    expect(wrapper.findAll(".status-row__sep")).toHaveLength(1);
  });

  it("renders nothing when data array is empty", () => {
    const wrapper = mount(StatusRow, {
      props: { schema, data: { tiles: [] } },
    });
    expect(wrapper.findAll(".status-row__item")).toHaveLength(0);
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
    expect(items[1].classes()).not.toContain("card-grid__item--clickable");
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
    expect(tiles[0].text()).toContain("21.5");
    expect(tiles[0].classes()).toContain("metric-dashboard__tile--ok");
    expect(tiles[1].classes()).toContain("metric-dashboard__tile--warn");
  });
});
