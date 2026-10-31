import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";
import SelectPill from "@/components/ui/SelectPill.vue";

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

  it("renders a select as the shared SelectPill, not a native select", async () => {
    const wrapper = mountField(
      "units",
      {
        type: "string",
        label: "Units",
        ui: {
          component: "select",
          options: [{ value: "metric", label: "Metric" }, { value: "imperial" }],
        },
      },
      "metric"
    );

    expect(wrapper.find("select").exists()).toBe(false);
    const pill = wrapper.findComponent(SelectPill);
    expect(pill.props("ariaLabel")).toBe("Units");
    expect(pill.props("modelValue")).toBe("metric");
    expect(pill.props("options")).toEqual([
      { value: "metric", label: "Metric" },
      { value: "imperial", label: "imperial" },
    ]);

    pill.vm.$emit("update:modelValue", "imperial");
    expect(wrapper.emitted("update")).toEqual([["imperial"]]);
  });

  it("keeps emitting strings from a select, as the native control did", () => {
    const wrapper = mountField(
      "zoom",
      { type: "integer", label: "Zoom", ui: { component: "select", options: [{ value: 2 }] } },
      2
    );

    wrapper.findComponent(SelectPill).vm.$emit("update:modelValue", 2);
    expect(wrapper.emitted("update")).toEqual([["2"]]);
  });

  it("renders a scan select as a SelectPill that keeps the saved value", () => {
    const wrapper = mountField(
      "device",
      { type: "string", label: "Device", ui: { component: "select-scan" } },
      "aa:bb"
    );

    expect(wrapper.find("select").exists()).toBe(false);
    const pill = wrapper.findComponent(SelectPill);
    expect(pill.props("options")).toEqual([{ value: "aa:bb", label: "aa:bb" }]);
    expect(wrapper.find("button.btn-secondary").text()).toBe("Scan");
  });

  it("names the empty scan select by what to do next", () => {
    const wrapper = mountField("device", {
      type: "string",
      label: "Device",
      ui: { component: "select-scan" },
    });

    expect(wrapper.findComponent(SelectPill).props("displayLabel")).toBe(
      "— Click Scan to discover —"
    );
  });
});
