import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SettingRowStack from "@/components/settings/shell/SettingRowStack.vue";

describe("SettingRowStack", () => {
  it("renders its slot content inside the shared stack wrapper", () => {
    const w = mount(SettingRowStack, {
      slots: { default: "<p class='stacked-row'>Restart time</p>" },
    });
    const stack = w.find(".setting-row-stack");
    expect(stack.exists()).toBe(true);
    expect(stack.find(".stacked-row").text()).toBe("Restart time");
  });
});
