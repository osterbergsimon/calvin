/**
 * Unit tests for the shell-native PluginManager (calvin-svo).
 * Tabs are a SegmentedControl; backend + theme are always offered.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import PluginManager from "@/components/settings/specialized/PluginManager.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";

const mountManager = props =>
  mount(PluginManager, {
    props: { instances: {}, loading: false, ...props },
    global: { stubs: { PluginCard: true } },
  });

describe("PluginManager", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Tabs", () => {
    it("always offers backend + theme tabs even with no such plugins installed", () => {
      const wrapper = mountManager({
        plugins: [
          { id: "local", name: "Local Images", type: "image", enabled: true },
          { id: "weather", name: "Weather", type: "service", enabled: true },
        ],
        activeTab: "image",
      });
      const values = wrapper.findComponent(SegmentedControl).props("options").map(o => o.value);
      expect(values).toContain("backend");
      expect(values).toContain("theme");
    });

    it("offers a type tab once a plugin of that type is installed", () => {
      const wrapper = mountManager({
        plugins: [
          { id: "ical", name: "iCal", type: "calendar", enabled: true },
          { id: "local", name: "Local", type: "image", enabled: true },
        ],
        activeTab: "calendar",
      });
      const values = wrapper.findComponent(SegmentedControl).props("options").map(o => o.value);
      expect(values).toEqual(expect.arrayContaining(["calendar", "image", "backend", "theme"]));
      // service has no plugins and is not always-on → absent
      expect(values).not.toContain("service");
    });

    it("relays tab changes from the SegmentedControl", async () => {
      const wrapper = mountManager({
        plugins: [{ id: "imap", name: "IMAP", type: "backend", enabled: true }],
        activeTab: "image",
      });
      wrapper.findComponent(SegmentedControl).vm.$emit("update:modelValue", "backend");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("tab-change")?.[0]).toEqual(["backend"]);
    });
  });

  describe("List + states", () => {
    it("filters cards to the active tab", () => {
      const wrapper = mountManager({
        plugins: [
          { id: "imap", name: "IMAP", type: "backend", enabled: true },
          { id: "local", name: "Local", type: "image", enabled: true },
          { id: "weather", name: "Weather", type: "service", enabled: true },
        ],
        activeTab: "backend",
      });
      expect(wrapper.findAllComponents({ name: "PluginCard" })).toHaveLength(1);
    });

    it("shows a type-specific empty message when no plugins match", () => {
      const wrapper = mountManager({
        plugins: [{ id: "local", name: "Local", type: "image", enabled: true }],
        activeTab: "backend",
      });
      const status = wrapper.find(".pm-status");
      expect(status.exists()).toBe(true);
      expect(status.text().toLowerCase()).toContain("backend");
    });

    it("shows the loading state while loading", () => {
      const wrapper = mountManager({ plugins: [], activeTab: "calendar", loading: true });
      expect(wrapper.find(".pm-status").text().toLowerCase()).toContain("loading");
    });

    it("shows the theme install hint only on the theme tab when requested", () => {
      const wrapper = mountManager({
        plugins: [{ id: "ocean", name: "Ocean", type: "theme", enabled: true, _installed: true }],
        activeTab: "theme",
        showThemeInfo: true,
      });
      expect(wrapper.find(".pm-note").exists()).toBe(true);
    });
  });
});
