/**
 * Update on Installed cards (§3.3, deferred phase-2 item).
 *
 * The category compares the installed version with the official catalog's
 * enumerate result (semver-aware), passes the newer version down to the card,
 * and handles the update by installing that catalog entry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import PluginsCategory from "@/components/settings/categories/PluginsCategory.vue";
import { useConfigStore } from "@/stores/config";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

const pluginsRef = ref([]);
const catalogPluginsRef = ref([]);
const mockEnumerateCatalog = vi.fn(() => Promise.resolve(null));
const mockInstallFromGitHub = vi.fn(() => Promise.resolve(["mealie"]));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    pluginInstances: ref({}),
    loadingPlugins: ref(false),
    installingPlugin: ref(false),
    enumeratingPlugins: ref(false),
    githubRepoUrl: ref("https://github.com/osterbergsimon/calvin-plugins"),
    githubBranch: ref("main"),
    availablePlugins: ref([]),
    catalogPlugins: catalogPluginsRef,
    catalogEnumerating: ref(false),
    catalogError: ref(""),
    pluginInstallError: ref(""),
    pluginInstallSuccess: ref(""),
    pluginBranchSwitched: ref(false),
    pluginActualBranch: ref(""),
    expandedPlugins: ref({}),
    pluginFormData: ref({}),
    savingPlugin: ref(null),
    testingPlugin: ref({}),
    fetchingPlugin: ref({}),
    pluginSaveStatus: ref({}),
    pluginTestStatus: ref({}),
    pluginFetchStatus: ref({}),
    loadPlugins: vi.fn(() => Promise.resolve()),
    installPluginFromZip: vi.fn(),
    enumeratePluginsFromGitHub: vi.fn(),
    enumerateCatalogPlugins: mockEnumerateCatalog,
    installPluginFromGitHub: mockInstallFromGitHub,
    installPluginsFromGitHub: vi.fn(),
    enumeratePluginsFromLocal: vi.fn(),
    installPluginFromLocal: vi.fn(),
    installPluginsFromLocal: vi.fn(),
    uninstallPlugin: vi.fn(),
    loadPluginConfig: vi.fn(),
    updatePluginFormValue: vi.fn(),
    savePluginConfig: vi.fn(),
    testPluginConnection: vi.fn(),
    fetchPluginNow: vi.fn(),
    togglePlugin: vi.fn(),
  }),
  useSystem: () => ({ restartBackend: vi.fn(() => Promise.resolve()) }),
}));

vi.mock("@/stores/images", () => ({
  useImagesStore: () => ({
    images: [],
    fetchImages: vi.fn(() => Promise.resolve()),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
  }),
}));

vi.mock("@/services/pluginsApi", () => ({
  inspectPluginZip: vi.fn(),
  deletePluginInstance: vi.fn(),
  updatePluginInstance: vi.fn(),
  updatePluginInstanceOrder: vi.fn(),
}));

const stubs = {
  SettingsSection: { template: "<div><slot /></div>" },
  SettingRow: { template: "<div><slot /></div>" },
  PluginInstaller: { name: "PluginInstaller", template: "<div />" },
  PluginManager: {
    name: "PluginManager",
    props: ["latestVersions", "updatingPlugin"],
    emits: ["update"],
    template: "<div />",
  },
  ConfirmModal: { template: "<div/>" },
  InstanceModal: { template: "<div/>" },
};

const installedMealie = {
  id: "mealie",
  name: "Mealie",
  type: "service",
  version: "1.0.0",
  enabled: true,
  _installed: true,
};

const mounted = async () => {
  const w = mount(PluginsCategory, { global: { stubs } });
  await flushPromises();
  return w;
};

describe("Plugins › Installed update", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pluginsRef.value = [installedMealie];
    catalogPluginsRef.value = [];
    vi.clearAllMocks();
    mockEnumerateCatalog.mockResolvedValue(null);
    mockInstallFromGitHub.mockResolvedValue(["mealie"]);
    api.post.mockResolvedValue({ data: {} });
  });

  it("lists the official catalog on open", async () => {
    await mounted();

    expect(mockEnumerateCatalog).toHaveBeenCalledWith(
      "https://github.com/osterbergsimon/calvin-plugins",
      "main"
    );
  });

  it("only exposes a catalog version that is a newer release", async () => {
    catalogPluginsRef.value = [
      { id: "mealie", name: "Mealie", type: "service", version: "2.0.0", path: "mealie" },
    ];
    const w = await mounted();

    const manager = w.findComponent({ name: "PluginManager" });
    expect(manager.props("latestVersions")).toEqual({ mealie: "2.0.0" });
  });

  it("does not offer an update when the catalog is the same or older", async () => {
    catalogPluginsRef.value = [
      { id: "mealie", name: "Mealie", type: "service", version: "1.0.0", path: "mealie" },
    ];
    const w = await mounted();

    expect(w.findComponent({ name: "PluginManager" }).props("latestVersions")).toEqual({});
  });

  it("installs the catalog entry when the card requests the update", async () => {
    catalogPluginsRef.value = [
      { id: "mealie", name: "Mealie", type: "service", version: "2.0.0", path: "mealie" },
    ];
    const w = await mounted();

    w.findComponent({ name: "PluginManager" }).vm.$emit("update", "mealie");
    await flushPromises();

    expect(mockInstallFromGitHub).toHaveBeenCalledWith(
      "https://github.com/osterbergsimon/calvin-plugins",
      "mealie",
      "main",
      undefined
    );
  });

  it("never offers updates from a non-official catalog setting", async () => {
    const store = useConfigStore();
    store.pluginCatalogRepo = "https://github.com/someone/evil-plugins";
    catalogPluginsRef.value = [
      { id: "mealie", name: "Mealie", type: "service", version: "9.9.9", path: "mealie" },
    ];
    const w = await mounted();

    expect(mockEnumerateCatalog).not.toHaveBeenCalled();
    expect(w.findComponent({ name: "PluginManager" }).props("latestVersions")).toEqual({});

    w.findComponent({ name: "PluginManager" }).vm.$emit("update", "mealie");
    await flushPromises();
    expect(mockInstallFromGitHub).not.toHaveBeenCalled();
  });
});
