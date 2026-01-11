/** Tests for keyboard store. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeyboardStore } from "@/stores/keyboard";
import axios from "axios";

// Mock axios
vi.mock("axios");

describe("Keyboard Store", () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with default values", () => {
      const store = useKeyboardStore();

      expect(store.mappings).toEqual({});
      expect(store.keyboardType).toBe("7-button");
      expect(store.available).toBe(false);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });
  });

  describe("fetchMappings", () => {
    it("should fetch keyboard mappings without type", async () => {
      const mockMappings = {
        mappings: {
          button1: "calendar_next",
          button2: "calendar_prev",
        },
      };

      axios.get.mockResolvedValue({ data: mockMappings });

      const store = useKeyboardStore();
      const result = await store.fetchMappings();

      expect(axios.get).toHaveBeenCalledWith("/api/keyboard/mappings");
      expect(store.mappings).toEqual(mockMappings.mappings);
      expect(store.available).toBe(true);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      expect(result).toEqual(mockMappings);
    });

    it("should fetch keyboard mappings with specific type", async () => {
      const mockMappings = {
        mappings: {
          button1: "next",
          button2: "prev",
        },
      };

      axios.get.mockResolvedValue({ data: mockMappings });

      const store = useKeyboardStore();
      await store.fetchMappings("5-button");

      expect(axios.get).toHaveBeenCalledWith(
        "/api/keyboard/mappings?keyboard_type=5-button",
      );
      expect(store.mappings).toEqual(mockMappings.mappings);
      expect(store.available).toBe(true);
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      axios.get.mockRejectedValue(error);

      const store = useKeyboardStore();
      await store.fetchMappings().catch(() => {});

      expect(store.error).toBe("Network error");
      expect(store.available).toBe(false);
      expect(store.loading).toBe(false);
    });

    it("should handle empty mappings", async () => {
      axios.get.mockResolvedValue({ data: {} });

      const store = useKeyboardStore();
      await store.fetchMappings();

      expect(store.mappings).toEqual({});
      expect(store.available).toBe(true);
    });
  });

  describe("updateMappings", () => {
    it("should update keyboard mappings", async () => {
      const newMappings = {
        button1: "next",
        button2: "prev",
      };

      const mockResponse = {
        data: { mappings: newMappings },
      };

      axios.post.mockResolvedValue(mockResponse);

      const store = useKeyboardStore();
      const result = await store.updateMappings(newMappings);

      // Test functionality: mappings are updated in store
      expect(store.mappings).toEqual(newMappings);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
      // The store returns response.data which contains mappings
      expect(result.mappings).toEqual(newMappings);
    });

    it("should handle update errors", async () => {
      const error = new Error("Update failed");
      axios.post.mockRejectedValue(error);

      const store = useKeyboardStore();

      await expect(store.updateMappings({})).rejects.toThrow("Update failed");
      expect(store.error).toBe("Update failed");
      expect(store.loading).toBe(false);
    });
  });

  describe("setKeyboardType", () => {
    it("should set keyboard type", () => {
      const store = useKeyboardStore();

      store.setKeyboardType("5-button");

      expect(store.keyboardType).toBe("5-button");
    });

    it("should update keyboard type multiple times", () => {
      const store = useKeyboardStore();

      store.setKeyboardType("5-button");
      expect(store.keyboardType).toBe("5-button");

      store.setKeyboardType("7-button");
      expect(store.keyboardType).toBe("7-button");
    });
  });
});
