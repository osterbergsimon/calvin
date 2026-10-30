import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/composables", async () => {
  const { ref } = await import("vue");
  return {
    usePlugins: () => ({
      plugins: ref([]),
      pluginInstances: ref({}),
      loadingPlugins: ref(false),
      loadPlugins: vi.fn(),
    }),
  };
});

import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import { useKiosksStore } from "@/stores/kiosks";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/settings/shared/ScreenRegionEditor.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const region = (over = {}) => ({ size: 50, instanceIds: [], ...over });
const config = () => ({
  orientation: "landscape",
  clockBarEnabled: true,
  clockBarPosition: "top",
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [
      {
        id: "home",
        name: "Home",
        layout: {
          preset: "split_two",
          direction: "row",
          regions: [region({ id: "r1", kind: "calendar" }), region({ id: "r2", kind: "photos" })],
        },
      },
      {
        id: "week",
        name: "Week",
        layout: { preset: "single", direction: "row", regions: [region({ id: "r3" })] },
      },
    ],
  },
});

const mountEditor = async (kiosks = []) => {
  const store = useKiosksStore();
  store.kiosks = kiosks;
  store.loadKiosks = vi.fn();
  const w = mount(ScreenRegionEditor, {
    props: { config: config(), open: true },
    global: { stubs: { teleport: true } },
  });
  await flushPromises();
  return w;
};

const ruleBody = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(STYLE)?.[1] ?? "";
};

describe("ScreenRegionEditor page tabs", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it("renders one line per tab: name then where it shows", async () => {
    const w = await mountEditor([
      { id: "kitchen", overrides: { displayName: "Kitchen", availableScreens: ["home"] } },
      { id: "hall", overrides: { displayName: "Hallway", availableScreens: ["week"] } },
    ]);
    const tab = w.findAll('[data-test="page-tab"]')[0];
    expect(tab.find(".sre-tab-name").text()).toBe("Home");
    expect(tab.find(".sre-tab-screens").text()).toBe("Kitchen");
    // The name and the screens text are siblings on one row, not a stacked body.
    expect(tab.find(".sre-tab-body").exists()).toBe(false);
    expect(tab.findAll(".sre-tab-name, .sre-tab-screens")).toHaveLength(2);
  });

  it("marks the active tab selected and draws the underline", async () => {
    const w = await mountEditor();
    const tabs = w.findAll('[data-test="page-tab"]');
    expect(tabs[0].classes()).toContain("is-active");
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(tabs[1].attributes("aria-selected")).toBe("false");
    expect(ruleBody(".sre-tab.is-active::after")).toContain("height: var(--tab-indicator)");
    expect(ruleBody(".sre-tab.is-active::after")).toContain("background: var(--focus)");
  });

  it("truncates the screens text at 16ch with the full text in the title", async () => {
    const w = await mountEditor([
      { id: "kitchen", overrides: { displayName: "Kitchen", availableScreens: ["home"] } },
      { id: "hall", overrides: { displayName: "Hallway", availableScreens: ["home"] } },
      { id: "office", overrides: { displayName: "Office", availableScreens: ["week"] } },
    ]);
    const tab = w.findAll('[data-test="page-tab"]')[0];
    const screens = tab.find(".sre-tab-screens");
    expect(screens.text()).toBe("Kitchen, Hallway");
    expect(tab.attributes("title")).toContain("Kitchen, Hallway");
    expect(tab.attributes("aria-label")).toBe("Home, shown on Kitchen, Hallway");
    expect(ruleBody(".sre-tab-screens")).toContain("max-width: 16ch");
    expect(ruleBody(".sre-tab-screens")).toContain("text-overflow: ellipsis");
  });

  it("says Not shown in warn ink instead of the old wording", async () => {
    const w = await mountEditor([{ id: "hall", overrides: { availableScreens: [] } }]);
    const screens = w.findAll(".sre-tab-screens")[0];
    expect(screens.text()).toBe("Not shown");
    expect(screens.classes()).toContain("is-not-shown");
    expect(ruleBody(".sre-tab-screens.is-not-shown")).toContain("var(--warn)");
  });

  it("drops the orange dot", async () => {
    const w = await mountEditor();
    expect(w.find(".sre-tab-dot").exists()).toBe(false);
  });

  it("renders + Page as a labelled ghost button", async () => {
    const w = await mountEditor();
    const add = w.find(".sre-tab-add");
    expect(add.attributes("aria-label")).toBe("Add page");
    expect(add.text()).toBe("Page");
    expect(add.find("svg").exists()).toBe(true);
    expect(ruleBody(".sre-tab-add")).toContain("background: transparent");
    expect(ruleBody(".sre-tab-add")).not.toContain("dashed");
  });

  it("drops the screens text on phones but keeps the name", async () => {
    const w = await mountEditor();
    expect(ruleBody(".sre-root.size-phone .sre-tab-screens")).toContain("display: none");
    expect(w.find(".sre-tab-name").text()).toBe("Home");
  });
});

