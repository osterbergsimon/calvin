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

  describe("getTheme in-flight sharing (calvin-hwjz)", () => {
    it("makes one request per theme id while one is in flight", async () => {
      let resolve;
      api.get.mockReturnValue(new Promise(r => (resolve = r)));
      const store = useThemesStore();

      const calls = [store.getTheme("ocean"), store.getTheme("ocean"), store.getTheme("ocean")];
      resolve({ data: { id: "ocean" } });
      const results = await Promise.all(calls);

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith("/plugins/ocean");
      expect(results).toEqual([{ id: "ocean" }, { id: "ocean" }, { id: "ocean" }]);
    });

    it("keeps different themes apart and refetches after settling", async () => {
      api.get.mockImplementation(async url => ({ data: { id: url } }));
      const store = useThemesStore();

      await Promise.all([store.getTheme("ocean"), store.getTheme("forest")]);
      await store.getTheme("ocean");

      expect(api.get).toHaveBeenCalledTimes(3);
    });

    it("lets a failed request be retried", async () => {
      api.get.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ data: { id: "x" } });
      const store = useThemesStore();

      await expect(store.getTheme("x")).rejects.toThrow("boom");
      await expect(store.getTheme("x")).resolves.toEqual({ id: "x" });
    });
  });
});
