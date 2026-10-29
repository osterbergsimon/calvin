import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";
import KeyBindingBoard from "@/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue";
import ActionPicker from "@/components/settings/tabs/layout/keyboard/ActionPicker.vue";
import { useKeyboardStore } from "@/stores/keyboard";
import api from "@/services/api";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT: 600000,
}));

describe("KeyboardTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { mappings: { KEY_1: "generic_prev" } } });
    api.put.mockResolvedValue({ data: {} });
  });

  it("loads mappings and renders the board", async () => {
    const w = mount(KeyboardTab);
    await flushPromises();
    expect(w.findComponent(KeyBindingBoard).exists()).toBe(true);
    expect(w.text()).toContain("Previous"); // actionLabel(generic_prev)
  });

  it("opens the picker on edit and saves the selection", async () => {
    const store = useKeyboardStore();
    const w = mount(KeyboardTab);
    await flushPromises();
    // Trigger edit for KEY_1 via the board's emit
    w.findComponent(KeyBindingBoard).vm.$emit("edit", "KEY_1");
    await flushPromises();
    expect(w.findComponent(ActionPicker).exists()).toBe(true);
    w.findComponent(ActionPicker).vm.$emit("select", "generic_next");
    await flushPromises();
    expect(api.put).toHaveBeenCalledWith("/keyboard/mappings/KEY_1", {
      action: "generic_next",
    });
    expect(store.mappings.KEY_1).toBe("generic_next");
  });
});