describe("ScreenRegionEditor inspector headings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sessionStorage.clear();
  });

  it("heads the page inspector Page · Home", async () => {
    const w = await mountEditor();
    expect(w.find(".ins-mode h3").text()).toBe("Page");
    expect(w.find(".ins-mode .ins-sub").text()).toBe("· Home");
  });

  it("does not repeat Page as a group label under the heading", async () => {
    const w = await mountEditor();
    const groupLabels = w.findAll(".ins-h").map(n => n.text());
    expect(groupLabels).not.toContain("Page");
  });

  it("heads the region inspector Region · in Home", async () => {
    const w = await mountEditor();
    const node = w.findAllComponents({ name: "RegionNode" })[0];
    node.vm.$emit("select", "r1");
    await flushPromises();
    expect(w.find(".ins-mode h3").text()).toBe("Region");
    expect(w.find(".ins-mode .ins-sub").text()).toBe("· in Home");
  });

  it("heads the clock bar Clock bar · on Home", async () => {
    const w = await mountEditor();
    await w.find(".sre-clockbar").trigger("click");
    await flushPromises();
    expect(w.find(".ins-mode h3").text()).toBe("Clock bar");
    expect(w.find(".ins-mode .ins-sub").text()).toBe("· on Home");
  });

  it("does not render the old chip heading", async () => {
    const w = await mountEditor();
    expect(w.find(".chip.screen").exists()).toBe(false);
  });
});

describe("eyebrows stay outside cards", () => {
  const read = path =>
    readFileSync(resolve(__dirname, `../../../../src/components/settings/${path}`), "utf-8");
  const rule = (source, selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}(?![\\w-])\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? "";
  };

  it("keeps the section titles and the stage tag uppercase", () => {
    for (const path of ["shell/SettingsSection.vue", "shell/CollapsibleSettingsSection.vue"]) {
      const source = read(path);
      expect(source).toContain(".settings-section__eyebrow");
      expect(source).toContain("text-transform: uppercase");
    }
    expect(rule(SOURCE, ".sre-stage-tag")).toContain("text-transform: uppercase");
  });

  it("renders the screen page sub-labels in sentence case", () => {
    for (const path of ["categories/ScreensSettings.vue", "categories/DefaultScreenSettings.vue"]) {
      const body = rule(read(path), ".screen-pages__scope-label");
      expect(body).not.toContain("text-transform: uppercase");
      expect(body).toContain("font-size: var(--fs-sm)");
      expect(body).toContain("font-weight: 600");
    }
  });

  it("renders the region inspector sub-headings in sentence case", () => {
    for (const path of [
      "shared/regions/RegionInspector.vue",
      "shared/regions/ScreenInspector.vue",
    ]) {
      const body = rule(read(path), ".ins-h");
      expect(body).not.toContain("text-transform: uppercase");
      expect(body).not.toContain("letter-spacing");
      expect(body).toContain("color: var(--ink)");
    }
  });

  it("leaves only the section titles and the stage tag uppercase under settings", () => {
    const dir = resolve(__dirname, "../../../../src/components");
    const offenders = [];
    const walk = path => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = `${path}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith(".vue") && /components\/settings/.test(child)) {
          const source = readFileSync(child, "utf-8");
          const style = source.slice(source.indexOf("<style"), source.indexOf("</style>"));
          if (style.includes("text-transform: uppercase")) offenders.push(child);
        }
      }
    };
    walk(dir);
    offenders.sort();
    expect(offenders).toEqual([
      `${dir}/settings/shared/ScreenRegionEditor.vue`,
      `${dir}/settings/shell/CollapsibleSettingsSection.vue`,
      `${dir}/settings/shell/SettingsSection.vue`,
    ]);
  });
});
