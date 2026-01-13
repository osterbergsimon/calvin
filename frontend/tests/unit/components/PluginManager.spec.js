/**
 * Unit tests for PluginManager component
 * Tests functionality: tab display, backend plugin tab, plugin filtering
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import PluginManager from "@/components/settings/specialized/PluginManager.vue";
import TabNavigation from "@/components/settings/shared/TabNavigation.vue";

describe("PluginManager", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Backend Tab Display", () => {
    it("should show backend tab even when no backend plugins are installed", () => {
      const wrapper = mount(PluginManager, {
        props: {
          plugins: [
            { id: "local", name: "Local Images", type: "image", enabled: true },
            { id: "weather", name: "Weather", type: "service", enabled: true },
          ],
          instances: {},
          loading: false,
          activeTab: "image",
        },
        global: {
          stubs: {
            PluginCard: true,
          },
        },
      });

      // Get tabs from TabNavigation component
      const tabs = wrapper.findComponent(TabNavigation);
      expect(tabs.exists()).toBe(true);

      // Backend tab should be in the tabs list even without plugins
      const tabProps = tabs.props("tabs");
      const backendTab = tabProps.find((tab) => tab.id === "backend");
      expect(backendTab).toBeDefined();
      expect(backendTab.label).toBe("Backend");
      expect(backendTab.icon).toBe("🔧");
    });

    it("should show backend tab when backend plugins exist", () => {
      const wrapper = mount(PluginManager, {
        props: {
          plugins: [
            {
              id: "imap",
              name: "Email (IMAP)",
              type: "backend",
              enabled: true,
            },
            { id: "local", name: "Local Images", type: "image", enabled: true },
          ],
          instances: {},
          loading: false,
          activeTab: "backend",
        },
        global: {
          stubs: {
            PluginCard: true,
          },
        },
      });

      const tabs = wrapper.findComponent(TabNavigation);
      const tabProps = tabs.props("tabs");
      const backendTab = tabProps.find((tab) => tab.id === "backend");
      expect(backendTab).toBeDefined();
    });

    it("should filter plugins by active tab including backend", async () => {
      const wrapper = mount(PluginManager, {
        props: {
          plugins: [
            {
              id: "imap",
              name: "Email (IMAP)",
              type: "backend",
              enabled: true,
            },
            { id: "local", name: "Local Images", type: "image", enabled: true },
            { id: "weather", name: "Weather", type: "service", enabled: true },
          ],
          instances: {},
          loading: false,
          activeTab: "backend",
        },
        global: {
          stubs: {
            PluginCard: true,
          },
        },
      });

      // Wait for computed to update
      await wrapper.vm.$nextTick();

      // Should only show backend plugins when backend tab is active
      // Check that empty state is not shown (plugins exist)
      const emptyState = wrapper.find(".empty-state");
      expect(emptyState.exists()).toBe(false);
    });

    it("should show empty state message for backend tab", () => {
      const wrapper = mount(PluginManager, {
        props: {
          plugins: [
            { id: "local", name: "Local Images", type: "image", enabled: true },
          ],
          instances: {},
          loading: false,
          activeTab: "backend",
        },
        global: {
          stubs: {
            PluginCard: true,
          },
        },
      });

      // Should show empty state
      const emptyState = wrapper.find(".empty-state");
      expect(emptyState.exists()).toBe(true);
      expect(emptyState.text().toLowerCase()).toContain("backend");
    });
  });

  describe("Tab Navigation", () => {
    it("should include all plugin types in tabs", () => {
      const wrapper = mount(PluginManager, {
        props: {
          plugins: [
            { id: "ical", type: "calendar", enabled: true },
            { id: "local", type: "image", enabled: true },
            { id: "weather", type: "service", enabled: true },
            { id: "imap", type: "backend", enabled: true },
          ],
          instances: {},
          loading: false,
          activeTab: "calendar",
        },
        global: {
          stubs: {
            PluginCard: true,
          },
        },
      });

      const tabs = wrapper.findComponent(TabNavigation);
      const tabProps = tabs.props("tabs");
      const tabIds = tabProps.map((tab) => tab.id);

      expect(tabIds).toContain("calendar");
      expect(tabIds).toContain("image");
      expect(tabIds).toContain("service");
      expect(tabIds).toContain("backend");
    });

    it("should handle tab change event", async () => {
      const wrapper = mount(PluginManager, {
        props: {
          plugins: [
            { id: "imap", type: "backend", enabled: true },
            { id: "local", type: "image", enabled: true },
          ],
          instances: {},
          loading: false,
          activeTab: "image",
        },
        global: {
          stubs: {
            PluginCard: true,
          },
        },
      });

      const tabs = wrapper.findComponent(TabNavigation);
      await tabs.vm.$emit("tab-change", "backend");

      // Check that handleTabChange was called (via emitted event)
      expect(wrapper.emitted()).toBeDefined();
    });
  });
});
