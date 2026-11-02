import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

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
