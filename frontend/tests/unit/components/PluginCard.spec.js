/**
 * Unit tests for the shell-native PluginCard (calvin-svo, CLV-44).
 * Plugins is about the add-ons themselves: a card counts its sources and links
 * to Content instead of listing them (§3.3).
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PluginCard from "@/components/settings/specialized/PluginCard.vue";

const STUBS = {
  PluginFieldRenderer: true,
  PluginActions: true,
  PluginSections: true,
};

const normalized = text => text.replace(/\s+/g, " ").trim();

const mountCard = (plugin, instances = [], extra = {}) =>
  mount(PluginCard, {
    props: { plugin, instances, ...extra },
    global: { stubs: STUBS },
  });

const service = (over = {}) => ({
  id: "svc",
  name: "Mealie",
  type: "service",
  enabled: true,
  _installed: true,
  ...over,
});

describe("PluginCard source count", () => {
  it("says the add-on is turned off and how many sources it hides", () => {
    const w = mountCard(service({ enabled: false }), [{ id: "a", running: true }]);
    expect(w.find(".pc-summary").text()).toBe("Turned off · 1 source");
    expect(w.find(".pc-dot").exists()).toBe(false);
  });

  it("links a used add-on to its sources in Content", async () => {
    const w = mountCard(service(), [{ id: "a" }, { id: "b" }]);
    const link = w.find(".pc-summary .pc-link");
    expect(link.text()).toBe("Used by 2 sources");
    await link.trigger("click");
    expect(w.emitted("used-by")?.[0]).toEqual(["svc"]);
  });

  it("counts calendar providers as sources too", () => {
    const cal = { id: "ical", name: "iCal", type: "calendar", enabled: true, _installed: true };
    const w = mountCard(cal, [{ id: "a" }, { id: "b" }]);
    expect(w.find(".pc-summary").text()).toBe("Used by 2 sources");
  });

  it("invites the first source when none exist", async () => {
    const w = mountCard(service(), []);
    expect(normalized(w.find(".pc-summary").text())).toBe("Not used yet · Add a source");
    await w.find(".pc-summary .pc-link").trigger("click");
    expect(w.emitted("add-source")?.[0]).toEqual(["svc"]);
  });

  it("says a theme is chosen in Appearance", async () => {
    const w = mountCard({ id: "ocean", name: "Ocean", type: "theme", enabled: true });
    expect(normalized(w.find(".pc-summary").text())).toBe("Choose it in Dashboard › Appearance");
    await w.find(".pc-summary .pc-link").trigger("click");
    expect(w.emitted("open-appearance")?.length).toBe(1);
  });

  it("says a theme that needs an update cannot be chosen yet", async () => {
    const w = mountCard({
      id: "midnight",
      name: "Midnight",
      type: "theme",
      enabled: true,
      selectable: false,
    });
    expect(normalized(w.find(".pc-summary").text())).toBe(
      "Needs an update to work with this Calvin."
    );
    expect(w.find(".pc-summary .pc-link").exists()).toBe(false);
    expect(w.emitted("open-appearance")).toBeUndefined();
  });

  it("says a background add-on has no sources", () => {
    const w = mountCard({ id: "imap", name: "IMAP", type: "backend", enabled: true });
    expect(w.find(".pc-summary").text()).toBe("Works in the background. No sources to add.");
  });

  it("never lists the sources themselves", () => {
    const w = mountCard(service(), [{ id: "a", name: "Family albums", running: true }]);
    expect(w.text()).not.toContain("Family albums");
  });
});

describe("PluginCard controls", () => {
  it("emits toggle-enabled from the switch", () => {
    const w = mountCard(service(), []);
    w.findComponent({ name: "ToggleSwitch" }).vm.$emit("update:modelValue", false);
    expect(w.emitted("toggle-enabled")?.[0]).toEqual(["svc", false]);
  });

  it("hides the Settings disclosure when the plugin is disabled", () => {
    const w = mountCard(service({ enabled: false, common_config_schema: { x: {} } }), []);
    expect(w.find("[aria-expanded]").exists()).toBe(false);
  });

  it("shows the Settings disclosure when the add-on has plugin-level settings", () => {
    const w = mountCard(service({ common_config_schema: { api_key: { type: "string" } } }), []);
    expect(w.find("[aria-expanded]").exists()).toBe(true);
  });

  it("offers Uninstall only for installed plugins", () => {
    const installed = mountCard(service({ _installed: true }), []);
    expect(installed.find(".pc-btn--danger").exists()).toBe(true);
    const builtin = mountCard(service({ _installed: false }), []);
    expect(builtin.find(".pc-btn--danger").exists()).toBe(false);
  });
});

describe("PluginCard update (§3.3)", () => {
  it("offers Update when the catalog has a newer version", async () => {
    const w = mountCard(service({ version: "1.0.0" }), [], { latestVersion: "2.0.0" });
    const button = w.find(".pc-btn--update");
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe("Update to v2.0.0");

    await button.trigger("click");
    expect(w.emitted("update")?.[0]).toEqual(["svc"]);
  });

  it("compares versions as semver, not as strings", () => {
    expect(
      mountCard(service({ version: "1.9.0" }), [], { latestVersion: "1.10.0" })
        .find(".pc-btn--update")
        .exists()
    ).toBe(true);
    expect(
      mountCard(service({ version: "1.10.0" }), [], { latestVersion: "1.9.0" })
        .find(".pc-btn--update")
        .exists()
    ).toBe(false);
  });

  it("does not offer Update for the same version", () => {
    const w = mountCard(service({ version: "1.0.0" }), [], { latestVersion: "1.0.0" });
    expect(w.find(".pc-btn--update").exists()).toBe(false);
  });

  it("shows progress while the update installs", () => {
    const w = mountCard(service({ version: "1.0.0" }), [], {
      latestVersion: "2.0.0",
      updating: true,
    });
    const button = w.find(".pc-btn--update");
    expect(button.text()).toBe("Updating…");
    expect(button.attributes("disabled")).toBeDefined();
  });
});
