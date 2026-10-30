import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import PluginsCategory from "@/components/settings/categories/PluginsCategory.vue";
import { useNotificationsStore } from "@/stores/notifications";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

vi.mock("vue-router", () => ({
  useRoute: () => routeRef,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Plain ref-like objects — following the UpdatesTab.spec.js harness pattern.
// vi.hoisted runs before imports so we can't call Vue's ref() here.
// We use { value, __v_isRef: true } objects that Vue recognises as refs in templates.
const githubRepoUrl = vi.hoisted(() => ({ value: "", __v_isRef: true }));
const mockLoadPlugins = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const pluginsRef = vi.hoisted(() => ({ value: [], __v_isRef: true }));
const activeExpanded = vi.hoisted(() => ({ value: {}, __v_isRef: true }));
const requiresRestart = vi.hoisted(() => ({ value: false, __v_isRef: true }));
const mockInstallFromGitHub = vi.hoisted(() => vi.fn());
const mockEnumerate = vi.hoisted(() => vi.fn());
const mockTogglePlugin = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const routeRef = vi.hoisted(() => ({ query: {} }));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    pluginInstances: { value: {}, __v_isRef: true },
    loadingPlugins: { value: false, __v_isRef: true },
    installingPlugin: { value: false, __v_isRef: true },
    enumeratingPlugins: { value: false, __v_isRef: true },
    githubRepoUrl,
    githubBranch: { value: "main", __v_isRef: true },
    availablePlugins: { value: [], __v_isRef: true },
    catalogPlugins: { value: [], __v_isRef: true },
    catalogEnumerating: { value: false, __v_isRef: true },
    catalogError: { value: "", __v_isRef: true },
    pluginInstallError: { value: "", __v_isRef: true },
    pluginInstallSuccess: { value: "", __v_isRef: true },
    pluginRequiresRestart: requiresRestart,
    pluginBranchSwitched: { value: false, __v_isRef: true },
    pluginActualBranch: { value: "", __v_isRef: true },
    expandedPlugins: activeExpanded,
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
    enumerateCatalogPlugins: mockEnumerate,
    installPluginFromGitHub: mockInstallFromGitHub,
    installPluginsFromGitHub: vi.fn(),
    enumeratePluginsFromLocal: vi.fn(),
    installPluginFromLocal: vi.fn(),
    installPluginsFromLocal: vi.fn(),
    uninstallPlugin: vi.fn(),
    loadPluginConfig: vi.fn(() => Promise.resolve()),
    updatePluginFormValue: vi.fn(),
    savePluginConfig: vi.fn(),
    testPluginConnection: vi.fn(),
    fetchPluginNow: vi.fn(),
    togglePlugin: mockTogglePlugin,
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
  PluginManager: { name: "PluginManager", template: "<div/>", props: ["activeTab"] },
  InstanceModal: { template: "<div/>" },
  ConfirmModal: { template: "<div/>" },
};

describe("PluginsCategory after install (F5)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    routeRef.query = {};
    activeExpanded.value = {};
    requiresRestart.value = false;
    pluginsRef.value = [
      { id: "ical", type: "calendar", name: "iCal", enabled: true },
      {
        id: "mealie",
        type: "service",
        name: "Mealie",
        enabled: false,
        common_config_schema: { server: { type: "string" } },
      },
    ];
    Element.prototype.scrollIntoView = vi.fn();
    api.post.mockResolvedValue({ data: {} });
  });

  const installMealie = async () => {
    mockInstallFromGitHub.mockResolvedValue(["mealie"]);
    const wrapper = mount(PluginsCategory, { global: { stubs } });
    await flushPromises();
    wrapper.findComponent({ name: "PluginInstaller" }).vm.$emit("install", {
      path: "mealie",
      repoUrl: "https://github.com/x/y",
      branch: "main",
    });
    await flushPromises();
    return wrapper;
  };

  it("enables the freshly installed plugin", async () => {
    await installMealie();
    expect(mockTogglePlugin).toHaveBeenCalledWith("mealie", true);
  });

  it("jumps to the plugin's kind filter and expands a plugin with setup", async () => {
    const wrapper = await installMealie();
    expect(wrapper.findComponent({ name: "PluginManager" }).props("activeTab")).toBe("service");
    expect(activeExpanded.value.mealie).toBe(true);
  });

  it("shows a success toast naming the plugin", async () => {
    await installMealie();
    const toast = useNotificationsStore().items.at(-1);
    expect(toast.severity).toBe("success");
    expect(toast.message).toContain("Mealie installed and enabled");
  });

  it("doesn't expand an empty card or promise setup for a plugin with nothing to set", async () => {
    pluginsRef.value = [
      {
        id: "picsum",
        type: "image",
        name: "Picsum",
        enabled: false,
        supports_multiple_instances: false,
      },
    ];
    mockInstallFromGitHub.mockResolvedValue(["picsum"]);
    const wrapper = mount(PluginsCategory, { global: { stubs } });
    await flushPromises();
    wrapper.findComponent({ name: "PluginInstaller" }).vm.$emit("install", { path: "picsum" });
    await flushPromises();

    expect(mockTogglePlugin).toHaveBeenCalledWith("picsum", true);
    expect(wrapper.findComponent({ name: "PluginManager" }).props("activeTab")).toBe("image");
    expect(activeExpanded.value.picsum).toBeUndefined();
    expect(useNotificationsStore().items.at(-1).message).toContain(
      "add a source from Content when you need it"
    );
  });

  it("does nothing when the install failed", async () => {
    mockInstallFromGitHub.mockResolvedValue([]);
    const wrapper = mount(PluginsCategory, { global: { stubs } });
    await flushPromises();
    wrapper.findComponent({ name: "PluginInstaller" }).vm.$emit("install", { path: "mealie" });
    await flushPromises();
    expect(mockTogglePlugin).not.toHaveBeenCalled();
    expect(useNotificationsStore().items).toHaveLength(0);
  });

  it("lists the configured repository's catalog on open (F8)", async () => {
    mount(PluginsCategory, { global: { stubs } });
    await flushPromises();
    expect(mockEnumerate).toHaveBeenCalledWith(
      "https://github.com/osterbergsimon/calvin-plugins",
      "main"
    );
  });
});
