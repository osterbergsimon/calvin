import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SelectPill from "@/components/ui/SelectPill.vue";

const OPTS = [
  { value: "backlit", label: "Backlit" },
  { value: "paper", label: "Paper" },
];

// The menu teleports to <body>; stub Teleport so it renders in-place and stays
// findable within the wrapper for these behavioral assertions.
const mountPill = (props, opts = {}) =>
  mount(SelectPill, { props, global: { stubs: { teleport: true } }, ...opts });

describe("SelectPill", () => {
  it("shows the current label and no open list initially", () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS });
    expect(w.find(".pill__label").text()).toBe("Backlit");
    expect(w.find('[role="listbox"]').exists()).toBe(false);
  });

  it("opens the listbox on trigger click", async () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS });
    await w.find(".pill").trigger("click");
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    expect(w.findAll('[role="option"]')).toHaveLength(2);
  });

  it("emits selection and closes the listbox", async () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS });
    await w.find(".pill").trigger("click");
    await w.findAll('[role="option"]')[1].trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual(["paper"]);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
  });

  // --- keyboard + outside-click behaviors ---

  it("ArrowDown on the trigger opens the listbox", async () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS });
    await w.find(".pill").trigger("keydown", { key: "ArrowDown" });
    expect(w.find('[role="listbox"]').exists()).toBe(true);
  });

  it("Enter on the active option emits update:modelValue and closes", async () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS }, { attachTo: document.body });
    await w.find(".pill").trigger("keydown", { key: "ArrowDown" });
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    await w.find('[role="listbox"]').trigger("keydown", { key: "Enter" });
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["backlit"]);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    w.unmount();
  });

  it("Escape closes the listbox without emitting", async () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS });
    await w.find(".pill").trigger("click");
    await w.find('[role="listbox"]').trigger("keydown", { key: "Escape" });
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(w.emitted("update:modelValue")).toBeFalsy();
  });

  it("outside click closes the listbox", async () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS }, { attachTo: document.body });
    await w.find(".pill").trigger("click");
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    w.unmount();
  });

  it("teleports the panel to <body> with fixed positioning so a clipped ancestor can't cut it off", async () => {
    // No teleport stub here: verify the menu really escapes to document.body.
    const w = mount(SelectPill, {
      props: { modelValue: "backlit", options: OPTS },
      attachTo: document.body,
    });
    await w.find(".pill").trigger("click");
    const panel = document.body.querySelector(".pill__panel");
    const menu = document.body.querySelector('[role="listbox"]');
    expect(panel).not.toBeNull();
    expect(menu).not.toBeNull();
    // it is NOT nested inside the pill wrapper (would be clipped there)
    expect(w.find(".pill-wrap").element.contains(panel)).toBe(false);
    expect(panel.style.position).toBe("fixed");
    w.unmount();
  });

  it("labels the trigger with ariaLabel so the control's purpose is announced", () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS, ariaLabel: "Theme mode" });
    expect(w.find(".pill").attributes("aria-label")).toBe("Theme mode");
  });

  it("omits aria-label when none is provided (falls back to the value text)", () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS });
    expect(w.find(".pill").attributes("aria-label")).toBeUndefined();
  });
});

describe("SelectPill with search", () => {
  // A long list is the reason to search (the timezone picker): typing narrows
  // it without leaving the keyboard.
  const MANY = [
    { value: "Africa/Abidjan", label: "Africa/Abidjan" },
    { value: "America/New_York", label: "America/New York" },
    { value: "Antarctica/Troll", label: "Antarctica/Troll" },
    { value: "Europe/Stockholm", label: "Europe/Stockholm" },
  ];

  const openSearch = async (modelValue = MANY[0].value) => {
    const w = mountPill({ modelValue, options: MANY, searchable: true });
    await w.find(".pill").trigger("click");
    return w;
  };

  const labels = w => w.findAll('[role="option"]').map(o => o.text());

  it("shows no search field by default", async () => {
    const w = mountPill({ modelValue: "backlit", options: OPTS });
    await w.find(".pill").trigger("click");
    expect(w.find(".pill__search-input").exists()).toBe(false);
  });

  it("shows a search field when searchable and focuses it", async () => {
    const w = mountPill(
      { modelValue: MANY[0].value, options: MANY, searchable: true },
      { attachTo: document.body }
    );
    await w.find(".pill").trigger("click");
    const input = w.find(".pill__search-input");
    expect(input.exists()).toBe(true);
    expect(document.activeElement).toBe(input.element);
    w.unmount();
  });

  it("filters the options as you type", async () => {
    const w = await openSearch();
    await w.find(".pill__search-input").setValue("troll");
    expect(labels(w)).toEqual(["Antarctica/Troll"]);
  });

  it("matches case-insensitively and by the raw zone id", async () => {
    const w = await openSearch();
    const input = w.find(".pill__search-input");
    await input.setValue("NEW_YORK");
    expect(labels(w)).toEqual(["America/New York"]);
    await input.setValue("europe/sto");
    expect(labels(w)).toEqual(["Europe/Stockholm"]);
  });

  it("Enter picks the highlighted match", async () => {
    const w = await openSearch();
    const input = w.find(".pill__search-input");
    await input.setValue("troll");
    await input.trigger("keydown", { key: "Enter" });
    expect(w.emitted("update:modelValue")[0]).toEqual(["Antarctica/Troll"]);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
  });

  it("ArrowDown moves the highlight through the filtered matches", async () => {
    const w = await openSearch();
    const input = w.find(".pill__search-input");
    await input.setValue("a");
    expect(labels(w).length).toBeGreaterThan(1);
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(w.emitted("update:modelValue")[0]).toEqual([MANY[1].value]);
  });

  it("says when nothing matches and Enter does nothing", async () => {
    const w = await openSearch();
    const input = w.find(".pill__search-input");
    await input.setValue("zzz");
    expect(w.findAll('[role="option"]')).toHaveLength(0);
    expect(w.text()).toContain("No matches");
    await input.trigger("keydown", { key: "Enter" });
    expect(w.emitted("update:modelValue")).toBeFalsy();
    expect(w.find('[role="listbox"]').exists()).toBe(true);
  });

  it("Escape closes without emitting", async () => {
    const w = await openSearch();
    await w.find(".pill__search-input").trigger("keydown", { key: "Escape" });
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(w.emitted("update:modelValue")).toBeFalsy();
  });

  it("starts from the full list again when reopened", async () => {
    const w = await openSearch();
    await w.find(".pill__search-input").setValue("troll");
    await w.find(".pill__search-input").trigger("keydown", { key: "Escape" });
    await w.find(".pill").trigger("click");
    expect(labels(w)).toEqual(MANY.map(o => o.label));
    expect(w.find(".pill__search-input").element.value).toBe("");
  });

  it("lets a click pick a filtered option", async () => {
    const w = await openSearch();
    await w.find(".pill__search-input").setValue("stock");
    await w.find('[role="option"]').trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual(["Europe/Stockholm"]);
  });
});
