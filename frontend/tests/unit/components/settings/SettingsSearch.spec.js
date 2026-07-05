import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
vi.mock("@/components/settings/settingsRegistry", () => ({
  filterSettingsDestinations: q =>
    q === "orient"
      ? [
          {
            id: "dashboard-layout",
            label: "Layout",
            path: "Display / Layout",
            category: "dashboard",
          },
        ]
      : [],
}));
import SettingsSearch from "@/components/settings/shell/SettingsSearch.vue";

describe("SettingsSearch", () => {
  // The '/' hint uses useTouchCapability → useConfigStore, so a Pinia is required.
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows results and emits jump on selection", async () => {
    const w = mount(SettingsSearch);
    await w.get("input").setValue("orient");
    const results = w.findAll(".settings-search__result");
    expect(results).toHaveLength(1);
    await results[0].trigger("click");
    expect(w.emitted("jump")[0][0].id).toBe("dashboard-layout");
    expect(w.get("input").element.value).toBe("");
  });
  it("shows nothing for an empty query", async () => {
    const w = mount(SettingsSearch);
    expect(w.find(".settings-search__result").exists()).toBe(false);
  });
});
