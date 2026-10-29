import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";
import * as pluginsApi from "@/services/pluginsApi";

// Secrets are never sent to the frontend (audit S4): the instance carries ""
// plus has_value, and the form must say a value is saved without showing it.
vi.mock("@/services/pluginsApi", () => ({
  testPlugin: vi.fn(() => Promise.resolve({ success: true, message: "ok" })),
  updatePluginInstance: vi.fn(() => Promise.resolve({})),
  createPluginInstance: vi.fn(() => Promise.resolve({})),
}));

const plugin = {
  id: "mealie",
  name: "Mealie",
  type: "service",
  ui_actions: [{ type: "test" }],
  instance_config_schema: {
    url: { type: "string", default: "" },
    api_key: { type: "password", default: "", ui: { component: "password" } },
    pin: { type: "password", default: "" },
  },
};

const instance = {
  id: "mealie-1",
  name: "Kitchen",
  enabled: true,
  config: { url: "http://mealie.local", api_key: "", pin: "" },
  has_value: { api_key: true, pin: true },
};

const mountModal = async () => {
  // Mount empty then open, as the settings page does: the component's
  // immediate watchers run before initializeForm is defined.
  const wrapper = mount(InstanceModal, {
    props: { show: false, plugin: null, instance: null },
  });
  await wrapper.setProps({ plugin, instance, show: true });
  await flushPromises();
  return wrapper;
};

describe("InstanceModal secret fields", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("shows a saved-secret placeholder instead of a value", async () => {
    const wrapper = await mountModal();

    const inputs = wrapper.findAll('input[type="password"]');
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      expect(input.element.value).toBe("");
      expect(input.attributes("placeholder")).toMatch(/saved/i);
    }
  });

  it("tests the connection against the edited instance so stored secrets are used", async () => {
    const wrapper = await mountModal();

    const testButton = wrapper.findAll("button").find(b => b.text().includes("Test Connection"));
    await testButton.trigger("click");
    await flushPromises();

    expect(pluginsApi.testPlugin).toHaveBeenCalledWith(
      "mealie",
      expect.objectContaining({ api_key: "" }),
      "mealie-1"
    );
  });
});
