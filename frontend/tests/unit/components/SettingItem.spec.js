/**
 * Unit tests for SettingItem component
 * Tests functionality: renders setting label, control, help text, and required indicator
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import SettingItem from "@/components/settings/shared/SettingItem.vue";

describe("SettingItem", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Rendering", () => {
    it("should render with label", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Test Setting",
        },
        slots: {
          default: "<input type='text' />",
        },
      });

      expect(wrapper.find("label").exists()).toBe(true);
      expect(wrapper.find("label").text()).toBe("Test Setting");
      expect(wrapper.find(".setting-control").exists()).toBe(true);
    });

    it("should render without label when label prop is not provided", () => {
      const wrapper = mount(SettingItem, {
        slots: {
          default: "<input type='text' />",
        },
      });

      expect(wrapper.find("label").exists()).toBe(false);
      expect(wrapper.find(".setting-control").exists()).toBe(true);
    });

    it("should render with help text", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Test Setting",
          help: "This is helpful information",
        },
        slots: {
          default: "<input type='text' />",
        },
      });

      expect(wrapper.find(".help-text").exists()).toBe(true);
      expect(wrapper.find(".help-text").text()).toBe("This is helpful information");
    });

    it("should not render help text when help prop is not provided", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Test Setting",
        },
        slots: {
          default: "<input type='text' />",
        },
      });

      expect(wrapper.find(".help-text").exists()).toBe(false);
    });

    it("should render required indicator when required is true", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Test Setting",
          required: true,
        },
        slots: {
          default: "<input type='text' />",
        },
      });

      expect(wrapper.find(".required-indicator").exists()).toBe(true);
      expect(wrapper.find(".required-indicator").text()).toBe("*");
    });

    it("should not render required indicator when required is false", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Test Setting",
          required: false,
        },
        slots: {
          default: "<input type='text' />",
        },
      });

      expect(wrapper.find(".required-indicator").exists()).toBe(false);
    });
  });

  describe("Slots", () => {
    it("should render default slot content", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Test Setting",
        },
        slots: {
          default: "<input type='text' value='test' />",
        },
      });

      const input = wrapper.find("input");
      expect(input.exists()).toBe(true);
      expect(input.attributes("value")).toBe("test");
    });

    it("should render label slot when provided", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Default Label",
        },
        slots: {
          label: "<span class='custom-label'>Custom Label</span>",
          default: "<input type='text' />",
        },
      });

      const customLabel = wrapper.find(".custom-label");
      expect(customLabel.exists()).toBe(true);
      expect(customLabel.text()).toBe("Custom Label");
      // Should not show default label when slot is provided
      expect(wrapper.text()).not.toContain("Default Label");
    });
  });

  describe("Complete Example", () => {
    it("should render complete setting item with all features", () => {
      const wrapper = mount(SettingItem, {
        props: {
          label: "Email Address",
          help: "Enter your email address",
          required: true,
        },
        slots: {
          default: "<input type='email' placeholder='email@example.com' />",
        },
      });

      expect(wrapper.find("label").text()).toBe("Email Address");
      expect(wrapper.find(".help-text").text()).toBe("Enter your email address");
      expect(wrapper.find(".required-indicator").text()).toBe("*");
      expect(wrapper.find("input[type='email']").exists()).toBe(true);
      expect(wrapper.find("input").attributes("placeholder")).toBe("email@example.com");
    });
  });
});
