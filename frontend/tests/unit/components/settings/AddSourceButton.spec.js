import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";

const pluginsRef = ref([]);
const mockLoadPlugins = vi.fn().mockResolvedValue(undefined);
const mockTogglePlugin = vi.fn().mockResolvedValue(undefined);
const mockPush = vi.fn();
const availablePluginsRef = ref([]);
const mockEnumerate = vi.fn().mockResolvedValue(undefined);
const mockInstall = vi.fn().mockResolvedValue([]);
const pluginInstallErrorRef = ref("");

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: pluginsRef,
    loadPlugins: mockLoadPlugins,
    togglePlugin: mockTogglePlugin,
    catalogPlugins: availablePluginsRef,
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
    pluginCatalogRepo: "https://github.com/osterbergsimon/calvin-plugins",
  }),
}));

import AddSourceButton from "@/components/settings/specialized/AddSourceButton.vue";

const pickerStub = {
  name: "ProviderPicker",
  props: ["show", "title", "providers", "moreLabel"],
  emits: ["select", "close", "more"],
  template: '<div class="picker-stub" />',
};
const modalStub = {
  name: "InstanceModal",
  props: ["show", "plugin", "instance"],
  emits: ["close", "save"],
  template: '<div class="modal-stub" />',
};
const stubs = { ProviderPicker: pickerStub, InstanceModal: modalStub };

const service = (over = {}) => ({
  id: "mealie",
  name: "Mealie",
  type: "service",
  enabled: true,
  display_schema: { kind: "card-grid" },
  ...over,
});

const iframe = {
  id: "web_page",
  name: "Web page",
  type: "service",
  enabled: true,
  display_schema: { kind: "iframe" },
};

const mountButton = async (props = {}) => {
  const w = mount(AddSourceButton, { props: { kind: "services", ...props }, global: { stubs } });
  await flushPromises();
  return w;
};

describe("AddSourceButton provider picker", () => {
  beforeEach(() => {
    pluginsRef.value = [];
    availablePluginsRef.value = [];
    pluginInstallErrorRef.value = "";
    mockLoadPlugins.mockClear();
    mockTogglePlugin.mockClear();
    mockPush.mockClear();
    mockEnumerate.mockReset().mockResolvedValue(undefined);
    mockInstall.mockReset().mockResolvedValue([]);
  });

  it("lists the enabled plugins of the kind, with the iframe page first", async () => {
    pluginsRef.value = [service(), iframe];
    const w = await mountButton();

    w.vm.open();
    await flushPromises();

    const picker = w.findComponent({ name: "ProviderPicker" });
    expect(picker.props("show")).toBe(true);
    expect(picker.props("title")).toBe("Add a web page or app");
    expect(picker.props("providers").map(p => p.id)).toEqual(["web_page", "mealie"]);
    expect(picker.props("providers")[0].label).toBe("Web page (any address)");
  });

  it("skips the picker when there is exactly one candidate", async () => {
    pluginsRef.value = [service()];
    const w = await mountButton();

    w.vm.open();
    await flushPromises();

    expect(w.findComponent({ name: "ProviderPicker" }).props("show")).toBe(false);
    const modal = w.findComponent({ name: "InstanceModal" });
    expect(modal.props("show")).toBe(true);
    expect(modal.props("plugin")).toMatchObject({ id: "mealie" });
  });

  it("offers a turned-off plugin as a dimmed Turn on choice and enables it before adding", async () => {
    pluginsRef.value = [service({ enabled: false }), iframe];
    const w = await mountButton();
    w.vm.open();
    await flushPromises();

    const providers = w.findComponent({ name: "ProviderPicker" }).props("providers");
    const off = providers.find(p => p.id === "mealie");
    expect(off.disabled).toBe(true);

    w.findComponent({ name: "ProviderPicker" }).vm.$emit("select", off);
    await flushPromises();

    expect(mockTogglePlugin).toHaveBeenCalledWith("mealie", true);
    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(true);
  });

  it("offers Upload from this device first for photos and emits upload", async () => {
    pluginsRef.value = [{ ...service(), id: "immich", name: "Immich", type: "image" }];
    const w = await mountButton({ kind: "photos" });

    w.vm.open();
    await flushPromises();

    const providers = w.findComponent({ name: "ProviderPicker" }).props("providers");
    expect(providers[0]).toMatchObject({ id: "__upload", action: "upload" });

    w.findComponent({ name: "ProviderPicker" }).vm.$emit("select", providers[0]);
    await flushPromises();
    expect(w.emitted("upload")?.length).toBe(1);
  });

  it("lists only clock-bar-only services for clock bar info", async () => {
    pluginsRef.value = [
      service({
        id: "weather",
        name: "Weather",
        display_schema: null,
        statusbar_schema: { kind: "status" },
      }),
      iframe,
    ];
    const w = await mountButton({ kind: "clock" });
    w.vm.open();
    await flushPromises();

    const providers = w.findComponent({ name: "ProviderPicker" }).props("providers");
    expect(providers.map(p => p.id)).toEqual(["weather"]);
  });

  it("deep-links to Plugins › Install with the kind filter", async () => {
    pluginsRef.value = [iframe];
    const w = await mountButton();
    w.vm.open();
    await flushPromises();

    w.findComponent({ name: "ProviderPicker" }).vm.$emit("more");
    await flushPromises();

    expect(mockPush).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "plugins-install", pluginKind: "service" },
    });
  });

  it("reloads the plugin list and reports the saved source", async () => {
    pluginsRef.value = [service()];
    const w = await mountButton();
    w.vm.open();
    await flushPromises();

    w.findComponent({ name: "InstanceModal" }).vm.$emit("save", { instanceName: "Recipes" });
    await flushPromises();

    expect(mockLoadPlugins).toHaveBeenCalled();
    expect(w.emitted("saved")?.[0][0]).toMatchObject({
      pluginId: "mealie",
      instanceName: "Recipes",
    });
  });
});
