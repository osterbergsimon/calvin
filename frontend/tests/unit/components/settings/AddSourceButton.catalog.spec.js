/**
 * §3.7 — installing an add-on from the Content provider picker.
 *
 * The picker may only offer the official Calvin catalog: installs run
 * third-party code on the server, so another repository or local path stays a
 * deliberate visit in Plugins. These tests pin the group, the confirm, the
 * progress and the failure hand-off.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const pluginsRef = ref([]);
const catalogPluginsRef = ref([]);
const pluginInstallErrorRef = ref("");
const catalogRepo = ref("https://github.com/osterbergsimon/calvin-plugins");
const devModeRef = ref(false);

const mockLoadPlugins = vi.fn().mockResolvedValue(undefined);
const mockEnumerate = vi.fn().mockResolvedValue(undefined);
const mockInstall = vi.fn().mockResolvedValue([]);
const mockPush = vi.fn();

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    loadPlugins: mockLoadPlugins,
    togglePlugin: vi.fn().mockResolvedValue(undefined),
    catalogPlugins: catalogPluginsRef,
    enumerateCatalogPlugins: mockEnumerate,
    installPluginFromGitHub: mockInstall,
    pluginInstallError: pluginInstallErrorRef,
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/stores/config", () => ({
  useConfigStore: () => ({
    get pluginCatalogRepo() {
      return catalogRepo.value;
    },
    get devMode() {
      return devModeRef.value;
    },
  }),
}));

import AddSourceButton from "@/components/settings/specialized/AddSourceButton.vue";

const modalStub = {
  name: "InstanceModal",
  props: ["show", "plugin", "instance"],
  emits: ["close", "save"],
  template: '<div class="modal-stub" />',
};

const CATALOG = [
  {
    id: "immich",
    name: "Immich",
    type: "image",
    version: "2.1.0",
    path: "immich",
    description: "Albums from your Immich server.",
    _installed: false,
  },
  {
    id: "local_photos",
    name: "Local photos",
    type: "image",
    version: "1.0.0",
    path: "local_photos",
    description: "Photos on this device.",
    _installed: true,
  },
  {
    id: "mealie",
    name: "Mealie",
    type: "service",
    version: "1.0.0",
    path: "mealie",
    description: "Recipes.",
    _installed: false,
  },
  {
    id: "hidden_catalog",
    name: "Hidden catalog entry",
    type: "image",
    version: "1.0.0",
    path: "hidden-catalog",
    description: "Not part of the published catalog.",
    catalog: false,
    _installed: false,
  },
  {
    id: "test_plugin",
    name: "Test Plugin",
    type: "image",
    version: "1.0.0",
    path: "test-plugin",
    description: "A test fixture.",
    keywords: ["test", "example"],
    _installed: false,
  },
];

const installedImage = {
  id: "existing_photos",
  name: "Existing photos",
  type: "image",
  enabled: true,
  display_schema: { kind: "card-grid" },
};

const mountButton = async (props = {}) => {
  const w = mount(AddSourceButton, {
    props: { kind: "photos", ...props },
    global: { stubs: { InstanceModal: modalStub } },
  });
  await flushPromises();
  return w;
};

const openPicker = async w => {
  w.vm.open();
  await flushPromises();
  return w;
};

const catalogTiles = w => w.findAll("[data-catalog-id]");
const catalogIds = w => catalogTiles(w).map(tile => tile.attributes("data-catalog-id"));

describe("provider picker catalog group", () => {
  beforeEach(() => {
    pluginsRef.value = [installedImage];
    catalogPluginsRef.value = [];
    pluginInstallErrorRef.value = "";
    catalogRepo.value = "https://github.com/osterbergsimon/calvin-plugins";
    devModeRef.value = false;
    mockLoadPlugins.mockReset().mockResolvedValue(undefined);
    mockEnumerate.mockReset().mockImplementation(async () => {
      catalogPluginsRef.value = CATALOG.map(item => ({ ...item }));
    });
    mockInstall.mockReset().mockResolvedValue([]);
    mockPush.mockClear();
  });

  it("lists catalog plugins of the kind that are not installed", async () => {
    const w = await openPicker(await mountButton());

    expect(mockEnumerate).toHaveBeenCalledWith(
      "https://github.com/osterbergsimon/calvin-plugins",
      "main"
    );
    expect(catalogIds(w)).toEqual(["immich"]);
    expect(w.find(".pp-group").text()).toBe("From the Calvin catalog");
    expect(w.text()).toContain("Albums from your Immich server.");
  });

  it("never offers catalog:false entries, even in dev mode", async () => {
    devModeRef.value = true;
    const w = await openPicker(await mountButton());

    expect(catalogIds(w)).toEqual(["immich", "test_plugin"]);
    expect(catalogIds(w)).not.toContain("hidden_catalog");
    expect(w.text()).not.toContain("Hidden catalog entry");
  });

  it("hides the repo's test fixtures outside dev mode", async () => {
    const w = await openPicker(await mountButton());

    expect(catalogIds(w)).not.toContain("test_plugin");
    expect(w.text()).not.toContain("Test Plugin");
  });

  it("leaves the group out when the catalog cannot be reached", async () => {
    mockEnumerate.mockImplementation(async () => {
      catalogPluginsRef.value = [];
      pluginInstallErrorRef.value = "Repository not found";
    });

    const w = await openPicker(await mountButton());

    expect(w.find(".pp-group").exists()).toBe(false);
    expect(w.text()).not.toContain("From the Calvin catalog");
    // The escape hatch to Plugins is always there.
    expect(w.find(".pp-more").text()).toBe("Get more in Plugins ›");
  });

  it("never offers a non-official repository configured as the catalog", async () => {
    catalogRepo.value = "https://github.com/someone/evil-plugins";

    const w = await openPicker(await mountButton());

    expect(mockEnumerate).not.toHaveBeenCalled();
    expect(w.find(".pp-group").exists()).toBe(false);
  });

  it("asks once before installing, showing the catalog name", async () => {
    const w = await openPicker(await mountButton());
    await w.find('[data-install-id="immich"]').trigger("click");
    await flushPromises();

    expect(mockInstall).not.toHaveBeenCalled();
    const modal = w.findComponent({ name: "ConfirmModal" });
    expect(modal.props("show")).toBe(true);
    expect(modal.props("message")).toBe(
      "Install Immich? It adds an add-on to your Calvin server. You can remove it in Plugins."
    );
    expect(modal.props("confirmText")).toBe("Install");
  });

  it("installs, shows Installing…, then opens the new plugin's add form", async () => {
    let resolveInstall;
    mockInstall.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveInstall = () => resolve(["immich"]);
        })
    );
    mockLoadPlugins.mockImplementation(async () => {
      pluginsRef.value = [
        ...pluginsRef.value,
        { id: "immich", name: "Immich", type: "image", enabled: true, _installed: true },
      ];
    });

    const w = await openPicker(await mountButton());
    await w.find('[data-install-id="immich"]').trigger("click");
    await flushPromises();
    await w.findComponent({ name: "ConfirmModal" }).vm.$emit("confirm");
    await flushPromises();

    expect(mockInstall).toHaveBeenCalledWith(
      "https://github.com/osterbergsimon/calvin-plugins",
      "immich",
      "main"
    );
    expect(w.find('[data-catalog-id="immich"]').text()).toContain("Installing…");

    resolveInstall();
    await flushPromises();

    const modal = w.findComponent({ name: "InstanceModal" });
    expect(modal.props("show")).toBe(true);
    expect(modal.props("plugin")).toMatchObject({ id: "immich" });
  });

  it("shows the error and a link to Plugins when the install fails", async () => {
    mockInstall.mockImplementation(async () => {
      pluginInstallErrorRef.value = "pip install failed";
      return [];
    });

    const w = await openPicker(await mountButton());
    await w.find('[data-install-id="immich"]').trigger("click");
    await flushPromises();
    await w.findComponent({ name: "ConfirmModal" }).vm.$emit("confirm");
    await flushPromises();

    const tile = w.find('[data-catalog-id="immich"]');
    expect(tile.text()).toContain("pip install failed");
    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(false);

    await tile.find(".pp-error-link").trigger("click");
    expect(mockPush).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "plugins-install", pluginKind: "image" },
    });
  });
});
