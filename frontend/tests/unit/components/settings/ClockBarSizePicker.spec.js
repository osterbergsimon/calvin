import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ClockBarSizePicker from "@/components/settings/shared/ClockBarSizePicker.vue";

const mountPicker = (props = {}) =>
  mount(ClockBarSizePicker, {
    props: {
      label: "Top or bottom bar",
      timeSize: 16,
      padding: 8,
      pluginItemSize: 16,
      ...props,
    },
  });

const sizeControl = wrapper => wrapper.findComponent({ name: "SegmentedControl" });

describe("ClockBarSizePicker", () => {
  it("shows the bar's size as a segmented control, Medium for the default values", () => {
    const wrapper = mountPicker();
    expect(wrapper.find(".setting-row__label").text()).toBe("Top or bottom bar size");
    expect(sizeControl(wrapper).props("modelValue")).toBe("medium");
    expect(
      sizeControl(wrapper)
        .props("options")
        .map(o => o.label)
    ).toEqual(["Small", "Medium", "Large", "Custom"]);
  });

  it("writes all four stored values when a preset is chosen", async () => {
    const wrapper = mountPicker();
    sizeControl(wrapper).vm.$emit("update:modelValue", "large");
    expect(wrapper.emitted("update").at(-1)[0]).toEqual({
      time: 24,
      date: 18,
      padding: 12,
      plugin: 20,
    });
  });

  it("opens the three fine-tune rows only for Custom", async () => {
    const wrapper = mountPicker();
    expect(wrapper.text()).not.toContain("Padding");

    sizeControl(wrapper).vm.$emit("update:modelValue", "custom");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".setting-row__label").map(el => el.text())).toEqual([
      "Top or bottom bar size",
      "Time",
      "Padding",
      "Plugin info",
    ]);
    // Choosing Custom writes nothing by itself.
    expect(wrapper.emitted("update")).toBeUndefined();
  });

  it("says Custom for values that match no preset", () => {
    const wrapper = mountPicker({ timeSize: 17 });
    expect(sizeControl(wrapper).props("modelValue")).toBe("custom");
  });

  it("keeps the side bar on its own preset set and range", async () => {
    const wrapper = mountPicker({
      label: "Side bar",
      orientation: "vertical",
      timeSize: 18,
      padding: 8,
      pluginItemSize: 16,
      max: 48,
    });
    expect(sizeControl(wrapper).props("modelValue")).toBe("medium");
    sizeControl(wrapper).vm.$emit("update:modelValue", "custom");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: "RangeSlider" }).props("max")).toBe(48);
  });

  it("sends one field at a time from the fine-tune rows", async () => {
    const wrapper = mountPicker({ timeSize: 17 });
    const sliders = wrapper.findAllComponents({ name: "RangeSlider" });
    sliders[0].vm.$emit("update:modelValue", 20);
    expect(wrapper.emitted("update").at(-1)[0]).toEqual({ time: 20 });
  });
});
