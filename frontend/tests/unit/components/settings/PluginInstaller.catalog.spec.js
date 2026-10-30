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
    path: "mealie",
    _installed: false,
  },
  {
    id: "test_plugin",
    name: "Test Plugin",
    type: "service",
    version: "2.0.0",
    description: "A basic test plugin for plugin installation testing",
    keywords: ["test", "example"],
    path: "test_plugin",
    _installed: false,
  },
  {
    id: "immich",
    name: "Immich",
    type: "image",
    version: "2.1.0",
    description: "Albums from your Immich server.",
    keywords: ["photos"],
    path: "immich",
    _installed: true,
    _installedVersion: "2.0.0",
  },
  {
    id: "weather",
    name: "Weather",
    type: "service",
    version: "1.0.0",
    description: "Temperature and forecast in the clock bar.",
    keywords: ["weather"],
    path: "weather",
    _installed: true,
    _installedVersion: "1.0.0",
  },
];

const mountWith = (props = {}) =>
  mount(PluginInstaller, {
    props: {
      repoUrl: "https://github.com/x/y",
      branch: "main",
      catalogPlugins: CATALOG,
      catalogRepoUrl: "https://github.com/osterbergsimon/calvin-plugins",
      ...props,
    },
  });

describe("PluginInstaller catalog (§3.3)", () => {
  it("lists the catalog on open, with nothing to type first", () => {
    const w = mountWith({ devMode: false });
    expect(w.find(".catalog-title").text()).toBe("Install from the Calvin catalog");
    expect(w.text()).toContain("Mealie");
    expect(w.text()).toContain("Recipes and meal plans from your Mealie server");
  });

  it("hides the plugin repo's test fixtures from end users", () => {
    const w = mountWith({ devMode: false });
    expect(w.text()).not.toContain("Test Plugin");
  });

  it("still lists test plugins in dev mode", () => {
    const w = mountWith({ devMode: true });
    expect(w.text()).toContain("Test Plugin");
  });

  it("labels the kind in plain words, never the raw type", () => {
    const w = mountWith({ devMode: false });
    expect(w.find('[data-catalog-plugin-id="mealie"]').text()).toContain("Web page & app");
  });

  it("installs from the catalog repository, not the other-repository field", async () => {
    const w = mountWith({ devMode: false });
    await w.find('[data-catalog-plugin-id="mealie"] button.btn-install').trigger("click");

    expect(w.emitted("install")[0][0]).toMatchObject({
      path: "mealie",
      repoUrl: "https://github.com/osterbergsimon/calvin-plugins",
      branch: "main",
    });
  });

  it("offers Update only when the catalog version is newer", () => {
    const w = mountWith({ devMode: false });

    const immich = w.find('[data-catalog-plugin-id="immich"]');
    expect(immich.text()).toContain("Update");

    // Same version: no Update, the row says Installed and links to Content.
    const weather = w.find('[data-catalog-plugin-id="weather"]');
    expect(weather.text()).not.toContain("Update");
    expect(weather.text()).toContain("Installed ✓");
    expect(weather.text()).toContain("Add a source");
  });

  it("emits add-source for an installed plugin", async () => {
    const w = mountWith({ devMode: false });
    const weather = w.find('[data-catalog-plugin-id="weather"]');
    const addButton = weather.findAll("button").find(button => button.text() === "Add a source");
    await addButton.trigger("click");

    expect(w.emitted("add-source")[0]).toEqual(["weather"]);
  });

  it("never asks for a restart: contract 1.0 installs are live", () => {
    const w = mountWith({ devMode: false, requiresRestart: true });
    expect(w.find(".restart-notice").exists()).toBe(false);
    expect(w.text().toLowerCase()).not.toContain("restart");
    expect(w.text()).not.toContain("systemctl");
  });
});
