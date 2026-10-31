/**
 * Unit tests for the shell-native PluginManager (calvin-svo, CLV-44).
 * Filters are the same plain kinds as the chips, with All first (§3.3).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import PluginManager from "@/components/settings/specialized/PluginManager.vue";
import Tabs from "@/components/ui/Tabs.vue";

const mountManager = props =>
  mount(PluginManager, {
    props: { instances: {}, loading: false, ...props },
    global: { stubs: { PluginCard: true } },
  });

const filterValues = wrapper =>
  wrapper
    .findComponent(Tabs)
    .props("items")
    .map(o => o.value);

describe("PluginManager", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Filters", () => {
    it("starts with All and then only the kinds that are installed", () => {
      const wrapper = mountManager({
        plugins: [
          { id: "local", name: "Local Images", type: "image", enabled: true },
          { id: "weather", name: "Weather", type: "service", enabled: true },
        ],
        activeTab: "all",
      });
      expect(filterValues(wrapper)).toEqual(["all", "image", "service"]);
    });

    it("labels a clock-bar-only service as its own kind", () => {
      const wrapper = mountManager({
        plugins: [
          {
            id: "weather",
            name: "Weather",
            type: "service",
            enabled: true,
            statusbar_schema: { kind: "status" },
          },
        ],
        activeTab: "all",
      });
      expect(filterValues(wrapper)).toEqual(["all", "clock"]);
      expect(
        wrapper
          .findComponent(Tabs)
          .props("items")
          .find(o => o.value === "clock").label
      ).toBe("Clock bar");
    });

    it("relays tab changes from the Tabs block", async () => {
      const wrapper = mountManager({
        plugins: [{ id: "imap", name: "IMAP", type: "backend", enabled: true }],
        activeTab: "all",
      });
      wrapper.findComponent(Tabs).vm.$emit("update:modelValue", "backend");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("tab-change")?.[0]).toEqual(["backend"]);
    });
  });

  describe("List + states", () => {
    it("filters cards to the active kind", () => {
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

    it("shows All cards on the All filter", () => {
      const wrapper = mountManager({
        plugins: [
          { id: "imap", name: "IMAP", type: "backend", enabled: true },
          { id: "local", name: "Local", type: "image", enabled: true },
        ],
        activeTab: "all",
      });
      expect(wrapper.findAllComponents({ name: "PluginCard" })).toHaveLength(2);
    });

    it("shows an empty message when no add-ons of that kind are installed", () => {
      const wrapper = mountManager({
        plugins: [{ id: "local", name: "Local", type: "image", enabled: true }],
        activeTab: "backend",
      });
      const status = wrapper.find('[data-test="plugin-manager-empty"]');
      expect(status.exists()).toBe(true);
      expect(status.text().toLowerCase()).toContain("kind");
    });

    it("shows the loading state while loading", () => {
      const wrapper = mountManager({ plugins: [], activeTab: "all", loading: true });
      expect(wrapper.find(".pm-status").text().toLowerCase()).toContain("loading");
    });

    it("shows the theme install hint only on the theme filter when requested", () => {
      const wrapper = mountManager({
        plugins: [{ id: "ocean", name: "Ocean", type: "theme", enabled: true, _installed: true }],
        activeTab: "theme",
        showThemeInfo: true,
      });
      expect(wrapper.find(".pm-note").exists()).toBe(true);
    });
  });
});
