import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useEffectsLevel } from "@/composables/useEffectsLevel";
import { useConfigStore } from "@/stores/config";

const attribute = () => document.documentElement.getAttribute("data-effects");

describe("useEffectsLevel (calvin-uudb)", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-effects");
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  it("applies Full in a plain browser before any config arrives", async () => {
    const { syncWithConfig, current } = useEffectsLevel();
    syncWithConfig();
    await nextTick();

    expect(current.value).toBe("full");
    expect(attribute()).toBe("full");
  });

  it("applies Standard on a set-up kiosk", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "kitchen");
    const { syncWithConfig, current } = useEffectsLevel();
    syncWithConfig();
    await nextTick();

    expect(current.value).toBe("standard");
    expect(attribute()).toBe("standard");
  });

  it("updates the html attribute when the effective config changes", async () => {
    const config = useConfigStore();
    const { syncWithConfig } = useEffectsLevel();
    syncWithConfig();
    await nextTick();
    expect(attribute()).toBe("full");

    config.effectsLevel = "standard";
    await nextTick();
    expect(attribute()).toBe("standard");

    config.effectsLevel = "full";
    await nextTick();
    expect(attribute()).toBe("full");
  });

  it("follows a kiosk override that arrives in the merged config", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "kitchen");
    const config = useConfigStore();
    const { syncWithConfig } = useEffectsLevel();
    syncWithConfig();
    await nextTick();
    expect(attribute()).toBe("standard");

    config.effectsLevel = "full";
    await nextTick();
    expect(attribute()).toBe("full");
  });
});
