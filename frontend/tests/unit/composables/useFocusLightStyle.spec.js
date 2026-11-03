import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  useFocusLightStyle,
  FOCUS_LIGHT_STYLE_STORAGE_KEY,
} from "@/composables/useFocusLightStyle";
import { useConfigStore } from "@/stores/config";

vi.mock("@/services/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));

describe("useFocusLightStyle (calvin-fufd)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  it("defaults to the cheap performance style", () => {
    expect(useFocusLightStyle().style.value).toBe("performance");
  });

  it("follows the screen's server value (a kiosk override arrives in merged config)", () => {
    useConfigStore().focusLightStyle = "full";
    expect(useFocusLightStyle().style.value).toBe("full");
  });

  it("uses this browser's own choice", async () => {
    const { set, style } = useFocusLightStyle();
    await set("full");
    expect(window.localStorage.getItem(FOCUS_LIGHT_STYLE_STORAGE_KEY)).toBe("full");
    expect(style.value).toBe("full");
  });

  it("falls back to performance for an unknown value", () => {
    useConfigStore().focusLightStyle = "sparkles";
    expect(useFocusLightStyle().style.value).toBe("performance");
  });
});
