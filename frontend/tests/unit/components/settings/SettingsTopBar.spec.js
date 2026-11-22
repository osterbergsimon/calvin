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

  it("hides the save pill and phone button while locked", () => {
    const w = mount(SettingsTopBar, {
      props: {
        categoryLabel: "Display",
        saveState: "idle",
        showPhone: true,
        locked: true,
      },
    });
    expect(w.find(".settings-topbar__pill").exists()).toBe(false);
    expect(w.find('[data-action="phone"]').exists()).toBe(false);
    expect(w.get(".settings-topbar__location").text()).toBe("Display");
    expect(w.get('[data-action="done"]').exists()).toBe(true);
  });

  it("draws the phone hand-off and Done with the shared Button", () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", saveState: "idle", showPhone: true },
    });
    const phone = w.get('[data-action="phone"]');
    expect(phone.classes()).toContain("btn");
    expect(phone.classes()).toContain("btn--sm");
    expect(phone.text()).toBe("Use your phone");
    // The label is the text, so no duplicate accessible name.
    expect(phone.attributes("aria-label")).toBeUndefined();
    const done = w.get('[data-action="done"]');
    expect(done.classes()).toContain("btn--primary");
    expect(done.text()).toBe("Done");
  });

  it("announces the wordmark as the Calvin image", () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Display", saveState: "idle" },
    });
    const mark = w.get(".settings-topbar__wordmark");
    expect(mark.attributes("role")).toBe("img");
    expect(mark.attributes("aria-label")).toBe("Calvin");
  });

  it("exposes the full save wording as the pill's accessible name", () => {
    // On a phone only the dot shows, so the wording must live on the pill.
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Screens", saveState: "idle" },
    });
    const pill = w.get(".settings-topbar__pill");
    expect(pill.attributes("role")).toBe("status");
    expect(pill.attributes("aria-label")).toBe("All changes saved");
    expect(pill.attributes("title")).toBe("All changes saved");
    // The visible label stays for wider screens.
    expect(w.get(".settings-topbar__pill-label").text()).toBe("All changes saved");
  });

  it("updates the accessible name with the save state", async () => {
    const w = mount(SettingsTopBar, {
      props: { categoryLabel: "Screens", saveState: "saving" },
    });
    expect(w.get(".settings-topbar__pill").attributes("aria-label")).toBe("Saving…");
    await w.setProps({ saveState: "error" });
    expect(w.get(".settings-topbar__pill").attributes("aria-label")).toBe("Error");
  });
});
