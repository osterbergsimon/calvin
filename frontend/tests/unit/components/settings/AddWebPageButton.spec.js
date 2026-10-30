import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

const pluginsRef = vi.hoisted(() => ({ value: [], __v_isRef: true }));
const mockLoadPlugins = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@/composables", () => ({
  usePlugins: () => ({ plugins: pluginsRef, loadPlugins: mockLoadPlugins }),
}));

import AddWebPageButton from "@/components/settings/specialized/AddWebPageButton.vue";

const modalStub = {
  name: "InstanceModal",
  props: ["show", "plugin", "instance"],
  template: '<div class="instance-modal-stub" />',
};
const pickerStub = {
  name: "ProviderPicker",
  props: ["show", "title", "providers"],
  template: '<div class="provider-picker-stub"><slot /></div>',
};
const stubs = { InstanceModal: modalStub, ProviderPicker: pickerStub };

const iframePlugin = {
  id: "web_page",
  type: "service",
  name: "Web page",
  description: "Show any web page",
  enabled: true,
  display_schema: { kind: "iframe" },
};

const mealiePlugin = {
  id: "mealie",
  type: "service",
  name: "Mealie",
  description: "Recipes and meal plans",
  enabled: true,
  display_schema: { kind: "card-grid" },
};

const mountButton = async () => {
  const w = mount(AddWebPageButton, { global: { stubs } });
  await flushPromises();
  return w;
};

const clickAdd = w => w.find('[data-test="add-web-page"]').trigger("click");

describe("AddWebPageButton", () => {
  beforeEach(() => {
    pluginsRef.value = [];
    mockLoadPlugins.mockClear();
  });

  it("disables the button when no web-service plugin is enabled", async () => {
    const w = await mountButton();
    expect(w.find('[data-test="add-web-page"]').attributes("disabled")).toBeDefined();
    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(false);
  });

  it("opens the shared instance modal directly when the iframe plugin is the only candidate", async () => {
    pluginsRef.value = [iframePlugin];
    const w = await mountButton();

    await clickAdd(w);

    const modal = w.findComponent({ name: "InstanceModal" });
    expect(modal.props("show")).toBe(true);
    expect(modal.props("plugin")).toMatchObject({ id: "web_page" });
    expect(modal.props("instance")).toBeNull();
    expect(w.findComponent({ name: "ProviderPicker" }).props("show")).toBe(false);
  });

  it("lists every enabled service plugin in the picker, iframe first", async () => {
    // Mealie is enabled first: before the fix this opened Mealie's form.
    pluginsRef.value = [mealiePlugin, iframePlugin];
    const w = await mountButton();

    await clickAdd(w);

    const picker = w.findComponent({ name: "ProviderPicker" });
    expect(picker.props("show")).toBe(true);
    const providers = picker.props("providers");
    expect(providers.map(p => p.id)).toEqual(["web_page", "mealie"]);
    expect(providers[0].label).toBe("Web page (any address)");
    // No plugin modal opens without an explicit choice.
    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(false);
  });

  it("never opens a non-iframe plugin's modal without the user choosing it", async () => {
    // Two candidates and no iframe among them: a choice is still required.
    pluginsRef.value = [
      mealiePlugin,
      { ...mealiePlugin, id: "home_assistant", name: "Home Assistant" },
      { ...iframePlugin, enabled: false },
    ];
    const w = await mountButton();

    await clickAdd(w);

    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(false);
    const providers = w.findComponent({ name: "ProviderPicker" }).props("providers");
    expect(providers.map(p => p.id)).toEqual(["mealie", "home_assistant"]);
  });

  it("opens the chosen provider's modal and closes the picker", async () => {
    pluginsRef.value = [mealiePlugin, iframePlugin];
    const w = await mountButton();
    await clickAdd(w);

    w.findComponent({ name: "ProviderPicker" }).vm.$emit("select", {
      id: "mealie",
      plugin: mealiePlugin,
    });
    await flushPromises();

    const modal = w.findComponent({ name: "InstanceModal" });
    expect(modal.props("show")).toBe(true);
    expect(modal.props("plugin")).toMatchObject({ id: "mealie" });
    expect(w.findComponent({ name: "ProviderPicker" }).props("show")).toBe(false);
  });

  it("reloads the plugin list after the modal saves", async () => {
    pluginsRef.value = [iframePlugin];
    const w = await mountButton();

    await clickAdd(w);
    w.findComponent({ name: "InstanceModal" }).vm.$emit("save", { name: "Dashboard" });
    await flushPromises();

    expect(mockLoadPlugins).toHaveBeenCalled();
    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(false);
  });
});
