import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

describe("ChipMultiSelect", () => {
  it("marks the selected chips as pressed", () => {
    const w = mount(ChipMultiSelect, { props: { modelValue: [0, 6], options: DAYS } });
    const pressed = w.findAll("button").filter(b => b.attributes("aria-pressed") === "true");
    expect(pressed.map(b => b.text()).sort()).toEqual(["Sat", "Sun"]);
  });

  it("adds a day when an unselected chip is clicked, in option order", async () => {
    const w = mount(ChipMultiSelect, { props: { modelValue: [0], options: DAYS } });
    await w.findAll("button")[0].trigger("click"); // Mon (value 1)
    // option order is Mon(1),Tue(2),Sat(6),Sun(0) -> emitted keeps that order
    expect(w.emitted("update:modelValue")[0][0]).toEqual([1, 0]);
  });

  it("removes a day when a selected chip is clicked", async () => {
    const w = mount(ChipMultiSelect, { props: { modelValue: [0, 6], options: DAYS } });
    await w.findAll("button")[3].trigger("click"); // Sun (value 0) -> remove
    expect(w.emitted("update:modelValue")[0][0]).toEqual([6]);
  });

  it("treats a missing modelValue as an empty selection", async () => {
    const w = mount(ChipMultiSelect, { props: { options: DAYS } });
    expect(w.findAll("button").every(b => b.attributes("aria-pressed") === "false")).toBe(true);
    await w.findAll("button")[2].trigger("click"); // Sat (value 6)
    expect(w.emitted("update:modelValue")[0][0]).toEqual([6]);
  });

  it("exposes the group aria-label", () => {
    const w = mount(ChipMultiSelect, { props: { options: DAYS, ariaLabel: "Weekend days" } });
    expect(w.find('[role="group"]').attributes("aria-label")).toBe("Weekend days");
  });
});
