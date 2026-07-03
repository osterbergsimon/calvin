import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CardGrid from "@/components/plugins/renderers/CardGrid.vue";
import ItemList from "@/components/plugins/renderers/ItemList.vue";
import HandoffOverlay from "@/components/plugins/overlays/HandoffOverlay.vue";
import EmbedOverlay from "@/components/plugins/overlays/EmbedOverlay.vue";

const cardSchema = {
  kind: "card-grid",
  data_path: "$.days",
  card: {
    title_path: "$.title",
    items_path: "$.meals",
    item: { value_path: "$.name", click_url_path: "$.url" },
  },
};
const cardData = {
  days: [{ title: "Mon", meals: [{ name: "Soup", url: "https://m.home/r/soup" }] }],
};

describe("CardGrid link behavior", () => {
  it("clicking an item opens a handoff overlay by default", async () => {
    const w = mount(CardGrid, {
      props: { schema: cardSchema, data: cardData },
      attachTo: document.body,
    });
    await w.find(".card-grid__item").trigger("click");
    expect(w.findComponent(HandoffOverlay).exists()).toBe(true);
    w.unmount();
  });

  it("linkAction='embed' opens an embed overlay", async () => {
    const w = mount(CardGrid, {
      props: { schema: cardSchema, data: cardData, linkAction: "embed" },
      attachTo: document.body,
    });
    await w.find(".card-grid__item").trigger("click");
    expect(w.findComponent(EmbedOverlay).exists()).toBe(true);
    w.unmount();
  });

  it("linkAction='off' makes the item non-clickable and opens nothing", async () => {
    const w = mount(CardGrid, {
      props: { schema: cardSchema, data: cardData, linkAction: "off" },
      attachTo: document.body,
    });
    expect(w.find(".card-grid__item").classes()).not.toContain("calvin-plugin-clickable");
    await w.find(".card-grid__item").trigger("click");
    expect(w.findComponent(HandoffOverlay).exists()).toBe(false);
    w.unmount();
  });
});

describe("ItemList link behavior", () => {
  const listSchema = {
    kind: "item-list",
    data_path: "$.items",
    item: { value_path: "$.name", click_url_path: "$.url", link_action: "embed" },
  };
  const listData = { items: [{ name: "Panel", url: "https://svc.home/p" }] };

  it("uses the item hint (embed) when no region override", async () => {
    const w = mount(ItemList, {
      props: { schema: listSchema, data: listData },
      attachTo: document.body,
    });
    await w.find(".item-list__row").trigger("click");
    expect(w.findComponent(EmbedOverlay).exists()).toBe(true);
    w.unmount();
  });

  it("region override beats the item hint", async () => {
    const w = mount(ItemList, {
      props: { schema: listSchema, data: listData, linkAction: "handoff" },
      attachTo: document.body,
    });
    await w.find(".item-list__row").trigger("click");
    expect(w.findComponent(HandoffOverlay).exists()).toBe(true);
    w.unmount();
  });
});
