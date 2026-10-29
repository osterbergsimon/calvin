/** Tests for keyboard store. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeyboardStore } from "@/stores/keyboard";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

describe("Keyboard Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("initializes with a flat empty map", () => {
    const store = useKeyboardStore();
    expect(store.mappings).toEqual({});
    expect(store.captureActive).toBe(false);
  });

  it("fetchMappings stores the flat map", async () => {
    api.get.mockResolvedValue({ data: { mappings: { KEY_1: "generic_prev" } } });
    const store = useKeyboardStore();
    await store.fetchMappings();
    expect(store.mappings).toEqual({ KEY_1: "generic_prev" });
    expect(api.get).toHaveBeenCalledWith("/keyboard/mappings");
  });

  it("setMapping PUTs a single key and updates local state", async () => {
    api.put.mockResolvedValue({ data: {} });
    const store = useKeyboardStore();
    await store.setMapping("KEY_2", "generic_next");
    expect(api.put).toHaveBeenCalledWith("/keyboard/mappings/KEY_2", {
      action: "generic_next",
    });
    expect(store.mappings.KEY_2).toBe("generic_next");
  });

  it("removeMapping DELETEs a key and drops it locally", async () => {
    api.delete.mockResolvedValue({ data: {} });
    const store = useKeyboardStore();
    store.mappings.KEY_2 = "generic_next";
    await store.removeMapping("KEY_2");
    expect(api.delete).toHaveBeenCalledWith("/keyboard/mappings/KEY_2");
    expect(store.mappings.KEY_2).toBeUndefined();
  });

  it("beginCapture resolves with the captured key", async () => {
    const store = useKeyboardStore();
    const p = store.beginCapture();
    expect(store.captureActive).toBe(true);
    store.handleCaptureKey("KEY_S");
    await expect(p).resolves.toBe("KEY_S");
    expect(store.captureActive).toBe(false);
  });

  it("Escape cancels capture and resolves null", async () => {
    const store = useKeyboardStore();
    const p = store.beginCapture();
    store.handleCaptureKey("KEY_ESCAPE");
    await expect(p).resolves.toBeNull();
    expect(store.captureActive).toBe(false);
  });
});
