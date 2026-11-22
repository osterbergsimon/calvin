/** The plugin renderers draw through the shared ui blocks (CLV-97). */

import { describe, it, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import Card from "@/components/ui/Card.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import Button from "@/components/ui/Button.vue";
import ExternalLink from "@/components/ui/ExternalLink.vue";
import CardGrid from "@/components/plugins/renderers/CardGrid.vue";
import ItemList from "@/components/plugins/renderers/ItemList.vue";
import MetricDashboard from "@/components/plugins/renderers/MetricDashboard.vue";
import WeatherForecast from "@/components/plugins/renderers/WeatherForecast.vue";
import IframeRenderer from "@/components/plugins/renderers/IframeRenderer.vue";
import WebComponentHost from "@/components/plugins/WebComponentHost.vue";

describe("card-grid uses Card and EmptyState", () => {
  const schema = {
    kind: "card-grid",
    data_path: "$.days",
    card: {
      title_path: "$.date",
      items_path: "$.meals",
      item: { label_path: "$.type", value_path: "$.name" },
    },
  };

  it("draws every card as a Card block", () => {
    const wrapper = mount(CardGrid, {
      props: {
        schema,
        data: { days: [{ date: "Mon", meals: [{ type: "dinner", name: "Soup" }] }] },
      },
    });
    const cards = wrapper.findAllComponents(Card);
    expect(cards).toHaveLength(1);
    // The fit-scroll clamp measures the card by this class.
    expect(cards[0].classes()).toContain("card-grid__card");
    // The region's card-size control still drives the inset.
    expect(cards[0].attributes("style")).toContain("var(--card-pad");
    expect(cards[0].text()).toContain("Soup");
  });

  it("draws an empty card through EmptyState with the schema text", () => {
    const wrapper = mount(CardGrid, {
      props: {
        schema: { ...schema, empty_text: "Nothing planned." },
        data: { days: [{ date: "Tue", meals: [] }] },
      },
    });
    const empty = wrapper.findComponent(EmptyState);
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain("Nothing planned.");
  });
});

describe("item-list uses EmptyState", () => {
  it("draws the empty list through EmptyState with the schema text", () => {
    const wrapper = mount(ItemList, {
      props: {
        schema: { kind: "item-list", data_path: "$.items", empty_text: "Nothing here" },
        data: { items: [] },
      },
    });
    const empty = wrapper.findComponent(EmptyState);
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain("Nothing here");
  });
});

describe("metric-dashboard uses Card", () => {
  it("draws every tile as a Card and keeps the alert tone", () => {
    const wrapper = mount(MetricDashboard, {
      props: {
        schema: {
          kind: "metric-dashboard",
          data_path: "$.metrics",
          tile: {
            label_path: "$.name",
            value_path: "$.value",
            status_path: "$.status",
          },
        },
        data: {
          metrics: [
            { name: "Temp", value: 21, status: "ok" },
            { name: "Load", value: 92, status: "warn" },
          ],
        },
      },
    });
    const tiles = wrapper.findAllComponents(Card);
    expect(tiles).toHaveLength(2);
    expect(tiles[0].classes()).toContain("metric-dashboard__tile");
    expect(tiles[1].classes()).toContain("calvin-plugin-readout--warn");
  });
});

describe("weather-forecast uses EmptyState for its error", () => {
  it("says plainly that the weather failed, and never prints the raw error", () => {
    const wrapper = mount(WeatherForecast, {
      props: {
        schema: { kind: "weather-forecast" },
        data: { error: "Weather unavailable", message: "Try again later." },
      },
    });
    const empty = wrapper.findComponent(EmptyState);
    expect(empty.exists()).toBe(true);
    expect(empty.props("message")).toBe("Couldn't get the weather.");
    expect(empty.props("help")).toBe("It will try again soon.");
    expect(wrapper.text()).not.toContain("Weather unavailable");
    expect(wrapper.text()).not.toContain("Try again later.");
    expect(wrapper.findAllComponents(InlineNote)).toHaveLength(0);
  });
});

describe("iframe uses Card, InlineNote and Button for the embed fallback", () => {
  const mountFailing = async () => {
    const wrapper = mount(IframeRenderer, {
      props: { schema: { kind: "iframe", url: "https://example.test/page" }, data: null },
    });
    await wrapper.find("iframe").trigger("error");
    return wrapper;
  };

  it("draws the fallback as a card with plain words, the URL and the two ways out", async () => {
    const wrapper = await mountFailing();
    const card = wrapper.findComponent(Card);
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain("This site won't open here");
    expect(wrapper.findComponent(InlineNote).text()).toBe(
      "This site doesn't allow being shown inside Calvin."
    );
    expect(wrapper.find(".iframe-renderer__url").text()).toBe("https://example.test/page");
    const link = wrapper.findComponent(ExternalLink);
    expect(link.find("a").attributes("href")).toBe("https://example.test/page");
    expect(link.text()).toBe("Open in a new window");
    const buttons = wrapper.findAllComponents(Button);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toBe("Try again");
  });

  it("Try again closes the fallback", async () => {
    const wrapper = await mountFailing();
    expect(wrapper.find(".iframe-renderer__fallback").exists()).toBe(true);
    await wrapper.findComponent(Button).trigger("click");
    expect(wrapper.find(".iframe-renderer__fallback").exists()).toBe(false);
  });
});

describe("web-component host uses InlineNote", () => {
  it("reports a failed load as an err note", async () => {
    const wrapper = mount(WebComponentHost, {
      props: {
        schema: { kind: "web-component" },
        data: null,
        pluginId: "test-plugin",
        pluginName: "Mealie",
      },
    });
    await flushPromises();
    const note = wrapper.findComponent(InlineNote);
    expect(note.exists()).toBe(true);
    expect(note.props("tone")).toBe("err");
    expect(note.text()).toContain("Couldn't show Mealie.");
  });
});
