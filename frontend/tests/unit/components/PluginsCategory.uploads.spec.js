/** The plugin upload result speaks plain words, and an error waits for the next try. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import PluginsCategory from "@/components/settings/categories/PluginsCategory.vue";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

const mockUploadImage = vi.hoisted(() => vi.fn());
const mockLoadPlugins = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: { value: [], __v_isRef: true },
    pluginInstances: { value: {}, __v_isRef: true },
    loadingPlugins: { value: false, __v_isRef: true },
    installingPlugin: { value: false, __v_isRef: true },
    enumeratingPlugins: { value: false, __v_isRef: true },
    githubRepoUrl: { value: "", __v_isRef: true },
    githubBranch: { value: "main", __v_isRef: true },
    availablePlugins: { value: [], __v_isRef: true },
    catalogPlugins: { value: [], __v_isRef: true },
    catalogEnumerating: { value: false, __v_isRef: true },
    catalogError: { value: "", __v_isRef: true },
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
    uploadImage: mockUploadImage,
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
  PluginInstaller: { template: "<div/>" },
  PluginManager: {
    name: "PluginManager",
    template: "<div/>",
    props: ["uploading", "uploadError", "uploadSuccess"],
  },
  InstanceModal: { template: "<div/>" },
  ConfirmModal: { template: "<div/>" },
};

const SECTION = { id: "photos", type: "upload", title: "Photos", multiple: true };
const FILES = [
  new File(["a"], "a.jpg", { type: "image/jpeg" }),
  new File(["b"], "b.jpg", { type: "image/jpeg" }),
];

async function mountCategory() {
  const wrapper = mount(PluginsCategory, { global: { stubs } });
  await flushPromises();
  return wrapper;
}

describe("PluginsCategory upload result", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockLoadPlugins.mockResolvedValue(undefined);
    api.post.mockResolvedValue({ data: {} });
    mockUploadImage.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts uploaded photos, and says one photo for one", async () => {
    const wrapper = await mountCategory();
    const manager = wrapper.findComponent({ name: "PluginManager" });

    manager.vm.$emit("upload", [FILES, SECTION]);
    await flushPromises();
    expect(manager.props("uploadSuccess")).toBe("Uploaded 2 photos.");

    manager.vm.$emit("upload", [[FILES[0]], SECTION]);
    await flushPromises();
    expect(manager.props("uploadSuccess")).toBe("Uploaded 1 photo.");
  });

  it("keeps a friendly upload error until the next try", async () => {
    mockUploadImage.mockRejectedValue({ response: { status: 500, data: {} } });
    const wrapper = await mountCategory();
    const manager = wrapper.findComponent({ name: "PluginManager" });

    vi.useFakeTimers();
    manager.vm.$emit("upload", [FILES, SECTION]);
    await flushPromises();

    expect(manager.props("uploadError")).toBe(
      "Something went wrong on the Calvin server while trying to upload these photos."
    );

    await vi.advanceTimersByTimeAsync(11000);
    expect(manager.props("uploadError")).toBe(
      "Something went wrong on the Calvin server while trying to upload these photos."
    );
  });
});
