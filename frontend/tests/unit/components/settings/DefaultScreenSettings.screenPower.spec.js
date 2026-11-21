// The household Screen power choice on the Default page (calvin-25g9, UI spec
// §4.2): the same control as a screen page, without a ScopeLine or Screen now.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import { useKiosksStore } from "@/stores/kiosks";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), open: vi.fn(), up: vi.fn() }),
}));

const stubs = { DisplayScheduleGrid: false, RebootCombo: true };

const week = [0, 1, 2, 3, 4, 5, 6].map(day => ({
  day,
  enabled: true,
  onTime: "06:30",
  offTime: "22:00",
}));

const baseConfig = (over = {}) => ({
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  screenPower: "schedule",
  displayScheduleEnabled: true,
  displaySchedule: week,
  timezone: "UTC",
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  rebootComboKey1: "KEY_1",
  rebootComboKey2: "KEY_7",
  rebootComboDuration: 10000,
  availableScreens: null,
  defaultScreenId: null,
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [{ id: "home", name: "Home", layout: { version: 1, regions: [] } }],
  },
  ...over,
});

const mountDefault = (over = {}) =>
  mount(DefaultScreenSettings, {
    props: { config: baseConfig(over) },
    global: { stubs },
  });

const powerControl = wrapper =>
  wrapper.findAllComponents(SegmentedControl).find(c => c.props("ariaLabel") === "Screen power");

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
  window.sessionStorage.clear();
  pushMock.mockClear();
});

describe("DefaultScreenSettings — Screen power", () => {
  it("shows the control with the hint for the household choice and no Screen now", async () => {
    const wrapper = mountDefault({ screenPower: "schedule" });
    await nextTick();

    expect(wrapper.find("[data-test='default-screen-power-hint']").text()).toBe(
      "Turns on and off at the times below."
    );
    expect(powerControl(wrapper).props("modelValue")).toBe("schedule");
    expect(wrapper.find(".scope-line").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Screen now");
    expect(wrapper.find("[data-test='screen-now-state']").exists()).toBe(false);
  });

  it("emits the household mode and shows the schedule only in Schedule", async () => {
    const wrapper = mountDefault({ screenPower: "schedule" });
    await nextTick();
    expect(wrapper.findComponent(DisplayScheduleGrid).exists()).toBe(true);
    expect(wrapper.text()).toContain("Timezone");

    powerControl(wrapper).vm.$emit("update:modelValue", "external");
    expect(wrapper.emitted("update:config").at(-1)).toEqual([{ screenPower: "external" }]);
  });

  it("hides the schedule in Always on and External", async () => {
    const always = mountDefault({ screenPower: "always_on", displayScheduleEnabled: false });
    await nextTick();
    expect(always.findComponent(DisplayScheduleGrid).exists()).toBe(false);
    expect(always.find("[data-test='default-screen-power-hint']").text()).toBe(
      "Never turns off on a schedule. Turn off when idle still applies."
    );

    const external = mountDefault({ screenPower: "external", displayScheduleEnabled: false });
    await nextTick();
    expect(external.findComponent(DisplayScheduleGrid).exists()).toBe(false);
    expect(external.find("[data-test='default-screen-power-hint']").text()).toBe(
      "Homey, Home Assistant or a script with an API key turns it on and off."
    );
  });

  it("shows the API key notes in External", async () => {
    const wrapper = mountDefault({ screenPower: "external", displayScheduleEnabled: false });
    await nextTick();
    expect(wrapper.find("[data-test='default-screen-power-keys']").exists()).toBe(true);
    expect(wrapper.find("[data-test='default-screen-power-guide']").exists()).toBe(true);

    await wrapper.find("[data-test='default-screen-power-keys']").trigger("click");
    expect(pushMock).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "security-api-keys" },
    });
  });

  it("drops the guide note on the kiosk itself", async () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "hall");
    const wrapper = mountDefault({ screenPower: "external", displayScheduleEnabled: false });
    await nextTick();
    expect(wrapper.find("[data-test='default-screen-power-keys']").exists()).toBe(true);
    expect(wrapper.find("[data-test='default-screen-power-guide']").exists()).toBe(false);
  });

  it("counts a legacy schedule switch as its own screen power, and clears it too", async () => {
    const store = useKiosksStore();
    store.kiosks = [
      { id: "hall", overrides: { displayName: "Hall", displayScheduleEnabled: false } },
    ];
    store.saveOverrides = vi.fn(async () => {});
    store.setKioskOverrides = vi.fn();

    const wrapper = mountDefault({ screenPower: "schedule", displayScheduleEnabled: true });
    await nextTick();
    powerControl(wrapper).vm.$emit("update:modelValue", "external");
    await nextTick();

    const note = wrapper.find("[data-test='default-override-note']");
    expect(note.text()).toContain("Hall keeps its own screen power.");
    await note.find("[data-test='default-note-change']").trigger("click");
    await nextTick();

    expect(store.saveOverrides).toHaveBeenCalledWith("hall", { displayName: "Hall" });
  });

  it("names the screens that keep their own screen power", async () => {
    useKiosksStore().kiosks = [
      { id: "hall", overrides: { displayName: "Hall", screenPower: "external" } },
      { id: "office", overrides: { displayName: "Office", screenPower: "always_on" } },
    ];
    const wrapper = mountDefault({ screenPower: "schedule" });
    await nextTick();

    powerControl(wrapper).vm.$emit("update:modelValue", "always_on");
    await nextTick();

    const note = wrapper.find("[data-test='default-override-note']");
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("Hall and Office keep their own screen power.");
  });
});
