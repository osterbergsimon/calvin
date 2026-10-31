import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ColourField from "@/components/ui/ColourField.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/ColourField.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const SWATCHES = [
  { token: "--event-1", number: 1, hex: "#863427" },
  { token: "--event-2", number: 2, hex: "#865a27" },
  { token: "--event-3", number: 3, hex: "#7b7824" },
  { token: "--event-4", number: 4, hex: "#26844e" },
  { token: "--event-5", number: 5, hex: "#26827b" },
  { token: "--event-6", number: 6, hex: "#275f86" },
  { token: "--event-7", number: 7, hex: "#2f2786" },
  { token: "--event-8", number: 8, hex: "#862786" },
];

const mountField = (props = {}, attachTo = undefined) =>
  mount(ColourField, {
    props: {
      modelValue: "#863427",
      label: "Calendar colour",
      swatches: SWATCHES,
      ...props,
    },
    global: { stubs: { teleport: true } },
    attachTo,
  });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ColourField", () => {
  it("offers the theme swatches as a labelled radio group, then Custom…", () => {
    const w = mountField();
    const group = w.find('[role="radiogroup"]');
    expect(group.attributes("aria-labelledby")).toBe(
      w.find(".colour-field__label").attributes("id")
    );

    const radios = w.findAll('input[type="radio"]');
    expect(radios).toHaveLength(8);
    expect(radios.map(radio => radio.element.value)).toEqual(SWATCHES.map(s => s.hex));
    expect(w.text()).toContain("Theme colour 1");
    expect(w.findAll("button").some(button => button.text() === "Custom…")).toBe(true);
  });

  it("checks the radio that matches the value and names it", () => {
    const w = mountField({ modelValue: "#26827b" });
    const chosen = w.find('input[value="#26827b"]');
    expect(chosen.element.checked).toBe(true);
    expect(w.find(".colour-field__chosen").text()).toBe("Theme colour 5");
  });

  it("emits the swatch hex when one is chosen", async () => {
    const w = mountField();
    await w.find('input[value="#26844e"]').trigger("change");
    expect(w.emitted("update:modelValue")).toEqual([["#26844e"]]);
  });

  it("shows Custom colour for a value outside the theme", () => {
    const w = mountField({ modelValue: "#123456" });
    expect(w.find(".colour-field__chosen").text()).toBe("Custom colour");
    expect(w.find('input[type="radio"][value="#123456"]').exists()).toBe(false);
  });

  it("never offers a raw hex box; the custom picker is the native colour input", async () => {
    const w = mountField();
    expect(w.find('input[type="text"]').exists()).toBe(false);
    const native = w.find('input[type="color"]');
    expect(native.exists()).toBe(true);
    expect(native.attributes("aria-label")).toBe("Custom colour picker");

    const click = vi.spyOn(native.element, "click");
    const custom = w.findAll("button").find(button => button.text() === "Custom…");
    await custom.trigger("click");
    expect(click).toHaveBeenCalled();
  });

  it("emits a normalised hex when the native picker changes", async () => {
    const w = mountField();
    const native = w.find('input[type="color"]');
    native.element.value = "#abcdef";
    await native.trigger("input");
    expect(w.emitted("update:modelValue")).toEqual([["#abcdef"]]);
  });

  it("compact renders a trigger that shows the chosen swatch and name", () => {
    const w = mountField({ compact: true, modelValue: "#863427" });
    const trigger = w.find("button.colour-field__trigger");
    expect(trigger.attributes("aria-label")).toBe("Calendar colour: Theme colour 1");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(trigger.find(".colour-field__trigger-label").text()).toBe("Theme colour 1");
    // The inline group stays out of the row until the popover opens.
    expect(w.find('[role="radiogroup"]').exists()).toBe(false);
  });

  it("compact opens the same radio group in a Popover and closes after a choice", async () => {
    const w = mountField({ compact: true, modelValue: "#863427" }, document.body);
    await w.find("button.colour-field__trigger").trigger("click");
    await nextTick();
    await nextTick();

    const panel = w.find('[role="dialog"]');
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("aria-label")).toBe("Calendar colour");
    expect(w.findAll('[role="radiogroup"] input[type="radio"]')).toHaveLength(8);

    await w.find('input[value="#26844e"]').trigger("change");
    expect(w.emitted("update:modelValue")).toEqual([["#26844e"]]);
    await nextTick();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it("keeps the block token-driven and literal-free", () => {
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-control\)/);
    expect(STYLE).toMatch(/min-height:\s*var\(--touch-target\)/);
    expect(STYLE).not.toMatch(/var\(--(fs|space)-/);
    expect(STYLE).not.toMatch(/font-weight:\s*[0-9]/);
    expect(STYLE).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
