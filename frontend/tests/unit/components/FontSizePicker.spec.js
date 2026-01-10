/**
 * Unit tests for FontSizePicker component
 * Tests functionality: font size selection, preview display, value updates
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import FontSizePicker from "@/components/settings/shared/FontSizePicker.vue";
import { useConfigStore } from "@/stores/config";

describe("FontSizePicker", () => {
  let configStore;
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    configStore = useConfigStore();

    // Reset to default state
    configStore.clockShowDate = false;
  });

  describe("Rendering", () => {
    it("should render with default props", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.find(".font-size-picker").exists()).toBe(true);
      expect(wrapper.find(".font-size-slider").exists()).toBe(true);
      expect(wrapper.find(".font-size-input").exists()).toBe(true);
      expect(wrapper.find(".font-size-preview").exists()).toBe(true);
    });

    it("should display current value in input", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 24,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      const input = wrapper.find(".font-size-input");
      expect(Number(input.element.value)).toBe(24);
    });

    it("should display preview time", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.find(".preview-time").exists()).toBe(true);
      const timeText = wrapper.find(".preview-time").text();
      expect(timeText).toMatch(/\d{1,2}:\d{2}/); // Matches time format
    });
  });

  describe("Value Updates", () => {
    it("should emit update:modelValue when slider changes", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
        },
        global: {
          plugins: [pinia],
        },
      });

      const slider = wrapper.find(".font-size-slider");
      await slider.setValue(20);

      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      expect(wrapper.emitted("update:modelValue")[0][0]).toBe(20);
    });

    it("should emit update:modelValue when input changes", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
        },
        global: {
          plugins: [pinia],
        },
      });

      const input = wrapper.find(".font-size-input");
      await input.setValue(18);

      // Wait for debounce (200ms)
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(wrapper.emitted("update:modelValue")).toBeTruthy();
      expect(wrapper.emitted("update:modelValue")[0][0]).toBe(18);
    });

    it("should clamp value to min when below minimum", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          min: 10,
          max: 72,
        },
        global: {
          plugins: [pinia],
        },
      });

      const input = wrapper.find(".font-size-input");
      await input.setValue(5);

      // Wait for debounce (200ms)
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(wrapper.emitted("update:modelValue")[0][0]).toBe(10);
    });

    it("should clamp value to max when above maximum", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          min: 10,
          max: 72,
        },
        global: {
          plugins: [pinia],
        },
      });

      const input = wrapper.find(".font-size-input");
      await input.setValue(100);

      // Wait for debounce (200ms)
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(wrapper.emitted("update:modelValue")[0][0]).toBe(72);
    });

    it("should update local value when modelValue prop changes", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      await wrapper.setProps({ modelValue: 20 });
      await wrapper.vm.$nextTick();

      const input = wrapper.find(".font-size-input");
      expect(Number(input.element.value)).toBe(20);
    });
  });

  describe("Preview Display", () => {
    it("should show date when showDate prop is true", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          showDate: true,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.find(".preview-date").exists()).toBe(true);
      const dateText = wrapper.find(".preview-date").text();
      expect(dateText).toBeTruthy();
    });

    it("should not show date when showDate prop is false and isDatePicker is true", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          showDate: false,
          isDatePicker: true, // When isDatePicker is true, it doesn't check configStore
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.find(".preview-date").exists()).toBe(false);
    });

    it("should apply vertical styling when isVertical is true", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          isVertical: true,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.find(".font-size-preview").classes()).toContain(
        "preview-vertical",
      );
    });

    it("should not apply vertical styling when isVertical is false", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          isVertical: false,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      expect(wrapper.find(".font-size-preview").classes()).not.toContain(
        "preview-vertical",
      );
    });
  });

  describe("Date Picker Mode", () => {
    it("should adjust preview sizes when isDatePicker is true", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 14,
          isDatePicker: true,
          showDate: true,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();

      // When picking date size, time should be larger (1.14x)
      const timeStyle = wrapper.find(".preview-time").attributes("style");
      expect(timeStyle).toContain("font-size: 16px"); // 14 * 1.14 ≈ 16

      // Date should be at selected size
      const dateStyle = wrapper.find(".preview-date").attributes("style");
      expect(dateStyle).toContain("font-size: 14px");
    });

    it("should adjust preview sizes when isDatePicker is false", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 20,
          isDatePicker: false,
          showDate: true,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();

      // When picking time size, time should be at selected size
      const timeStyle = wrapper.find(".preview-time").attributes("style");
      expect(timeStyle).toContain("font-size: 20px");

      // Date should be smaller (0.875x)
      const dateStyle = wrapper.find(".preview-date").attributes("style");
      expect(dateStyle).toContain("font-size: 18px"); // 20 * 0.875 = 17.5 ≈ 18
    });
  });

  describe("Slider and Input Attributes", () => {
    it("should set correct min, max, and step on slider", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          min: 10,
          max: 72,
          step: 2,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      const slider = wrapper.find(".font-size-slider");
      expect(slider.attributes("min")).toBe("10");
      expect(slider.attributes("max")).toBe("72");
      expect(slider.attributes("step")).toBe("2");
    });

    it("should set correct min, max, and step on input", async () => {
      const wrapper = mount(FontSizePicker, {
        props: {
          modelValue: 16,
          min: 10,
          max: 72,
          step: 2,
        },
        global: {
          plugins: [pinia],
        },
      });

      await wrapper.vm.$nextTick();
      const input = wrapper.find(".font-size-input");
      expect(input.attributes("min")).toBe("10");
      expect(input.attributes("max")).toBe("72");
      expect(input.attributes("step")).toBe("2");
    });
  });
});
