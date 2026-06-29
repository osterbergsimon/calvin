import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import PluginsCategory from "@/components/settings/categories/PluginsCategory.vue";
import { useConfigStore } from "@/stores/config";

// Plain ref-like objects — following the UpdatesTab.spec.js harness pattern.
// vi.hoisted runs before imports so we can't call Vue's ref() here.
// We use { value, __v_isRef: true } objects that Vue recognises as refs in templates.
const githubRepoUrl = vi.hoisted(() => ({ value: "", __v_isRef: true }));
const mockLoadPlugins = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: { value: [], __v_isRef: true },
    pluginInstances: { value: {}, __v_isRef: true },
    loadingPlugins: { value: false, __v_isRef: true },
    installingPlugin: { value: false, __v_isRef: true },
    enumeratingPlugins: { value: false, __v_isRef: true },
    githubRepoUrl,
    githubBranch: { value: "main", __v_isRef: true },
    availablePlugins: { value: [], __v_isRef: true },
    pluginInstallError: { value: "", __v_isRef: true },
    pluginInstallSuccess: { value: "", __v_isRef: true },
    pluginRequiresRestart: { value: false, __v_isRef: true },
    pluginBranchSwitched: { value: false, __v_isRef: true },
    pluginActualBranch: { value: "", __v_isRef: true },
    expandedPlugins: { value: {}, __v_isRef: true },
    pluginFormData: { value: {}, __v_isRef: true },
    savingPlugin: { value: false, __v_isRef: true },
    testingPlugin: { value: false, __v_isRef: true },
    fetchingPlugin: { value: false, __v_isRef: true },
    pluginSaveStatus: { value: null, __v_isRef: true },
    pluginTestStatus: { value: null, __v_isRef: true },
    pluginFetchStatus: { value: null, __v_isRef: true },
    loadPlugins: mockLoadPlugins,
    installPluginFromZip: vi.fn(),
    enumeratePluginsFromGitHub: vi.fn(),
    installPluginFromGitHub: vi.fn(),
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
  useSystem: () => ({
    restartBackend: vi.fn(() => Promise.resolve()),
  }),
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

vi.mock("@/services/calendarApi", () => ({
  addCalendarSource: vi.fn(),
}));

const stubs = {
  SettingsSection: { template: "<div><slot /></div>" },
  SettingRow: { template: "<div><slot /></div>" },
  PluginInstaller: { name: "PluginInstaller", template: "<div />", props: ["repoUrl"] },
  PluginManager: true,
  InstanceModal: true,
  ConfirmModal: true,
};

describe("PluginsCategory repo prefill", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    githubRepoUrl.value = "";
    vi.clearAllMocks();
    mockLoadPlugins.mockResolvedValue(undefined);
  });

  it("prefills githubRepoUrl from pluginRepositoryUrl when githubRepoUrl is empty", async () => {
    // configStore.pluginRepositoryUrl defaults to "https://github.com/osterbergsimon/calvin-plugins"
    mount(PluginsCategory, { global: { stubs } });
    await flushPromises();

    expect(githubRepoUrl.value).toBe("https://github.com/osterbergsimon/calvin-plugins");
  });

  it("leaves non-empty githubRepoUrl unchanged even when pluginRepositoryUrl is set", async () => {
    // Set githubRepoUrl to a user-entered value before mount
    githubRepoUrl.value = "https://github.com/other/repo";
    const store = useConfigStore();
    store.pluginRepositoryUrl = "https://github.com/osterbergsimon/calvin-plugins";

    mount(PluginsCategory, { global: { stubs } });
    await flushPromises();

    expect(githubRepoUrl.value).toBe("https://github.com/other/repo");
  });
});
