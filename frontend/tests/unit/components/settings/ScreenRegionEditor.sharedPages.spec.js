import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import { useKiosksStore } from "@/stores/kiosks";

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

const region = (id, kind) => ({ id, kind, instanceIds: [], size: 50 });
const page = (id, name) => ({
  id,
  name,
  activeRegionId: `${id}-region`,
  layout: {
    version: 1,
    preset: "single",
    regions: [region(`${id}-region`, "calendar")],
  },
});

const baseConfig = (over = {}) => ({
  orientation: "landscape",
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [page("home", "Home"), page("photos", "Photos")],
  },
  ...over,
});

const kiosk = (id, over = {}) => ({
  id,
  hostname: `${id}-pi`,
  overrides: {},
  ...over,
});

const mountEditor = async ({
  config = baseConfig(),
  kiosks = [],
  initialPreviewKiosk = null,
} = {}) => {
  const store = useKiosksStore();
  store.kiosks = kiosks;
  store.loadKiosks = vi.fn();
  store.fetchOverrides = vi.fn(
    async id => store.kiosks.find(item => item.id === id)?.overrides ?? {}
  );
  const saving = [];
  let wrapper;
  const saveConfig = vi.fn(async patch => {
    saving.push("config");
    Object.assign(config, patch);
    await wrapper?.setProps({ config: JSON.parse(JSON.stringify(config)) });
  });
  store.saveOverrides = vi.fn(async (id, overrides) => {
    saving.push("list");
    const target = store.kiosks.find(item => item.id === id);
    if (target) target.overrides = overrides;
  });
  wrapper = mount(ScreenRegionEditor, {
    props: {
      config: JSON.parse(JSON.stringify(config)),
      open: true,
      initialPreviewKiosk,
    },
    global: {
      stubs: { teleport: true, RegionNode: true, RegionInspector: true },
      provide: { saveConfig },
    },
  });
  await flushPromises();
  return { w: wrapper, store, config, saveConfig, saving };
};

const addPage = async w => {
  await w.find(".sre-tab-add").trigger("click");
  await flushPromises();
};

const deleteButton = w => w.findAll("button").find(button => button.text() === "Delete page");

const shownSummary = w => w.find('[data-test="shown-on-summary"]').text();

