/**
 * Unit tests for DisplayTab component
 * Tests functionality: week start day setting, orientation, layout options
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DisplayTab from "@/components/settings/tabs/layout/DisplayTab.vue";

describe("DisplayTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Week Start Day", () => {
    it("should render Week Start Day setting in Calendar section", () => {
      const wrapper = mount(DisplayTab, {
        props: {
          config: {},
        },
      });

      expect(wrapper.text()).toContain("Week Start Day");

      const weekStartSelect = wrapper
        .findAll("select")
        .find((s) => s.findAll("option").some((o) => o.text() === "Monday"));
      expect(weekStartSelect).toBeDefined();
      expect(weekStartSelect?.findAll("option").length).toBe(7);
    });

    it("should default to Monday (1) when config has no weekStartDay", () => {
      const wrapper = mount(DisplayTab, {
        props: {
          config: {},
        },
      });

      const weekStartSelect = wrapper
        .findAll("select")
        .find((s) => s.findAll("option").some((o) => o.text() === "Monday"));
      expect(weekStartSelect).toBeDefined();
      expect(weekStartSelect?.element.value).toBe("1");
    });

    it("should show Sunday when config has weekStartDay 0", () => {
      const wrapper = mount(DisplayTab, {
        props: {
          config: { weekStartDay: 0 },
        },
      });

      const weekStartSelect = wrapper
        .findAll("select")
        .find((s) => s.findAll("option").some((o) => o.text() === "Sunday"));
      expect(weekStartSelect?.element.value).toBe("0");
    });

    it("should emit update:config with weekStartDay when changed", async () => {
      const wrapper = mount(DisplayTab, {
        props: {
          config: { weekStartDay: 1 },
        },
      });

      const weekStartSelect = wrapper
        .findAll("select")
        .find((s) => s.findAll("option").some((o) => o.text() === "Saturday"));
      await weekStartSelect?.setValue("6");
      await weekStartSelect?.trigger("change");

      expect(wrapper.emitted("update:config")).toBeTruthy();
      const lastEmit = wrapper.emitted("update:config").at(-1);
      expect(lastEmit[0]).toEqual({ weekStartDay: 6 });
    });

    it("should include all week day options (Sunday through Saturday)", () => {
      const wrapper = mount(DisplayTab, {
        props: {
          config: {},
        },
      });

      const weekStartSelect = wrapper
        .findAll("select")
        .find((s) => s.findAll("option").some((o) => o.text() === "Monday"));
      const options = weekStartSelect?.findAll("option") || [];
      const dayLabels = options.map((o) => o.text());

      expect(dayLabels).toEqual([
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ]);
    });
  });
});
