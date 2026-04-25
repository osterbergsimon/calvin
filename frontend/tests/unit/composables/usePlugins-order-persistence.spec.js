/**
 * Unit tests for plugin ordering persistence in usePlugins composable
 * Tests that display_order is correctly loaded from API and persists across reloads
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePlugins } from "@/composables/usePlugins";
import * as pluginsApi from "@/services/pluginsApi";

// Mock pluginsApi
vi.mock("@/services/pluginsApi", () => ({
  getPlugins: vi.fn(),
  getInstalledPlugins: vi.fn(),
  getPluginInstances: vi.fn(),
  getPluginConfig: vi.fn(),
  updatePlugin: vi.fn(),
  updatePluginInstanceOrder: vi.fn(),
  updatePluginInstancesOrder: vi.fn(),
}));

describe("usePlugins - Order Persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading display_order from plugin list", () => {
    it("should load display_order from plugin's common_config_schema", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "1",
            },
          },
          {
            id: "picsum",
            name: "Picsum",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "0",
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({});

      const { imagePluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      // Verify display orders were loaded from common_config_schema
      expect(imagePluginDisplayOrders.value["local"]).toBe(1);
      expect(imagePluginDisplayOrders.value["picsum"]).toBe(0);
    });

    it("should fallback to config API if display_order not in schema", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {}, // No display_order
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ display_order: "5" });

      const { imagePluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      // Should use value from config API
      expect(imagePluginDisplayOrders.value["local"]).toBe(5);
    });

    it("should prefer schema value over config API value", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "10", // Schema has 10
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ display_order: "5" }); // Config has 5

      const { imagePluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      // Should prefer schema value (10) over config value (5)
      expect(imagePluginDisplayOrders.value["local"]).toBe(10);
    });

    it("should handle integer display_order values in schema", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: 7, // Integer, not string
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({});

      const { imagePluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      expect(imagePluginDisplayOrders.value["local"]).toBe(7);
    });

    it("should default to 0 if display_order is missing", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {}, // No display_order
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({}); // No display_order

      const { imagePluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      expect(imagePluginDisplayOrders.value["local"]).toBe(0);
    });
  });

  describe("Service plugin display_order", () => {
    it("should load display_order for service plugins", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "weather",
            name: "Weather",
            type: "service",
            enabled: true,
            common_config_schema: {
              display_order: "3",
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({});

      const { pluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      expect(pluginDisplayOrders.value["weather"]).toBe(3);
    });
  });

  describe("Updating display_order", () => {
    it("should update display_order and persist in local state", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "0",
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({});
      pluginsApi.updatePlugin.mockResolvedValue({ success: true });

      const { imagePluginDisplayOrders, loadPlugins, updateImagePluginOrder } = usePlugins();
      await loadPlugins();

      expect(imagePluginDisplayOrders.value["local"]).toBe(0);

      // Update order
      await updateImagePluginOrder("local", 5);

      // Verify API was called with correct data
      expect(pluginsApi.updatePlugin).toHaveBeenCalledWith("local", {
        display_order: "5",
      });

      // Verify local state was updated
      expect(imagePluginDisplayOrders.value["local"]).toBe(5);
    });
  });

  describe("Plugin sorting with display_order", () => {
    it("should sort image plugins by display_order after loading", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "picsum",
            name: "Picsum",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "1",
            },
          },
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "0",
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({});

      const { imagePluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      // Verify orders are loaded correctly
      expect(imagePluginDisplayOrders.value["local"]).toBe(0);
      expect(imagePluginDisplayOrders.value["picsum"]).toBe(1);

      // Note: The actual sorting happens in ImagesTab component
      // This test just verifies the data is loaded correctly
    });
  });

  describe("Reloading plugins preserves display_order", () => {
    it("should maintain display_order values after reload", async () => {
      // First load
      const mockPlugins1 = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "2",
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins1);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({});

      const { imagePluginDisplayOrders, loadPlugins } = usePlugins();
      await loadPlugins();

      expect(imagePluginDisplayOrders.value["local"]).toBe(2);

      // Simulate page reload - plugins are loaded again with same values
      const mockPlugins2 = {
        plugins: [
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
            common_config_schema: {
              display_order: "2", // Same value as before
            },
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins2);
      pluginsApi.getPluginConfig.mockResolvedValue({});

      await loadPlugins();

      // Order should still be 2 after "reload"
      expect(imagePluginDisplayOrders.value["local"]).toBe(2);
    });
  });
});