describe("Pages & regions shared pages", () => {
  beforeEach(() => sessionStorage.clear());

  it("adds from a screen by pinning Default and giving only that screen the page", async () => {
    const { w, store, saveConfig, saving } = await mountEditor({
      initialPreviewKiosk: "kitchen",
      kiosks: [kiosk("kitchen", { overrides: { displayName: "Kitchen" } })],
    });
    await addPage(w);

    const patch = saveConfig.mock.calls[0][0];
    const newPage = patch.dashboardScreens.screens[2];
    expect(patch.availableScreens).toEqual(["home", "photos"]);
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      displayName: "Kitchen",
      availableScreens: ["home", "photos", newPage.id],
    });
    // The catalog exists before the list that refers to it.
    expect(saving.slice(0, 2)).toEqual(["config", "list"]);
    expect(w.find('[data-test="shown-on-notice"]').text()).toContain("Shown on Kitchen only.");
  });

  it("adds from Default with an all-pages list and keeps it null", async () => {
    const { w, saveConfig, store } = await mountEditor();
    await addPage(w);
    const patch = saveConfig.mock.calls[0][0];
    expect(patch).not.toHaveProperty("availableScreens");
    expect(patch.dashboardScreens.screens).toHaveLength(3);
    expect(store.saveOverrides).not.toHaveBeenCalled();
  });

  it("appends to Default's restricted list when adding from Default", async () => {
    const { w, saveConfig } = await mountEditor({
      config: baseConfig({ availableScreens: ["home"] }),
    });
    await addPage(w);
    const patch = saveConfig.mock.calls[0][0];
    const newPage = patch.dashboardScreens.screens[2];
    expect(patch.availableScreens).toEqual(["home", newPage.id]);
  });

  it("duplicates from a screen without leaking the copy to Default", async () => {
    const { w, store, saveConfig } = await mountEditor({
      initialPreviewKiosk: "kitchen",
      kiosks: [kiosk("kitchen", { overrides: { displayName: "Kitchen" } })],
    });
    const duplicate = w.findAll("button").find(button => button.text() === "Duplicate");
    await duplicate.trigger("click");
    await flushPromises();

    const patch = saveConfig.mock.calls[0][0];
    const copy = patch.dashboardScreens.screens.find(screen => screen.name === "Home copy");
    expect(copy).toBeTruthy();
    expect(patch.availableScreens).toEqual(["home", "photos"]);
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      displayName: "Kitchen",
      availableScreens: ["home", "photos", copy.id],
    });
  });

  it("summarises Shown on with screen names and browsers", async () => {
    const { w } = await mountEditor({
      config: baseConfig({ availableScreens: ["home"] }),
      kiosks: [
        kiosk("kitchen", { overrides: { displayName: "Kitchen", availableScreens: ["photos"] } }),
        kiosk("hall", { overrides: { displayName: "Hallway" } }),
      ],
    });
    expect(shownSummary(w)).toBe("Hallway · browsers");
    expect(w.text()).toContain("Every screen that shows this page uses this name.");
  });

  it("says All screens when Default and every screen show the page", async () => {
    const { w } = await mountEditor({
      kiosks: [
        kiosk("kitchen", { overrides: { displayName: "Kitchen" } }),
        kiosk("hall", { overrides: { displayName: "Hallway" } }),
      ],
    });
    expect(shownSummary(w)).toBe("All screens");
  });

  it("Change… toggles a screen's list and marks it Changed here", async () => {
    const { w, store } = await mountEditor({
      kiosks: [kiosk("hall", { overrides: { displayName: "Hallway" } })],
    });
    await w.find('[data-test="change-shown-on"]').trigger("click");
    await flushPromises();
    const toggle = w.find('[aria-label="Show this page on Hallway"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    await flushPromises();

    expect(store.saveOverrides).toHaveBeenCalledWith("hall", {
      displayName: "Hallway",
      availableScreens: ["photos"],
    });
    expect(store.kiosks[0].overrides).toEqual({
      displayName: "Hallway",
      availableScreens: ["photos"],
    });
  });

  it("Change… writes Default's list and drops it to null when every page is on", async () => {
    const config = baseConfig({ availableScreens: ["home"] });
    config.dashboardScreens.activeScreenId = "photos";
    const { w, saveConfig } = await mountEditor({ config });
    await w.find('[data-test="change-shown-on"]').trigger("click");
    await flushPromises();
    await w.find('[aria-label="Show this page on Browsers & new screens"]').trigger("click");
    await flushPromises();
    expect(saveConfig).toHaveBeenCalledWith({ availableScreens: null });
  });

  it("refuses to turn off the last page a target shows", async () => {
    const { w, store } = await mountEditor({
      kiosks: [
        kiosk("hall", {
          overrides: { displayName: "Hallway", availableScreens: ["home"] },
        }),
      ],
    });
    await w.find('[data-test="change-shown-on"]').trigger("click");
    await flushPromises();
    await w.find('[aria-label="Show this page on Hallway"]').trigger("click");
    await flushPromises();
    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(w.find('[data-test="shown-on-error"]').text()).toBe("Pick at least one page.");
  });

  it("hides the page on the scope screen", async () => {
    const { w, store } = await mountEditor({
      initialPreviewKiosk: "kitchen",
      kiosks: [
        kiosk("kitchen", {
          overrides: { displayName: "Kitchen", availableScreens: ["home", "photos"] },
        }),
      ],
    });
    const hide = w.find('[data-test="hide-page-btn"]');
    expect(hide.text()).toBe("Hide on Kitchen");
    await hide.trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      displayName: "Kitchen",
      availableScreens: ["photos"],
    });
  });

  it("hides the page from browsers and new screens on Default", async () => {
    const { w, saveConfig } = await mountEditor();
    const hide = w.find('[data-test="hide-page-btn"]');
    expect(hide.text()).toBe("Hide from browsers & new screens");
    await hide.trigger("click");
    await flushPromises();
    expect(saveConfig).toHaveBeenCalledWith({ availableScreens: ["photos"] });
  });

  it("deletes without a confirm when no other target shows the page", async () => {
    const { w, saveConfig } = await mountEditor({
      config: baseConfig({ availableScreens: ["photos"] }),
    });
    await deleteButton(w).trigger("click");
    await flushPromises();
    const patch = saveConfig.mock.calls[0][0];
    expect(patch.dashboardScreens.screens.map(screen => screen.id)).toEqual(["photos"]);
    expect(w.findAllComponents({ name: "ConfirmModal" }).some(c => c.props("show"))).toBe(false);
  });

  it("confirms Delete everywhere when others show the page, with Hide as the alternative", async () => {
    const { w } = await mountEditor({
      initialPreviewKiosk: "kitchen",
      kiosks: [
        kiosk("kitchen", { overrides: { displayName: "Kitchen" } }),
        kiosk("hall", { overrides: { displayName: "Hallway" } }),
      ],
    });
    await deleteButton(w).trigger("click");
    await flushPromises();
    const confirm = w.findAllComponents({ name: "ConfirmModal" }).find(c => c.props("show"));
    expect(confirm.props("title")).toBe("Delete “Home” everywhere?");
    expect(confirm.props("message")).toBe(
      "Hallway and browsers also show it. To take it off Kitchen only, use Hide on Kitchen."
    );
    expect(confirm.props("alternativeText")).toBe("Hide on Kitchen");
  });

  it("Delete everywhere strips the page from Default and every screen list", async () => {
    const { w, store, saveConfig } = await mountEditor({
      config: baseConfig({ availableScreens: ["home", "photos"], defaultScreenId: "home" }),
      kiosks: [
        kiosk("kitchen", { overrides: { availableScreens: ["home", "photos"] } }),
        kiosk("hall", { overrides: { availableScreens: ["home"] } }),
      ],
    });
    await deleteButton(w).trigger("click");
    await flushPromises();
    const confirm = w.findAllComponents({ name: "ConfirmModal" }).find(c => c.props("show"));
    confirm.vm.$emit("confirm");
    await flushPromises();

    const patch = saveConfig.mock.calls[0][0];
    expect(patch.dashboardScreens.screens.map(screen => screen.id)).toEqual(["photos"]);
    expect(patch.availableScreens).toEqual(["photos"]);
    expect(patch.defaultScreenId).toBeNull();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { availableScreens: ["photos"] });
    expect(store.saveOverrides).toHaveBeenCalledWith("hall", {});
  });
});

describe("Pages & regions shared-pages copy", () => {
  it("uses the new subtitle, stage caption and Preview on label", async () => {
    const { w } = await mountEditor();
    expect(w.text()).toContain("Pages are shared by your screens");
    expect(w.find('[data-test="stage-caption"]').text()).toBe(
      "Drag regions to swap them, dividers to resize, the clock bar to reposition"
    );
    expect(w.find(".pill__label").text()).toBe("Browsers & new screens");
  });
});
