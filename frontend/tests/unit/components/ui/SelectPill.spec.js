import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SelectPill from "@/components/ui/SelectPill.vue";

const OPTS = [
  { value: "backlit", label: "Backlit" },
  { value: "paper", label: "Paper" },
];

describe("SelectPill", () => {
  it("shows the current label and no open list initially", () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    expect(w.find(".pill__label").text()).toBe("Backlit");
    expect(w.find('[role="listbox"]').exists()).toBe(false);
  });

  it("opens the listbox on trigger click", async () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    await w.find(".pill").trigger("click");
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    expect(w.findAll('[role="option"]')).toHaveLength(2);
  });

  it("emits selection and closes the listbox", async () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    await w.find(".pill").trigger("click");
    await w.findAll('[role="option"]')[1].trigger("click");
    expect(w.emitted("update:modelValue")[0]).toEqual(["paper"]);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
  });
});
