import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import Menu from "@/components/ui/Menu.vue";

const SOURCE = readFileSync(resolve(__dirname, "../../../../src/components/ui/Menu.vue"), "utf-8");
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const ITEMS = [
  { key: "edit", label: "Edit" },
  { key: "remove", label: "Remove", danger: true },
  { key: "duplicate", label: "Duplicate" },
];

const mountMenu = (items = ITEMS) =>
  mount(Menu, {
    props: { items, label: "More actions" },
    attachTo: document.body,
  });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Menu", () => {
  it("is an action list with the destructive item last", () => {
    const w = mountMenu();
    const menu = w.find('[role="menu"]');
    expect(menu.attributes("aria-label")).toBe("More actions");
    const labels = w.findAll('[role="menuitem"]').map(node => node.text());
    expect(labels).toEqual(["Edit", "Duplicate", "Remove"]);
    expect(w.findAll('[role="menuitem"]')[2].classes()).toContain("menu__item--danger");
  });

  it("focuses items without scrolling the page (the panel may not be placed yet)", async () => {
    const w = mountMenu();
    const calls = [];
    for (const node of w.findAll('[role="menuitem"]')) {
      const real = node.element.focus.bind(node.element);
      node.element.focus = opts => {
        calls.push(opts);
        real(opts);
      };
    }
    await w.findAll('[role="menuitem"]')[0].trigger("keydown", { key: "ArrowDown" });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(o => o?.preventScroll === true)).toBe(true);
  });

  it("focuses the first item and moves with Arrow keys, Home and End", async () => {
    const w = mountMenu();
    await nextTick();
    let items = w.findAll('[role="menuitem"]');
    expect(document.activeElement).toBe(items[0].element);

    await items[0].trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1].element);

    await items[1].trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[2].element);

    await items[2].trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0].element);

    await items[0].trigger("keydown", { key: "End" });
    expect(document.activeElement).toBe(items[2].element);

    await items[2].trigger("keydown", { key: "Home" });
    expect(document.activeElement).toBe(items[0].element);
  });

  it("skips disabled items", async () => {
    const w = mountMenu([
      { key: "edit", label: "Edit" },
      { key: "duplicate", label: "Duplicate", disabled: true },
      { key: "remove", label: "Remove", danger: true },
    ]);
    await nextTick();
    const items = w.findAll('[role="menuitem"]');
    await items[0].trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[2].element);
  });

  it("emits the chosen key and lets the parent close the popover", async () => {
    const w = mountMenu();
    await w.findAll('[role="menuitem"]')[0].trigger("click");
    expect(w.emitted("select")).toEqual([["edit"]]);
  });

  it("closes on Escape and on Tab", async () => {
    const w = mountMenu();
    await w.find('[role="menu"]').trigger("keydown", { key: "Escape" });
    expect(w.emitted("close")).toContainEqual(["escape"]);

    await w.find('[role="menu"]').trigger("keydown", { key: "Tab" });
    expect(w.emitted("close")).toContainEqual(["tab"]);
  });

  it("keeps items at the touch target and within the control tokens", () => {
    expect(STYLE).toMatch(/min-height:\s*var\(--touch-target\)/);
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-control\)/);
    expect(STYLE).not.toMatch(/var\(--(fs|space)-/);
    expect(STYLE).not.toMatch(/font-weight:\s*[0-9]/);
    expect(STYLE).not.toMatch(/z-index:/);
  });
});
