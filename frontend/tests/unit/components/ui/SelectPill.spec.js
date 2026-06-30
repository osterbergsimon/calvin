import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
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

  // --- keyboard + outside-click behaviors ---

  it("ArrowDown on the trigger opens the listbox", async () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    await w.find(".pill").trigger("keydown", { key: "ArrowDown" });
    expect(w.find('[role="listbox"]').exists()).toBe(true);
  });

  it("Enter on the active option emits update:modelValue and closes", async () => {
    const w = mount(SelectPill, {
      props: { modelValue: "backlit", options: OPTS },
      attachTo: document.body,
    });
    await w.find(".pill").trigger("keydown", { key: "ArrowDown" });
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    await w.find('[role="listbox"]').trigger("keydown", { key: "Enter" });
    expect(w.emitted("update:modelValue")?.[0]).toEqual(["backlit"]);
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    w.unmount();
  });

  it("Escape closes the listbox without emitting", async () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    await w.find(".pill").trigger("click");
    await w.find('[role="listbox"]').trigger("keydown", { key: "Escape" });
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(w.emitted("update:modelValue")).toBeFalsy();
  });

  it("outside click closes the listbox", async () => {
    const w = mount(SelectPill, {
      props: { modelValue: "backlit", options: OPTS },
      attachTo: document.body,
    });
    await w.find(".pill").trigger("click");
    expect(w.find('[role="listbox"]').exists()).toBe(true);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    w.unmount();
  });

  it("labels the trigger with ariaLabel so the control's purpose is announced", () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS, ariaLabel: "Theme mode" } });
    expect(w.find(".pill").attributes("aria-label")).toBe("Theme mode");
  });

  it("omits aria-label when none is provided (falls back to the value text)", () => {
    const w = mount(SelectPill, { props: { modelValue: "backlit", options: OPTS } });
    expect(w.find(".pill").attributes("aria-label")).toBeUndefined();
  });
});
