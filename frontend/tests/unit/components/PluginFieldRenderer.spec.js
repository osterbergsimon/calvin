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

  const mountNumber = schema =>
    mount(PluginFieldRenderer, {
      props: { pluginId: "p", fieldKey: "f", schema, value: 0 },
    }).find('input[type="number"]');

  it('allows decimals for type "number" via step="any"', () => {
    // Without an explicit step the browser defaults to step=1, which rejects
    // decimal values (e.g. geographic coordinates) as a stepMismatch on submit.
    const input = mountNumber({ type: "number", ui: { component: "number" } });
    expect(input.attributes("step")).toBe("any");
  });

  it('keeps whole-number stepping for type "integer"', () => {
    const input = mountNumber({ type: "integer", ui: { component: "number" } });
    expect(input.attributes("step")).toBe("1");
  });

  it("lets an explicit ui.step override the type-derived default", () => {
    const input = mountNumber({ type: "number", ui: { component: "number", step: "0.0001" } });
    expect(input.attributes("step")).toBe("0.0001");
  });
});
