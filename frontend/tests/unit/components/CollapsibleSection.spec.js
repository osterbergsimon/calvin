/**
 * Unit tests for CollapsibleSection component
 * Tests functionality: expand/collapse section, icon display, content visibility
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import CollapsibleSection from "@/components/settings/shared/CollapsibleSection.vue";

describe("CollapsibleSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Rendering", () => {
    it("should render with title", () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
        },
      });

      expect(wrapper.find("h2").text()).toBe("Test Section");
      expect(wrapper.find(".section-header").exists()).toBe(true);
      expect(wrapper.find(".section-header").element.tagName).toBe("BUTTON");
    });

    it("should render with icon when provided", () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          icon: "📁",
        },
      });

      expect(wrapper.find(".section-icon").exists()).toBe(true);
      expect(wrapper.find(".section-icon").text()).toBe("📁");
    });

    it("should not render icon when not provided", () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
        },
      });

      expect(wrapper.find(".section-icon").exists()).toBe(false);
    });
  });

  describe("Expanded State", () => {
    it("should be collapsed by default", () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
        },
      });

      expect(wrapper.find(".settings-section").classes()).not.toContain("expanded");
      expect(wrapper.find(".toggle-icon").text()).toBe("▶");
      expect(wrapper.find(".section-header").attributes("aria-expanded")).toBe("false");
      expect(wrapper.find(".section-content").isVisible()).toBe(false);
    });

    it("should be expanded when expanded prop is true", () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          expanded: true,
        },
      });

      expect(wrapper.find(".settings-section").classes()).toContain("expanded");
      expect(wrapper.find(".toggle-icon").text()).toBe("▼");
      expect(wrapper.find(".section-header").attributes("aria-expanded")).toBe("true");
      expect(wrapper.find(".section-content").isVisible()).toBe(true);
    });

    it("should update when expanded prop changes", async () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          expanded: false,
        },
      });

      expect(wrapper.find(".settings-section").classes()).not.toContain("expanded");

      await wrapper.setProps({ expanded: true });
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".settings-section").classes()).toContain("expanded");
      expect(wrapper.find(".toggle-icon").text()).toBe("▼");
    });
  });

  describe("Toggle Functionality", () => {
    it("should toggle expanded state when header is clicked", async () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          expanded: false,
        },
      });

      expect(wrapper.find(".settings-section").classes()).not.toContain("expanded");

      await wrapper.find(".section-header").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".settings-section").classes()).toContain("expanded");
      expect(wrapper.find(".toggle-icon").text()).toBe("▼");
    });

    it("should emit update:expanded event when toggled", async () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          expanded: false,
        },
      });

      await wrapper.find(".section-header").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("update:expanded")).toBeTruthy();
      expect(wrapper.emitted("update:expanded")[0]).toEqual([true]);
    });

    it("should collapse when clicking expanded section", async () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          expanded: true,
        },
      });

      expect(wrapper.find(".settings-section").classes()).toContain("expanded");

      await wrapper.find(".section-header").trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".settings-section").classes()).not.toContain("expanded");
      expect(wrapper.find(".toggle-icon").text()).toBe("▶");
    });
  });

  describe("Content Slot", () => {
    it("should render slot content when expanded", () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          expanded: true,
        },
        slots: {
          default: "<p>Section content</p>",
        },
      });

      expect(wrapper.find(".section-content").text()).toBe("Section content");
      expect(wrapper.find("p").exists()).toBe(true);
    });

    it("should hide slot content when collapsed", () => {
      const wrapper = mount(CollapsibleSection, {
        props: {
          title: "Test Section",
          expanded: false,
        },
        slots: {
          default: "<p>Section content</p>",
        },
      });

      expect(wrapper.find(".section-content").isVisible()).toBe(false);
    });
  });

  describe("CollapsibleSection — drawer variant", () => {
    it("adds is-drawer class when variant is drawer", () => {
      const w = mount(CollapsibleSection, {
        props: { title: "Display hardware", variant: "drawer" },
      });
      expect(w.get("section").classes()).toContain("is-drawer");
    });

    it("does not add is-drawer for the default variant (no regression)", () => {
      const w = mount(CollapsibleSection, { props: { title: "Anything" } });
      expect(w.get("section").classes()).not.toContain("is-drawer");
    });

    it("still toggles expansion", async () => {
      const w = mount(CollapsibleSection, { props: { title: "T", expanded: false } });
      expect(w.get("section").classes()).not.toContain("expanded");
      await w.get("button.section-header").trigger("click");
      expect(w.get("section").classes()).toContain("expanded");
    });
  });
});
