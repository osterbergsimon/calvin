/**
 * Unit tests for the shell-native PluginCard (calvin-svo).
 * Focus: the operational status line + dot, the one piece of live
 * information surfaced without expanding the card.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PluginCard from "@/components/settings/specialized/PluginCard.vue";

const STUBS = {
  PluginFieldRenderer: true,
  PluginActions: true,
  PluginSections: true,
  PluginInstances: true,
};

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

describe("PluginCard status line", () => {
  it("reads 'Disabled' and hides the dot when the plugin is off", () => {
    const w = mountCard(service({ enabled: false }), [{ id: "a", running: true }]);
    expect(w.find(".pc-summary").text()).toBe("Disabled");
    expect(w.find(".pc-dot").exists()).toBe(false);
  });

  it("summarizes running services and shows an ok dot when all are up", () => {
    const w = mountCard(service(), [
      { id: "a", running: true },
      { id: "b", running: true },
    ]);
    expect(w.find(".pc-summary").text()).toBe("2 instances · 2/2 running");
    expect(w.find(".pc-dot--ok").exists()).toBe(true);
  });

  it("shows a warn dot when only some instances are running", () => {
    const w = mountCard(service(), [
      { id: "a", running: true },
      { id: "b", running: false },
    ]);
    expect(w.find(".pc-summary").text()).toBe("2 instances · 1/2 running");
    expect(w.find(".pc-dot--warn").exists()).toBe(true);
  });

  it("shows an err dot when nothing is running", () => {
    const w = mountCard(service(), [{ id: "a", running: false }]);
    expect(w.find(".pc-dot--err").exists()).toBe(true);
  });

  it("shows calendar providers as managed from Content Sources", async () => {
    const cal = { id: "ical", name: "iCal", type: "calendar", enabled: true, _installed: true };
    const w = mountCard(cal, [
      { id: "a", enabled: true },
      { id: "b", enabled: true },
    ]);
    expect(w.find(".pc-summary").text()).toBe("2 sources managed in Content Sources");
    expect(w.find(".pc-dot").exists()).toBe(false);
    expect(w.find(".pc-provider-note").text()).toContain("Content Sources / Calendars");
    await w.find(".pc-btn--primary").trigger("click");
    expect(w.emitted("manage-calendar-sources")?.length).toBe(1);
  });

  it("invites the first instance when none exist", () => {
    const w = mountCard(service(), []);
    expect(w.find(".pc-summary").text()).toBe("No instances yet");
  });

  it("labels themes plainly", () => {
    const w = mountCard({ id: "ocean", name: "Ocean", type: "theme", enabled: true });
    expect(w.find(".pc-summary").text()).toBe("Theme");
  });
});

describe("PluginCard controls", () => {
  it("emits toggle-enabled from the switch", () => {
    const w = mountCard(service(), []);
    w.findComponent({ name: "ToggleSwitch" }).vm.$emit("update:modelValue", false);
    expect(w.emitted("toggle-enabled")?.[0]).toEqual(["svc", false]);
  });

  it("hides the Settings disclosure when the plugin is disabled", () => {
    const w = mountCard(service({ enabled: false }), [{ id: "a" }]);
    expect(w.find("[aria-expanded]").exists()).toBe(false);
  });

  it("shows the Settings disclosure when enabled with settings", () => {
    const w = mountCard(service({ instance_config_schema: { url: { type: "string" } } }), []);
    expect(w.find("[aria-expanded]").exists()).toBe(true);
  });

  it("offers Uninstall only for installed plugins", () => {
    const installed = mountCard(service({ _installed: true }), []);
    expect(installed.find(".pc-btn--danger").exists()).toBe(true);
    const builtin = mountCard(service({ _installed: false }), []);
    expect(builtin.find(".pc-btn--danger").exists()).toBe(false);
  });
});
