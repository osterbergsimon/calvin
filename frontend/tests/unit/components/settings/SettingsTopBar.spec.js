import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingsTopBar from "@/components/settings/shell/SettingsTopBar.vue";

describe("SettingsTopBar", () => {
  it("shows breadcrumb with category and section", () => {
    const w = mount(SettingsTopBar, { props: { categoryLabel: "Display", sectionLabel: "Appearance", saveState: "saved" } });
    const t = w.text();
    expect(t).toContain("Settings");
    expect(t).toContain("Display");
    expect(t).toContain("Appearance");
  });
  it("omits the section crumb when no section", () => {
    const w = mount(SettingsTopBar, { props: { categoryLabel: "Display", sectionLabel: "", saveState: "idle" } });
    expect(w.findAll(".topbar__crumb").length).toBe(2); // Settings + Display
  });
  it("emits done", async () => {
    const w = mount(SettingsTopBar, { props: { categoryLabel: "Display", saveState: "idle" } });
    await w.get('[data-action="done"]').trigger("click");
    expect(w.emitted("done")).toHaveLength(1);
  });
});
