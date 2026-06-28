import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import NumberStepper from "@/components/ui/NumberStepper.vue";

describe("NumberStepper", () => {
  it("increments and decrements within bounds", async () => {
    const w = mount(NumberStepper, { props: { modelValue: 4, min: 1, max: 6, ariaLabel: "Weeks" } });
    await w.get('[data-step="inc"]').trigger("click");
    expect(w.emitted("update:modelValue").at(-1)).toEqual([5]);
    await w.setProps({ modelValue: 6 });
    await w.get('[data-step="inc"]').trigger("click"); // clamp at max
    expect(w.emitted("update:modelValue").at(-1)).toEqual([6]);
  });
  it("clamps at min", async () => {
    const w = mount(NumberStepper, { props: { modelValue: 1, min: 1, max: 6 } });
    await w.get('[data-step="dec"]').trigger("click");
    expect(w.emitted("update:modelValue").at(-1)).toEqual([1]);
  });
});
