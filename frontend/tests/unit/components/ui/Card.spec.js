import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import Card from "@/components/ui/Card.vue";

const SOURCE = readFileSync(resolve(__dirname, "../../../../src/components/ui/Card.vue"), "utf-8");
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("Card", () => {
  it("renders its body inside the card surface", () => {
    const w = mount(Card, { slots: { default: '<p class="body">Nothing here yet.</p>' } });
    expect(w.classes()).toContain("card");
    expect(w.find(".body").text()).toBe("Nothing here yet.");
    expect(w.find(".card__header").exists()).toBe(false);
  });

  it("renders an optional title and an action slot", () => {
    const w = mount(Card, {
      props: { title: "Connection" },
      slots: { default: "Online", action: '<button type="button">Refresh</button>' },
    });
    expect(w.find(".card__title").text()).toBe("Connection");
    expect(w.find(".card__header button").text()).toBe("Refresh");
  });

  it("keeps the title out of the header when there is no title", () => {
    const w = mount(Card, { slots: { action: '<button type="button">Refresh</button>' } });
    expect(w.find(".card__title").exists()).toBe(false);
    expect(w.find(".card__header").exists()).toBe(true);
  });

  it("uses the card radius role", () => {
    expect(STYLE).not.toMatch(/var\(--radius-(xs|sm|md|lg|xl|2xl)\)/);
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-card\)/);
    expect(STYLE).not.toMatch(/var\(--fs-/);
    expect(STYLE).not.toMatch(/var\(--space-/);
  });
});
