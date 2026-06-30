import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";

describe("config store — Cycle B focus-light keys", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("defaults preserve a sensible resting state", () => {
    const store = useConfigStore();
    expect(store.displayName).toBe("");
    expect(store.focusLightMode).toBe("interaction");
    expect(store.focusLightDimOthers).toBe(true);
  });

  it("setters update state", () => {
    const store = useConfigStore();
    store.setDisplayName("Vardagsrummet");
    store.setFocusLightMode("always");
    store.setFocusLightDimOthers(false);
    expect(store.displayName).toBe("Vardagsrummet");
    expect(store.focusLightMode).toBe("always");
    expect(store.focusLightDimOthers).toBe(false);
  });

  it("applyConfigPayload via updateConfig syncs the keys from a backend payload", async () => {
    const store = useConfigStore();
    await store.updateConfig({
      displayName: "Köket",
      focusLightMode: "off",
      focusLightDimOthers: false,
    });
    expect(store.displayName).toBe("Köket");
    expect(store.focusLightMode).toBe("off");
    expect(store.focusLightDimOthers).toBe(false);
  });
});
