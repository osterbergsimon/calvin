import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import RebootCombo from "@/components/settings/tabs/layout/keyboard/RebootCombo.vue";

// Control what a "press a button" capture resolves to.
const h = vi.hoisted(() => ({ result: { value: null }, cancelled: { value: false } }));
vi.mock("@/composables/useKeyCapture", () => ({
  useKeyCapture: () => ({
    capturing: { value: false },
    capture: () => Promise.resolve(h.result.value),
    cancel: () => {
      h.cancelled.value = true;
    },
  }),
}));

const stubs = { NumberStepper: true };
const config = () => ({ rebootComboKey1: "KEY_1", rebootComboKey2: "KEY_7", rebootComboDuration: 10000 });

const mountRC = (cfg = config()) => mount(RebootCombo, { props: { config: cfg }, global: { stubs } });

describe("RebootCombo", () => {
  beforeEach(() => {
    h.result.value = null;
    h.cancelled.value = false;
  });

  it("shows friendly key labels (KEY_ stripped) on the combo tiles", () => {
    const w = mountRC();
    const caps = w.findAll(".rc-key-cap").map(c => c.text());
    expect(caps).toEqual(["1", "7"]);
  });

  it("captures a pressed key and emits the new first key", async () => {
    h.result.value = "KEY_3";
    const w = mountRC();
    await w.findAll(".rc-key")[0].trigger("click");
    await flushPromises();
    expect(w.emitted("update:config")?.[0]).toEqual([{ rebootComboKey1: "KEY_3" }]);
  });

  it("rejects a key equal to the other slot and warns instead of emitting", async () => {
    h.result.value = "KEY_7"; // same as the second key
    const w = mountRC();
    await w.findAll(".rc-key")[0].trigger("click");
    await flushPromises();
    expect(w.emitted("update:config")).toBeFalsy();
    expect(w.find(".rc-warn").text()).toMatch(/must be different/i);
  });

  it("keeps the current key when capture is cancelled (null)", async () => {
    h.result.value = null;
    const w = mountRC();
    await w.findAll(".rc-key")[1].trigger("click");
    await flushPromises();
    expect(w.emitted("update:config")).toBeFalsy();
  });

  it("shows the duration in seconds and emits milliseconds", async () => {
    const w = mountRC();
    w.findComponent({ name: "NumberStepper" }).vm.$emit("update:modelValue", 5);
    await flushPromises();
    expect(w.emitted("update:config")?.[0]).toEqual([{ rebootComboDuration: 5000 }]);
  });
});
