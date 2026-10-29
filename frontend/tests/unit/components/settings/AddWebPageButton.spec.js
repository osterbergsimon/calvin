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
const stubs = { InstanceModal: modalStub };

const servicePlugin = {
  id: "iframe-service",
  type: "service",
  name: "Web page",
  enabled: true,
};

describe("AddWebPageButton", () => {
  beforeEach(() => {
    pluginsRef.value = [];
    mockLoadPlugins.mockClear();
  });

  it("disables the button when no web-service plugin is enabled", async () => {
    const w = mount(AddWebPageButton, { global: { stubs } });
    await flushPromises();
    expect(w.find('[data-test="add-web-page"]').attributes("disabled")).toBeDefined();
    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(false);
  });

  it("opens the shared instance modal for the enabled service plugin", async () => {
    pluginsRef.value = [servicePlugin];
    const w = mount(AddWebPageButton, { global: { stubs } });
    await flushPromises();

    await w.find('[data-test="add-web-page"]').trigger("click");

    const modal = w.findComponent({ name: "InstanceModal" });
    expect(modal.props("show")).toBe(true);
    expect(modal.props("plugin")).toMatchObject({ id: "iframe-service" });
    expect(modal.props("instance")).toBeNull();
  });

  it("reloads the plugin list after the modal saves", async () => {
    pluginsRef.value = [servicePlugin];
    const w = mount(AddWebPageButton, { global: { stubs } });
    await flushPromises();

    await w.find('[data-test="add-web-page"]').trigger("click");
    w.findComponent({ name: "InstanceModal" }).vm.$emit("save", { name: "Dashboard" });
    await flushPromises();

    expect(mockLoadPlugins).toHaveBeenCalled();
    expect(w.findComponent({ name: "InstanceModal" }).props("show")).toBe(false);
  });
});
