/** Tests for themes store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useThemesStore } from "@/stores/themes";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

// Mock logger
vi.mock("@/utils/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import { logError } from "@/utils/logger";

describe("Themes Store", () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with default values", () => {
      const store = useThemesStore();

      expect(store.selectedTheme).toBe(null);
    });
  });

  describe("getTheme", () => {
    it("should get a specific theme by ID", async () => {
      const mockTheme = { id: "theme1", name: "Theme 1", variables: {} };
      api.get.mockResolvedValue({ data: mockTheme });

      const store = useThemesStore();
      const result = await store.getTheme("theme1");

      expect(api.get).toHaveBeenCalledWith("/plugins/theme1");
      expect(result).toEqual(mockTheme);
    });

    it("should handle API errors", async () => {
      const error = new Error("Theme not found");
      api.get.mockRejectedValue(error);

      const store = useThemesStore();

      await expect(store.getTheme("theme1")).rejects.toThrow("Theme not found");
      expect(logError).toHaveBeenCalled();
    });
  });

  describe("setSelectedTheme", () => {
    it("should set selected theme", () => {
      const store = useThemesStore();

      store.setSelectedTheme("theme1");

      expect(store.selectedTheme).toBe("theme1");
    });
  });
});
