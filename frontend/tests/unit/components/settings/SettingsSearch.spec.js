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
      : q === "all"
        ? [
            {
              id: "dashboard-layout",
              label: "Layout",
              path: "Display / Layout",
              category: "dashboard",
            },
            {
              id: "dashboard-ui",
              label: "Look",
              path: "Display / Look",
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

  it("lists plain results instead of a listbox", async () => {
    const w = mount(SettingsSearch);
    await w.get("input").setValue("orient");
    expect(w.find('[role="listbox"]').exists()).toBe(false);
    expect(w.find('[role="option"]').exists()).toBe(false);
    const list = w.get("ul.settings-search__results");
    expect(list.attributes("aria-label")).toBe("Search results");
    expect(list.findAll("li button")).toHaveLength(1);
    // The "/" hint is decoration, not a control.
    expect(w.get("kbd").attributes("aria-hidden")).toBe("true");
    expect(w.get("kbd").attributes("aria-label")).toBeUndefined();
  });

  it("keeps one polite results line mounted and updates its count", async () => {
    const w = mount(SettingsSearch);
    // Mounted before any query, so its text changes are announced.
    const count = w.get(".settings-search__count");
    expect(count.attributes("aria-live")).toBe("polite");
    expect(count.text()).toBe("");
    await w.get("input").setValue("orient");
    expect(w.get(".settings-search__count").text()).toBe("1 result");
    await w.get("input").setValue("all");
    expect(w.get(".settings-search__count").text()).toBe("2 results");
    await w.get("input").setValue("zzz");
    expect(w.get(".settings-search__count").text()).toBe("No results");
  });

  it("says nothing for a blank query, so clearing the search is quiet", async () => {
    const w = mount(SettingsSearch);
    await w.get("input").setValue("   ");
    expect(w.get(".settings-search__count").text()).toBe("");
    await w.get("input").setValue("orient");
    expect(w.get(".settings-search__count").text()).toBe("1 result");
    await w.get("input").setValue("");
    expect(w.get(".settings-search__count").text()).toBe("");
  });
});
