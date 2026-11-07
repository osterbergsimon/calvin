import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";

describe("ToggleSwitch disabled", () => {
  it("does not emit while disabled", async () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false, disabled: true } });
    expect(wrapper.attributes("disabled")).toBeDefined();
    await wrapper.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});
