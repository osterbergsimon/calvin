import { describe, it, expect, beforeEach } from "vitest";
import { nextTick } from "vue";
import { usePersistedSettingTab } from "@/composables/usePersistedSettingTab";

describe("usePersistedSettingTab", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("uses the default tab when no stored value exists", () => {
    const { activeTab } = usePersistedSettingTab("settings_test_tab", "main");

    expect(activeTab.value).toBe("main");
  });

  it("uses the stored tab when present", () => {
    sessionStorage.setItem("settings_test_tab", "advanced");

    const { activeTab } = usePersistedSettingTab("settings_test_tab", "main");

    expect(activeTab.value).toBe("advanced");
  });

  it("persists tab updates", async () => {
    const { setActiveTab } = usePersistedSettingTab("settings_test_tab", "main");

    setActiveTab("advanced");
    await nextTick();

    expect(sessionStorage.getItem("settings_test_tab")).toBe("advanced");
  });
});
