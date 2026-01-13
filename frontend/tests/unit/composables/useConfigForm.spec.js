/**
 * Unit tests for useConfigForm composable
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigForm } from "@/composables/useConfigForm";
import { useConfigStore } from "@/stores/config";
import { useKeyboardStore } from "@/stores/keyboard";
import * as configApi from "@/services/configApi";

// Mock stores
vi.mock("@/stores/config", () => ({
  useConfigStore: vi.fn(),
}));

vi.mock("@/stores/keyboard", () => ({
  useKeyboardStore: vi.fn(),
}));

// Mock configApi
vi.mock("@/services/configApi", () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

describe("useConfigForm", () => {
  let mockConfigStore;
  let mockKeyboardStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    mockConfigStore = {
      updateConfig: vi.fn().mockResolvedValue({}),
    };

    mockKeyboardStore = {
      keyboardType: "7-button",
      setKeyboardType: vi.fn(),
    };

    useConfigStore.mockReturnValue(mockConfigStore);
    useKeyboardStore.mockReturnValue(mockKeyboardStore);
  });

  describe("Initialization", () => {
    it("should initialize with empty config by default", () => {
      const form = useConfigForm();

      expect(form.localConfig.value).toEqual({});
      expect(form.saving.value).toBe(false);
      expect(form.error.value).toBe("");
    });

    it("should initialize with initial config", () => {
      const initialConfig = {
        orientation: "portrait",
        calendarSplit: 75,
      };

      const form = useConfigForm(initialConfig);

      expect(form.localConfig.value).toEqual(initialConfig);
    });
  });

  describe("loadConfig", () => {
    it("should load config from API", async () => {
      const mockConfig = {
        orientation: "landscape",
        calendar_split: 70,
        show_ui: true,
        theme_mode: "auto",
      };

      configApi.getConfig.mockResolvedValue(mockConfig);

      const form = useConfigForm();
      await form.loadConfig();

      expect(configApi.getConfig).toHaveBeenCalled();
      expect(form.localConfig.value.orientation).toBe("landscape");
      expect(form.localConfig.value.calendarSplit).toBe(70);
      expect(form.localConfig.value.showUI).toBe(true);
      expect(form.localConfig.value.themeMode).toBe("auto");
      expect(form.error.value).toBe("");
    });

    it("should handle both camelCase and snake_case", async () => {
      const mockConfig = {
        orientation_flipped: true,
        calendarSplit: 72,
        show_ui: false,
      };

      configApi.getConfig.mockResolvedValue(mockConfig);

      const form = useConfigForm();
      await form.loadConfig();

      expect(form.localConfig.value.orientationFlipped).toBe(true);
      expect(form.localConfig.value.calendarSplit).toBe(72);
      expect(form.localConfig.value.showUI).toBe(false);
    });

    it("should use defaults when values are missing", async () => {
      const mockConfig = {};

      configApi.getConfig.mockResolvedValue(mockConfig);

      const form = useConfigForm();
      await form.loadConfig();

      expect(form.localConfig.value.orientation).toBe("landscape");
      expect(form.localConfig.value.calendarSplit).toBe(70);
      expect(form.localConfig.value.showUI).toBe(true);
    });

    it("should update keyboard store when keyboard type is set", async () => {
      const mockConfig = {
        keyboardType: "5-button",
      };

      configApi.getConfig.mockResolvedValue(mockConfig);

      const form = useConfigForm();
      await form.loadConfig();

      expect(mockKeyboardStore.setKeyboardType).toHaveBeenCalledWith(
        "5-button",
      );
    });

    it("should handle errors when loading config", async () => {
      const error = new Error("Failed to load config");
      configApi.getConfig.mockRejectedValue(error);

      const form = useConfigForm();
      await form.loadConfig();

      expect(form.error.value).toBe("Failed to load configuration");
    });

    it("should parse display schedule string", async () => {
      const mockSchedule = [
        { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" },
      ];
      const mockConfig = {
        display_schedule: JSON.stringify(mockSchedule),
      };

      configApi.getConfig.mockResolvedValue(mockConfig);

      const form = useConfigForm();
      await form.loadConfig();

      expect(form.localConfig.value.displaySchedule).toEqual(mockSchedule);
    });

    it("should use display schedule object directly", async () => {
      const mockSchedule = [
        { day: 0, enabled: true, onTime: "06:00", offTime: "22:00" },
      ];
      const mockConfig = {
        displaySchedule: mockSchedule,
      };

      configApi.getConfig.mockResolvedValue(mockConfig);

      const form = useConfigForm();
      await form.loadConfig();

      expect(form.localConfig.value.displaySchedule).toEqual(mockSchedule);
    });
  });

  describe("updateConfigValue", () => {
    it("should update a single config value", async () => {
      const mockConfig = { orientation: "landscape" };
      configApi.getConfig.mockResolvedValue(mockConfig);
      configApi.updateConfig.mockResolvedValue({});
      mockConfigStore.updateConfig.mockResolvedValue({});

      const form = useConfigForm();
      await form.loadConfig();

      await form.updateConfigValue("orientation", "portrait");

      expect(form.localConfig.value.orientation).toBe("portrait");
      expect(configApi.updateConfig).toHaveBeenCalledWith({
        orientation: "portrait",
      });
      expect(mockConfigStore.updateConfig).toHaveBeenCalledWith({
        orientation: "portrait",
      });
    });

    it("should set saving flag during update", async () => {
      const mockConfig = {};
      configApi.getConfig.mockResolvedValue(mockConfig);
      configApi.updateConfig.mockResolvedValue({});
      mockConfigStore.updateConfig.mockResolvedValue({});

      const form = useConfigForm();
      await form.loadConfig();

      const updatePromise = form.updateConfigValue("orientation", "portrait");

      expect(form.saving.value).toBe(true);

      await updatePromise;

      expect(form.saving.value).toBe(false);
    });

    it("should handle errors when updating config", async () => {
      const mockConfig = {};
      configApi.getConfig.mockResolvedValue(mockConfig);
      const error = new Error("Update failed");
      configApi.updateConfig.mockRejectedValue(error);

      const form = useConfigForm();
      await form.loadConfig();

      await expect(
        form.updateConfigValue("orientation", "portrait"),
      ).rejects.toThrow("Update failed");

      expect(form.error.value).toBe("Update failed");
      expect(form.saving.value).toBe(false);
    });

    it("should extract error detail from response", async () => {
      const mockConfig = {};
      configApi.getConfig.mockResolvedValue(mockConfig);
      const error = {
        response: {
          data: {
            detail: "Validation error",
          },
        },
        message: "Request failed",
      };
      configApi.updateConfig.mockRejectedValue(error);

      const form = useConfigForm();
      await form.loadConfig();

      await expect(
        form.updateConfigValue("orientation", "portrait"),
      ).rejects.toThrow();

      expect(form.error.value).toBe("Validation error");
    });
  });

  describe("updateConfig", () => {
    it("should update multiple config values", async () => {
      const mockConfig = {};
      configApi.getConfig.mockResolvedValue(mockConfig);
      configApi.updateConfig.mockResolvedValue({});
      mockConfigStore.updateConfig.mockResolvedValue({});

      const form = useConfigForm();
      await form.loadConfig();

      const updates = {
        orientation: "portrait",
        calendarSplit: 75,
      };

      await form.updateConfig(updates);

      expect(form.localConfig.value.orientation).toBe("portrait");
      expect(form.localConfig.value.calendarSplit).toBe(75);
      expect(configApi.updateConfig).toHaveBeenCalledWith(updates);
      expect(mockConfigStore.updateConfig).toHaveBeenCalledWith(updates);
    });

    it("should merge updates with existing config", async () => {
      const mockConfig = {
        orientation: "landscape",
        calendarSplit: 70,
      };
      configApi.getConfig.mockResolvedValue(mockConfig);
      configApi.updateConfig.mockResolvedValue({});
      mockConfigStore.updateConfig.mockResolvedValue({});

      const form = useConfigForm();
      await form.loadConfig();

      await form.updateConfig({
        calendarSplit: 75,
      });

      expect(form.localConfig.value.orientation).toBe("landscape");
      expect(form.localConfig.value.calendarSplit).toBe(75);
    });
  });

  describe("saveConfig", () => {
    it("should save config without updates parameter", async () => {
      const mockConfig = {
        orientation: "landscape",
      };
      configApi.getConfig.mockResolvedValue(mockConfig);
      configApi.updateConfig.mockResolvedValue({});
      mockConfigStore.updateConfig.mockResolvedValue({});

      const form = useConfigForm();
      await form.loadConfig();

      await form.saveConfig();

      expect(configApi.updateConfig).toHaveBeenCalledWith(
        form.localConfig.value,
      );
      expect(mockConfigStore.updateConfig).toHaveBeenCalledWith(
        form.localConfig.value,
      );
    });

    it("should save specific updates", async () => {
      const mockConfig = {};
      configApi.getConfig.mockResolvedValue(mockConfig);
      configApi.updateConfig.mockResolvedValue({});
      mockConfigStore.updateConfig.mockResolvedValue({});

      const form = useConfigForm();
      await form.loadConfig();

      const updates = { orientation: "portrait" };

      await form.saveConfig(updates);

      expect(configApi.updateConfig).toHaveBeenCalledWith(updates);
      expect(mockConfigStore.updateConfig).toHaveBeenCalledWith(updates);
    });
  });

  describe("resetConfig", () => {
    it("should reset config to store values", async () => {
      const mockConfig = {
        orientation: "landscape",
        calendarSplit: 70,
      };
      configApi.getConfig.mockResolvedValue(mockConfig);

      const form = useConfigForm();
      form.localConfig.value = {
        orientation: "portrait",
        calendarSplit: 75,
      };

      await form.resetConfig();

      expect(form.localConfig.value.orientation).toBe("landscape");
      expect(form.localConfig.value.calendarSplit).toBe(70);
      expect(configApi.getConfig).toHaveBeenCalledTimes(1); // Once in resetConfig (loadConfig is called)
    });
  });
});
