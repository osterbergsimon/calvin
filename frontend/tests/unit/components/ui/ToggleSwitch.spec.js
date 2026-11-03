import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/ToggleSwitch.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("ToggleSwitch", () => {
  it("reflects modelValue via aria-checked and class", () => {
    const on = mount(ToggleSwitch, { props: { modelValue: true, ariaLabel: "Split" } });
    expect(on.attributes("role")).toBe("switch");
    expect(on.attributes("aria-checked")).toBe("true");
    expect(on.classes()).toContain("on");

    const off = mount(ToggleSwitch, { props: { modelValue: false, ariaLabel: "Split" } });
    expect(off.attributes("aria-checked")).toBe("false");
    expect(off.classes()).not.toContain("on");
  });

  it("emits the negated value on click", async () => {
    const w = mount(ToggleSwitch, { props: { modelValue: false, ariaLabel: "Split" } });
    await w.trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual([true]);
  });
});

describe("ToggleSwitch touch target", () => {
  it("keeps the 44x24 track but centres a --touch-target hit area on it", () => {
    expect(STYLE).toMatch(/\.tog::before\s*\{[^}]*height:\s*var\(--touch-target\)/s);
    expect(STYLE).toMatch(/\.tog::before\s*\{[^}]*top:\s*50%[^}]*translateY\(-50%\)/s);
    // Width stays on the track so the hit area cannot reach the table's time
    // fields; only the height grows.
    expect(STYLE).toMatch(/\.tog::before\s*\{[^}]*left:\s*0[^}]*right:\s*0/s);
  });

  it("is never squeezed below --toggle-w by a flex row", () => {
    expect(STYLE).toMatch(/\.tog\s*\{[^}]*min-width:\s*var\(--toggle-w\)/s);
    expect(STYLE).toMatch(/\.tog\s*\{[^}]*flex:\s*0 0 auto/s);
  });
});
