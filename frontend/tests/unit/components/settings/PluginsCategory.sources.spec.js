import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { setActivePinia, createPinia } from "pinia";

const pluginsRef = ref([]);
const instancesRef = ref({});
const mockTogglePlugin = vi.fn().mockResolvedValue(undefined);
const mockLoadPlugins = vi.fn().mockResolvedValue(undefined);
const mockReplace = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockReplace }),
  useRoute: () => ({ query: {} }),
}));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    pluginInstances: instancesRef,
    loadingPlugins: ref(false),
    installingPlugin: ref(false),
    enumeratingPlugins: ref(false),
    githubRepoUrl: ref("https://github.com/osterbergsimon/calvin-plugins"),
    githubBranch: ref("main"),
    availablePlugins: ref([]),
    catalogPlugins: ref([]),
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
    loadPlugins: mockLoadPlugins,
    installPluginFromZip: vi.fn(),
    enumeratePluginsFromGitHub: vi.fn(),
    enumerateCatalogPlugins: vi.fn(),
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
    togglePlugin: mockTogglePlugin,
  }),
}));

vi.mock("@/stores/images", () => ({
  useImagesStore: () => ({
    images: [],
    fetchImages: vi.fn().mockResolvedValue(undefined),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
  }),
}));

vi.mock("@/services/pluginsApi", () => ({
  inspectPluginZip: vi.fn(),
}));

import PluginsCategory from "@/components/settings/categories/PluginsCategory.vue";

const managerStub = {
  name: "PluginManager",
  props: ["plugins", "instances"],
  emits: ["toggle-enabled", "uninstall", "used-by", "add-source", "open-appearance"],
  template: '<div class="manager-stub" />',
};
const confirmStub = {
  name: "ConfirmModal",
  props: ["show", "title", "message"],
  emits: ["confirm", "cancel"],
  template: '<div class="confirm-stub" />',
};
const stubs = {
  SettingsSection: { template: "<div><slot /></div>" },
  PluginInstaller: true,
  PluginManager: managerStub,
  ConfirmModal: confirmStub,
};

const plugin = (over = {}) => ({
  id: "immich",
  name: "Immich",
  type: "image",
  enabled: true,
  _installed: true,
  ...over,
});

const mountCategory = async () => {
  const w = mount(PluginsCategory, { global: { stubs } });
  await flushPromises();
  return w;
};

describe("Plugins › Installed cards and confirms", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    pluginsRef.value = [plugin()];
    instancesRef.value = { immich: [{ id: "a" }, { id: "b" }] };
  });

  it("asks before turning off an add-on that has sources, with the count", async () => {
    const w = await mountCategory();
    w.findComponent({ name: "PluginManager" }).vm.$emit("toggle-enabled", "immich", false);
    await flushPromises();

    const confirm = w.findComponent({ name: "ConfirmModal" });
    expect(confirm.props("show")).toBe(true);
    expect(confirm.props("title")).toBe("Turn off Immich?");
    expect(confirm.props("message")).toBe("Its 2 sources stop showing until you turn it back on.");
    expect(mockTogglePlugin).not.toHaveBeenCalled();

    confirm.vm.$emit("confirm");
    await flushPromises();
    expect(mockTogglePlugin).toHaveBeenCalledWith("immich", false);
  });

  it("turns an add-on off without a prompt when it has no sources", async () => {
    instancesRef.value = { immich: [] };
    const w = await mountCategory();
    w.findComponent({ name: "PluginManager" }).vm.$emit("toggle-enabled", "immich", false);
    await flushPromises();

    expect(w.findComponent({ name: "ConfirmModal" }).props("show")).toBe(false);
    expect(mockTogglePlugin).toHaveBeenCalledWith("immich", false);
  });

  it("includes the source count in the uninstall confirm", async () => {
    const w = await mountCategory();
    w.findComponent({ name: "PluginManager" }).vm.$emit("uninstall", "immich", "image");
    await flushPromises();

    const confirms = w.findAllComponents({ name: "ConfirmModal" });
    const confirm = confirms[confirms.length - 1];
    expect(confirm.props("show")).toBe(true);
    expect(confirm.props("message")).toContain("2 sources are removed too");
  });

  it("links Used by to the provider's Content section with a highlight", async () => {
    const w = await mountCategory();
    w.findComponent({ name: "PluginManager" }).vm.$emit("used-by", "immich");
    await flushPromises();

    expect(mockReplace).toHaveBeenCalledWith({
      query: { setting: "content-photos", highlight: "immich" },
    });
  });

  it("sends a clock-bar-only add-on to Clock bar info and a theme to Appearance", async () => {
    pluginsRef.value = [
      plugin({
        id: "weather",
        name: "Weather",
        type: "service",
        display_schema: null,
        statusbar_schema: { kind: "status" },
      }),
      plugin({ id: "ocean", name: "Ocean", type: "theme", _installed: false }),
    ];
    const w = await mountCategory();

    w.findComponent({ name: "PluginManager" }).vm.$emit("used-by", "weather");
    w.findComponent({ name: "PluginManager" }).vm.$emit("open-appearance");
    await flushPromises();

    expect(mockReplace).toHaveBeenCalledWith({
      query: { setting: "content-clock-bar", highlight: "weather" },
    });
    expect(mockReplace).toHaveBeenCalledWith({ query: { setting: "dashboard-ui" } });
  });
});
