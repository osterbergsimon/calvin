/**
 * Unit tests for ConnectionIndicator component
 * Tests functionality: displays connection status correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ConnectionIndicator from "@/components/ConnectionIndicator.vue";
import { useConnectionStore } from "@/stores/connection";

describe("ConnectionIndicator", () => {
  let connectionStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    connectionStore = useConnectionStore();
    // Reset to online state
    connectionStore.isOnline = true;
    connectionStore.isBackendOnline = true;
  });

  describe("Visibility", () => {
    it("should not render when fully online", () => {
      connectionStore.isOnline = true;
      connectionStore.isBackendOnline = true;

      const wrapper = mount(ConnectionIndicator);

      expect(wrapper.find(".connection-indicator").exists()).toBe(false);
    });

    it("should render when browser is offline", () => {
      connectionStore.isOnline = false;
      connectionStore.isBackendOnline = false;

      const wrapper = mount(ConnectionIndicator);

      expect(wrapper.find(".connection-indicator").exists()).toBe(true);
      expect(wrapper.find(".connection-indicator").classes()).toContain(
        "offline",
      );
    });

    it("should render when backend is offline but browser is online", () => {
      connectionStore.isOnline = true;
      connectionStore.isBackendOnline = false;

      const wrapper = mount(ConnectionIndicator);

      expect(wrapper.find(".connection-indicator").exists()).toBe(true);
      expect(wrapper.find(".connection-indicator").classes()).toContain(
        "backend-offline",
      );
    });
  });

  describe("Connection Status Display", () => {
    it("should display offline icon and label when browser is offline", () => {
      connectionStore.isOnline = false;
      connectionStore.isBackendOnline = false;

      const wrapper = mount(ConnectionIndicator, {
        props: { showLabel: true },
      });

      const indicator = wrapper.find(".connection-indicator");
      expect(indicator.text()).toContain("📡");
      expect(indicator.text()).toContain("Offline");
      expect(indicator.attributes("title")).toBe(
        "No internet connection. Using cached data.",
      );
    });

    it("should display warning icon and label when backend is offline", () => {
      connectionStore.isOnline = true;
      connectionStore.isBackendOnline = false;

      const wrapper = mount(ConnectionIndicator, {
        props: { showLabel: true },
      });

      const indicator = wrapper.find(".connection-indicator");
      expect(indicator.text()).toContain("⚠️");
      expect(indicator.text()).toContain("No Connection");
      expect(indicator.attributes("title")).toBe(
        "Backend server unreachable. Using cached data.",
      );
    });

    it("should hide label when showLabel prop is false", () => {
      connectionStore.isOnline = false;
      connectionStore.isBackendOnline = false;

      const wrapper = mount(ConnectionIndicator, {
        props: { showLabel: false },
      });

      expect(wrapper.find(".connection-label").exists()).toBe(false);
      expect(wrapper.find(".connection-icon").exists()).toBe(true);
    });
  });

  describe("Tooltip", () => {
    it("should show correct tooltip for offline state", () => {
      connectionStore.isOnline = false;
      connectionStore.isBackendOnline = false;

      const wrapper = mount(ConnectionIndicator);

      expect(wrapper.find(".connection-indicator").attributes("title")).toBe(
        "No internet connection. Using cached data.",
      );
    });

    it("should show correct tooltip for backend offline state", () => {
      connectionStore.isOnline = true;
      connectionStore.isBackendOnline = false;

      const wrapper = mount(ConnectionIndicator);

      expect(wrapper.find(".connection-indicator").attributes("title")).toBe(
        "Backend server unreachable. Using cached data.",
      );
    });
  });
});
