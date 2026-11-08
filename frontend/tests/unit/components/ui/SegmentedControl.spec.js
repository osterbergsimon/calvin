import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/SegmentedControl.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const OPTS = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
];

describe("SegmentedControl", () => {
  it("marks the selected option with aria-checked and class", () => {
    const w = mount(SegmentedControl, { props: { modelValue: "landscape", options: OPTS } });
    const btns = w.findAll('[role="radio"]');
    expect(btns).toHaveLength(2);
    expect(btns[0].attributes("aria-checked")).toBe("true");
    expect(btns[0].classes()).toContain("on");
    expect(btns[1].attributes("aria-checked")).toBe("false");
  });

  it("emits update:modelValue on click", async () => {
    const w = mount(SegmentedControl, { props: { modelValue: "landscape", options: OPTS } });
    await w.findAll('[role="radio"]')[1].trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual(["portrait"]);
  });

  it("moves selection with ArrowRight", async () => {
    const w = mount(SegmentedControl, { props: { modelValue: "landscape", options: OPTS } });
    await w.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowRight" });
    expect(w.emitted("update:modelValue")[0]).toEqual(["portrait"]);
  });

  it("moves selection backward with ArrowLeft", async () => {
    const w = mount(SegmentedControl, { props: { modelValue: "portrait", options: OPTS } });
    await w.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowLeft" });
    expect(w.emitted("update:modelValue")[0]).toEqual(["landscape"]);
  });

  it("ArrowRight from the last option wraps to the first", async () => {
    const w = mount(SegmentedControl, { props: { modelValue: "portrait", options: OPTS } });
    await w.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowRight" });
    expect(w.emitted("update:modelValue")[0]).toEqual(["landscape"]);
  });

  it("ArrowLeft from the first option wraps to the last", async () => {
    const w = mount(SegmentedControl, { props: { modelValue: "landscape", options: OPTS } });
    await w.find('[role="radiogroup"]').trigger("keydown", { key: "ArrowLeft" });
    expect(w.emitted("update:modelValue")[0]).toEqual(["portrait"]);
  });

  it("keeps every segment at least the touch target in both directions", () => {
    expect(STYLE).toMatch(/\.seg__btn\s*\{[^}]*min-width:\s*var\(--touch-target\)/s);
    expect(STYLE).toMatch(
      /\.seg__btn\s*\{[^}]*min-height:\s*var\(--seg-btn-min-height,\s*var\(--touch-target\)\)/s
    );
  });
});
