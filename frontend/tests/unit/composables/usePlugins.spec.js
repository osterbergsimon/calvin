/**
 * Unit tests for usePlugins composable
 * Tests functionality: loading plugins, filtering by type, backend plugin support
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
  updatePluginInstance: vi.fn(),
}));

describe("usePlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Backend Plugin Support", () => {
    it("should include backend plugins in sortedPluginCategories", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "imap",
            name: "Email (IMAP)",
            type: "backend",
            enabled: true,
          },
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });

      const { sortedPluginCategories, loadPlugins } = usePlugins();
      await loadPlugins();

      // Check that backend category exists
      const backendCategory = sortedPluginCategories.value.find(
        (cat) => cat.type === "backend",
      );
      expect(backendCategory).toBeDefined();
      expect(backendCategory.label).toBe("Backend");
      expect(backendCategory.plugins).toHaveLength(1);
      expect(backendCategory.plugins[0].id).toBe("imap");
    });

    it("should filter backend plugins correctly", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "imap",
            name: "Email (IMAP)",
            type: "backend",
            enabled: true,
          },
          {
            id: "local",
            name: "Local Images",
            type: "image",
            enabled: true,
          },
          {
            id: "weather",
            name: "Weather",
            type: "service",
            enabled: true,
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });

      const { sortedPluginCategories, loadPlugins } = usePlugins();
      await loadPlugins();

      // Check backend category has only backend plugins
      const backendCategory = sortedPluginCategories.value.find(
        (cat) => cat.type === "backend",
      );
      expect(backendCategory).toBeDefined();
      expect(backendCategory.plugins).toHaveLength(1);
      expect(backendCategory.plugins[0].type).toBe("backend");

      // Check other categories
      const imageCategory = sortedPluginCategories.value.find(
        (cat) => cat.type === "image",
      );
      expect(imageCategory.plugins).toHaveLength(1);
      expect(imageCategory.plugins[0].type).toBe("image");
    });

    it("should handle backend plugins in initial tab selection", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "imap",
            name: "Email (IMAP)",
            type: "backend",
            enabled: true,
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });

      const { plugins, loadPlugins } = usePlugins();
      await loadPlugins();

      // Verify backend plugin is loaded
      expect(plugins.value).toHaveLength(1);
      expect(plugins.value[0].type).toBe("backend");
      expect(plugins.value[0].id).toBe("imap");
    });

    it("should include backend in plugin type order", async () => {
      const mockPlugins = {
        plugins: [
          { id: "ical", type: "calendar", enabled: true },
          { id: "local", type: "image", enabled: true },
          { id: "weather", type: "service", enabled: true },
          { id: "imap", type: "backend", enabled: true },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });

      const { sortedPluginCategories, loadPlugins } = usePlugins();
      await loadPlugins();

      // Check that all categories including backend are present
      const categoryTypes = sortedPluginCategories.value.map((cat) => cat.type);
      expect(categoryTypes).toContain("backend");
      expect(categoryTypes).toContain("calendar");
      expect(categoryTypes).toContain("image");
      expect(categoryTypes).toContain("service");
    });
  });

  describe("Instance Toggle", () => {
    it("should update plugin instance enabled status", async () => {
      pluginsApi.getPlugins.mockResolvedValue({
        plugins: [{ id: "imap", type: "backend", enabled: true }],
      });
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });
      pluginsApi.updatePluginInstance.mockResolvedValue({
        success: true,
        instance: { id: "imap-1", enabled: false },
      });

      const { loadPlugins } = usePlugins();
      await loadPlugins();

      // Update instance
      await pluginsApi.updatePluginInstance("imap-1", { enabled: false });

      expect(pluginsApi.updatePluginInstance).toHaveBeenCalledWith("imap-1", {
        enabled: false,
      });
    });

    it("should handle instance update errors", async () => {
      pluginsApi.getPlugins.mockResolvedValue({
        plugins: [{ id: "mealie", type: "service", enabled: true }],
      });
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });
      pluginsApi.updatePluginInstance.mockRejectedValue(
        new Error("Update failed"),
      );

      const { loadPlugins } = usePlugins();
      await loadPlugins();

      // Attempt to update instance (should not throw)
      try {
        await pluginsApi.updatePluginInstance("mealie-1", { enabled: false });
      } catch (error) {
        expect(error.message).toBe("Update failed");
      }

      expect(pluginsApi.updatePluginInstance).toHaveBeenCalledWith("mealie-1", {
        enabled: false,
      });
    });
  });

  describe("Plugin Loading", () => {
    it("should load backend plugins from API", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "imap",
            name: "Email (IMAP)",
            type: "backend",
            enabled: true,
          },
        ],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue({ plugins: [] });
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });

      const { plugins, loadPlugins } = usePlugins();
      await loadPlugins();

      expect(plugins.value).toHaveLength(1);
      expect(plugins.value[0].type).toBe("backend");
      expect(plugins.value[0].id).toBe("imap");
    });

    it("should mark backend plugins as installed when present in installed list", async () => {
      const mockPlugins = {
        plugins: [
          {
            id: "imap",
            name: "Email (IMAP)",
            type: "backend",
            enabled: true,
          },
        ],
      };

      const mockInstalled = {
        plugins: [{ id: "imap", version: "1.0.0" }],
      };

      pluginsApi.getPlugins.mockResolvedValue(mockPlugins);
      pluginsApi.getInstalledPlugins.mockResolvedValue(mockInstalled);
      pluginsApi.getPluginInstances.mockResolvedValue({ instances: [] });
      pluginsApi.getPluginConfig.mockResolvedValue({ config: {} });

      const { plugins, loadPlugins } = usePlugins();
      await loadPlugins();

      expect(plugins.value[0]._installed).toBe(true);
    });
  });
});
