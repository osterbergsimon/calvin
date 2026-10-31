import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import InstanceModal from "@/components/settings/specialized/InstanceModal.vue";

vi.mock("@/services/pluginsApi", () => ({
  testPlugin: vi.fn(() => Promise.resolve({ success: true, message: "ok" })),
  updatePluginInstance: vi.fn(() => Promise.resolve({})),
  createPluginInstance: vi.fn(() => Promise.resolve({})),
}));

const plugin = {
  id: "calendar-ics",
  name: "ICS calendar",
  type: "calendar",
  instance_label: "calendar",
  instance_config_schema: {
    ical_url: {
      type: "string",
      label: "Calendar address",
      description: "The .ics address to read events from.",
      default: "",
      ui: { component: "input" },
    },
    display_order: { type: "integer", label: "Order", default: 0, hidden: true },
  },
  ui_actions: [{ type: "test" }],
};

const mountModal = async (pluginOverride = plugin) => {
  const wrapper = mount(InstanceModal, {
    props: { show: false, plugin: null, instance: null },
  });
  await wrapper.setProps({ plugin: pluginOverride, show: true });
  await flushPromises();
  return wrapper;
};

describe("InstanceModal form", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders the declared label and the description as a hint", async () => {
    const wrapper = await mountModal();

    expect(wrapper.get(".plugin-field label").text()).toBe("Calendar address");
    expect(wrapper.text()).toContain("The .ics address to read events from.");
  });

  it("never shows display_order", async () => {
    const wrapper = await mountModal();

    expect(wrapper.text()).not.toContain("display_order");
    expect(wrapper.find(".text-field__label").text()).toBe("Name");
  });

  it("uses sentence-case copy for the calendar fields and test action", async () => {
    const wrapper = await mountModal();
    const text = wrapper.text();

    expect(text).toContain("Colour");
    expect(text).toContain("Show event times");
    expect(text).toContain("Test connection");
    expect(text).not.toContain("Calendar Color");
    expect(text).not.toContain("Show Event Times");
    expect(text).not.toContain("Test Connection");
  });

  it("renders on/off controls as the shared toggles, not native checkboxes", async () => {
    const wrapper = await mountModal();

    const switches = wrapper.findAll('[role="switch"]');
    expect(switches.map(s => s.attributes("aria-label"))).toEqual(["Show event times", "Enabled"]);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it("wires the show-event-times toggle to the form value", async () => {
    const wrapper = await mountModal();

    const toggle = wrapper.get('[role="switch"][aria-label="Show event times"]');
    expect(toggle.attributes("aria-checked")).toBe("true");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-checked")).toBe("false");
  });

  it("suggests a real calendar name instead of repeating the kind", async () => {
    const wrapper = await mountModal();

    expect(wrapper.get("input[placeholder]").attributes("placeholder")).toBe("e.g. Family");
  });

  it("drops the placeholder when instance_label just repeats the kind", async () => {
    const wrapper = await mountModal({
      ...plugin,
      id: "web-embed",
      type: "service",
      instance_label: "service",
      instance_config_schema: { url: { type: "string", default: "" } },
    });

    expect(wrapper.get("input").attributes("placeholder") || "").toBe("");
  });

  it("renders Test connection as the shared secondary Button", async () => {
    const wrapper = await mountModal();

    const button = wrapper.findAll("button").find(b => b.text() === "Test connection");
    expect(button.classes()).toContain("btn");
    expect(button.classes()).toContain("btn--secondary");
  });
});
