import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PluginFieldRenderer from "@/components/PluginFieldRenderer.vue";

describe("PluginFieldRenderer number field", () => {
  it("applies min/max from ui.validation to the number input", () => {
    // Canonical contract-1.0 shape: numeric bounds live under ui.validation.
    const wrapper = mount(PluginFieldRenderer, {
      props: {
        pluginId: "yr_weather",
        fieldKey: "latitude",
        schema: {
          type: "number",
          ui: { component: "number", validation: { min: -90, max: 90 } },
        },
        value: 0,
      },
    });

    const input = wrapper.find('input[type="number"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes("min")).toBe("-90");
    expect(input.attributes("max")).toBe("90");
  });
});
