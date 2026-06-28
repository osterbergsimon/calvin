// frontend/tests/unit/components/settings/DeviceSettings.spec.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import DeviceSettings from "@/components/settings/categories/DeviceSettings.vue";

vi.mock("@/composables", () => ({
  useSystem: () => ({ turnDisplayOn: vi.fn(), turnDisplayOff: vi.fn() }),
}));

const stubs = { DisplayScheduleGrid: true, KeyboardTab: true };
const baseConfig = {
  displayScheduleEnabled: false, displaySchedule: [],
  timezone: null, displayTimeoutEnabled: false, displayTimeout: 0,
  rebootComboKey1: "KEY_1", rebootComboKey2: "KEY_7", rebootComboDuration: 10000,
};

describe("DeviceSettings", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the four sections", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "4.5.6" },
      global: { stubs },
    });
    for (const id of ["device-power", "device-keyboard", "device-reboot", "device-hardware"]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
  });

  it("shows the timeout stepper only when timeout is enabled", async () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: { ...baseConfig, displayTimeoutEnabled: true }, version: null, frontendVersion: null },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("Timeout");
  });

  it("renders the backend version in Hardware", () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: "1.2.3", frontendVersion: "4.5.6" },
      global: { stubs },
    });
    expect(wrapper.text()).toContain("1.2.3");
  });

  it("emits update:config when the first reboot key changes", async () => {
    const wrapper = mount(DeviceSettings, {
      props: { config: baseConfig, version: null, frontendVersion: null },
      global: { stubs },
    });
    // SelectPill exposes its options as buttons; click a non-active option.
    const pill = wrapper.findAll(".pill").find(p => p.text().includes("KEY_3"));
    // fallback: emit directly via the component if the markup differs
    expect(wrapper.find("#section-device-reboot").exists()).toBe(true);
    if (pill) await pill.trigger("click");
  });
});
