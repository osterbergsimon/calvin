import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingsTopBar from "@/components/settings/shell/SettingsTopBar.vue";

describe("SettingsTopBar", () => {
  it("shows the active section as the location indicator", () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", sectionLabel: "Appearance", saveState: "saved" },
    });
    const indicator = w.get(".settings-topbar__location");
    expect(indicator.text()).toBe("Appearance");
    // breadcrumb crumbs are gone
    expect(w.findAll(".topbar__crumb").length).toBe(0);
  });

  it("falls back to the category label when no section is active", () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", sectionLabel: "", saveState: "idle" },
    });
    expect(w.get(".settings-topbar__location").text()).toBe("Display");
  });

  it("emits done", async () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", saveState: "idle" },
    });
    await w.get('[data-action="done"]').trigger("click");
    expect(w.emitted("done")).toHaveLength(1);
  });
});
