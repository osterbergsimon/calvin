import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

const applyTypeTheme = vi.fn();
const current = ref("instrument");
vi.mock("@/composables/useTypeTheme", () => ({
  useTypeTheme: () => ({ current, applyTypeTheme, loadTypeTheme: vi.fn() }),
}));

import TypefacePicker from "@/components/settings/shell/TypefacePicker.vue";
import SelectPill from "@/components/ui/SelectPill.vue";

describe("TypefacePicker", () => {
  it("lists the three type themes and applies on change", async () => {
    const w = mount(TypefacePicker);
    w.findComponent(SelectPill).vm.$emit("update:modelValue", "marquee");
    await w.vm.$nextTick();
    expect(applyTypeTheme).toHaveBeenCalledWith("marquee");
  });
});
