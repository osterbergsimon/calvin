import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import Tabs from "@/components/ui/Tabs.vue";

const SOURCE = readFileSync(resolve(__dirname, "../../../../src/components/ui/Tabs.vue"), "utf-8");
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const ITEMS = [
  {
    value: "home",
    label: "Home",
    meta: "Kitchen",
    title: "Home · Kitchen",
  },
  { value: "week", label: "Week", meta: "Not shown", metaTone: "warn", dimmed: true },
  { value: "month", label: "Month", meta: "All screens" },
];

const mountTabs = (props = {}, slots = {}) =>
  mount(Tabs, {
    props: { modelValue: "home", items: ITEMS, ariaLabel: "Pages", ...props },
    slots,
    attachTo: document.body,
  });

const wrappers = [];
const mountAndKeep = (props = {}, slots = {}) => {
  const w = mountTabs(props, slots);
  wrappers.push(w);
  return w;
};

const press = (w, key) => w.find('[role="tablist"]').trigger("keydown", { key });

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = "";
});

describe("Tabs", () => {
  it("is an ARIA tablist with one selected tab and roving tabindex", () => {
    const w = mountAndKeep();
    const tablist = w.find('[role="tablist"]');
    expect(tablist.attributes("aria-label")).toBe("Pages");
    const tabs = w.findAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs.map(tab => tab.attributes("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map(tab => tab.attributes("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs[0].classes()).toContain("is-active");
    expect(tabs[0].find(".tabs__label").text()).toBe("Home");
    expect(tabs[0].find(".tabs__meta").text()).toBe("Kitchen");
    expect(tabs[0].attributes("title")).toBe("Home · Kitchen");
    // The visible label and meta are the accessible name (no override that
    // could drift from it, e.g. a dot the visible text does not contain).
    expect(tabs[0].attributes("aria-label")).toBeUndefined();
    expect(tabs[0].text()).toBe("Home Kitchen");
  });

  it("marks a dimmed tab and a warn-toned meta line", () => {
    const w = mountAndKeep();
    const tabs = w.findAll('[role="tab"]');
    expect(tabs[1].classes()).toContain("is-dimmed");
    expect(tabs[1].find(".tabs__meta").classes()).toContain("tabs__meta--warn");
  });

  it("emits the chosen value on click", async () => {
    const w = mountAndKeep();
    await w.findAll('[role="tab"]')[1].trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["week"]]);
  });

  const pressAndApply = async (w, key) => {
    await press(w, key);
    const events = w.emitted("update:modelValue");
    await w.setProps({ modelValue: events[events.length - 1][0] });
  };

  it("moves with ArrowRight/ArrowLeft and wraps", async () => {
    const w = mountAndKeep();
    await pressAndApply(w, "ArrowRight");
    expect(w.emitted("update:modelValue")).toEqual([["week"]]);
    expect(document.activeElement).toBe(w.findAll('[role="tab"]')[1].element);

    await pressAndApply(w, "ArrowRight");
    expect(w.emitted("update:modelValue")[1]).toEqual(["month"]);

    await pressAndApply(w, "ArrowRight");
    expect(w.emitted("update:modelValue")[2]).toEqual(["home"]);

    await pressAndApply(w, "ArrowLeft");
    expect(w.emitted("update:modelValue")[3]).toEqual(["month"]);
  });

  it("moves with ArrowDown/ArrowUp too", async () => {
    const w = mountAndKeep();
    await pressAndApply(w, "ArrowDown");
    expect(w.emitted("update:modelValue")).toEqual([["week"]]);
    await pressAndApply(w, "ArrowUp");
    expect(w.emitted("update:modelValue")[1]).toEqual(["home"]);
  });

  it("jumps with Home and End", async () => {
    const w = mountAndKeep({ modelValue: "week" });
    await press(w, "End");
    expect(w.emitted("update:modelValue")).toEqual([["month"]]);
    await press(w, "Home");
    expect(w.emitted("update:modelValue")[1]).toEqual(["home"]);
  });

  it("skips disabled tabs when moving and ignores clicks on them", async () => {
    const items = [
      { value: "home", label: "Home" },
      { value: "week", label: "Week", disabled: true },
      { value: "month", label: "Month" },
    ];
    const w = mountAndKeep({ items });
    expect(w.findAll('[role="tab"]')[1].attributes("disabled")).toBeDefined();
    await press(w, "ArrowRight");
    expect(w.emitted("update:modelValue")).toEqual([["month"]]);
    await w.findAll('[role="tab"]')[1].trigger("click");
    expect(w.emitted("update:modelValue")).toHaveLength(1);
  });

  it("drops the meta line when hideMeta is set but keeps the label", () => {
    const w = mountAndKeep({ hideMeta: true });
    expect(w.findAll(".tabs__meta")).toHaveLength(0);
    expect(w.findAll(".tabs__label").map(node => node.text())).toEqual(["Home", "Week", "Month"]);
  });

  it("renders the action slot outside the tablist", () => {
    const w = mountAndKeep({}, { action: '<button type="button" class="add">Add</button>' });
    expect(w.find(".tabs__action .add").exists()).toBe(true);
    expect(w.find('[role="tablist"] .add').exists()).toBe(false);
  });

  it("keeps the one-line underline look in role tokens", () => {
    expect(STYLE).toMatch(/height:\s*var\(--tab-height\)/);
    expect(STYLE).toMatch(/height:\s*var\(--tab-indicator\)/);
    expect(STYLE).toMatch(/background:\s*var\(--focus\)/);
    expect(STYLE).toMatch(/font-size:\s*var\(--text-meta\)/);
    expect(STYLE).toMatch(/mask-image:\s*linear-gradient/);
    expect(STYLE).not.toMatch(/var\(--(fs|space)-/);
    expect(STYLE).not.toMatch(/font-weight:\s*[0-9]/);
    expect(STYLE).not.toMatch(/z-index:/);
  });
});
