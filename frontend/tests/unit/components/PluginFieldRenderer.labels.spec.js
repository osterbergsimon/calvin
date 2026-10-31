import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";

const mountField = (fieldKey, schema, value = "") =>
  mount(PluginFieldRenderer, {
    props: { pluginId: "calendar-ics", fieldKey, schema, value },
  });

describe("PluginFieldRenderer label and hint", () => {
  it("uses schema.label, never the description, as the field label", () => {
    const wrapper = mountField("ical_url", {
      type: "string",
      label: "Calendar address",
      description: "The .ics address to read events from.",
      ui: { component: "input" },
    });

    expect(wrapper.find("label").text()).toBe("Calendar address");
    expect(wrapper.find("label").text()).not.toContain(".ics address");
  });

  it("humanises the key when the schema declares no label", () => {
    const wrapper = mountField("feed_url", {
      type: "string",
      description: "Where to read events from.",
      ui: { component: "input" },
    });

    expect(wrapper.find("label").text()).toBe("Feed URL");
  });

  it("shows schema.description as a hint line under the control", () => {
    const wrapper = mountField("ical_url", {
      type: "string",
      label: "Calendar address",
      description: "The .ics address to read events from.",
      ui: { component: "input" },
    });

    expect(wrapper.find(".help-text").text()).toBe("The .ics address to read events from.");
  });

  it("renders nothing for a hidden field", () => {
    const wrapper = mountField("display_order", {
      type: "integer",
      label: "Order",
      hidden: true,
      ui: { component: "number" },
    });

    expect(wrapper.find(".plugin-field").exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("never renders display_order, even without the hidden flag", () => {
    const wrapper = mountField("display_order", {
      type: "integer",
      label: "Order",
      ui: { component: "number" },
    });

    expect(wrapper.find(".plugin-field").exists()).toBe(false);
  });

  it("renders a boolean as the shared toggle, not a native checkbox", () => {
    const wrapper = mountField(
      "fullscreen",
      {
        type: "boolean",
        label: "Fullscreen",
        description: "Open this service in fullscreen by default",
        ui: { component: "checkbox" },
      },
      false
    );

    expect(wrapper.find('[role="switch"]').exists()).toBe(true);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });
});
