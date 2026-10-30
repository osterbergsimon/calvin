import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PluginInstaller from "@/components/settings/specialized/PluginInstaller.vue";

const CATALOG = [
  {
    id: "mealie",
    name: "Mealie",
    type: "service",
    version: "1.0.0",
    description: "Recipes and meal plans from your Mealie server",
    keywords: ["recipes"],
  },
  {
    id: "test_plugin",
    name: "Test Plugin",
    type: "service",
    version: "2.0.0",
    description: "A basic test plugin for plugin installation testing",
    keywords: ["test", "example"],
  },
];

const mountWith = props =>
  mount(PluginInstaller, {
    props: {
      repoUrl: "https://github.com/x/y",
      branch: "main",
      availablePlugins: CATALOG,
      ...props,
    },
  });

describe("PluginInstaller catalog (F8)", () => {
  it("hides the plugin repo's test fixtures from end users", () => {
    const w = mountWith({ devMode: false });
    expect(w.text()).toContain("Mealie");
    expect(w.text()).not.toContain("Test Plugin");
  });

  it("still lists test plugins in dev mode", () => {
    const w = mountWith({ devMode: true });
    expect(w.text()).toContain("Test Plugin");
  });

  it("shows each plugin's description", () => {
    const w = mountWith({ devMode: false });
    expect(w.text()).toContain("Recipes and meal plans from your Mealie server");
  });

  it("labels the kind in plain words, never the raw type", () => {
    const w = mountWith({ devMode: false });
    expect(w.find(".plugin-type-badge-small").text()).toBe("Web page & app");
  });

  it("never asks for a restart: contract 1.0 installs are live", () => {
    // The legacy manifest flag used to echo back as requires_restart and raised
    // a "Server Restart Required" box with a systemctl command, though installs
    // register the plugin type immediately.
    const w = mountWith({ devMode: false, requiresRestart: true });
    expect(w.find(".restart-notice").exists()).toBe(false);
    expect(w.text().toLowerCase()).not.toContain("restart");
    expect(w.text()).not.toContain("systemctl");
  });
});
