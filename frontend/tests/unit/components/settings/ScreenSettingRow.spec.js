import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreenSettingRow from "@/components/settings/shared/ScreenSettingRow.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import RangeSlider from "@/components/ui/RangeSlider.vue";
import PhotoSourcePicker from "@/components/settings/shared/PhotoSourcePicker.vue";
import ScopeLine from "@/components/ui/ScopeLine.vue";

const descriptor = (over = {}) => ({
  key: "demo",
  label: "Demo",
  section: "behaviour",
  description: "What Demo does.",
  control: { kind: "segmented", options: [{ value: "a", label: "A" }] },
  browserLayer: false,
  keywords: ["demo"],
  resetTest: "reset-demo",
  ...over,
});

const mountRow = (props = {}) =>
  mount(ScreenSettingRow, {
    props: { descriptor: descriptor(), value: "a", showScope: false, ...props },
  });

describe("ScreenSettingRow — descriptor kinds", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders a segmented control and emits the picked value", async () => {
    const wrapper = mountRow({
      descriptor: descriptor({
        control: {
          kind: "segmented",
          options: [
            { value: "auto", label: "Auto" },
            { value: "full", label: "Full" },
          ],
        },
      }),
      value: "auto",
    });

    const control = wrapper.findComponent(SegmentedControl);
    expect(control.exists()).toBe(true);
    expect(control.props("options").map(option => option.label)).toEqual(["Auto", "Full"]);
    control.vm.$emit("update:modelValue", "full");
    expect(wrapper.emitted("set")).toEqual([["full"]]);
  });

  it("renders a toggle and emits the new state", () => {
    const wrapper = mountRow({
      descriptor: descriptor({ control: { kind: "toggle" } }),
      value: false,
    });

    const control = wrapper.findComponent(ToggleSwitch);
    expect(control.exists()).toBe(true);
    expect(control.props("modelValue")).toBe(false);
    control.vm.$emit("update:modelValue", true);
    expect(wrapper.emitted("set")).toEqual([[true]]);
  });

  it("renders an inverted toggle, so Hide controls is on while showUI is off", () => {
    const wrapper = mountRow({
      descriptor: descriptor({ key: "showUI", control: { kind: "toggle", invert: true } }),
      value: true,
    });

    const control = wrapper.findComponent(ToggleSwitch);
    expect(control.props("modelValue")).toBe(false);
    control.vm.$emit("update:modelValue", true);
    expect(wrapper.emitted("set")).toEqual([[false]]);
  });

  it("renders a range control and emits its number", () => {
    const wrapper = mountRow({
      descriptor: descriptor({
        control: { kind: "range", min: 40, max: 96, step: 4, unit: "px" },
      }),
      value: 64,
    });

    const control = wrapper.findComponent(RangeSlider);
    expect(control.exists()).toBe(true);
    expect(control.props("min")).toBe(40);
    expect(control.props("max")).toBe(96);
    control.vm.$emit("update:modelValue", 80);
    expect(wrapper.emitted("set")).toEqual([[80]]);
  });

  it("renders a select with a value outside its list and emits it", () => {
    const wrapper = mountRow({
      descriptor: descriptor({
        label: "Start after",
        control: {
          kind: "select",
          keepCurrent: true,
          options: [
            { value: 300, label: "5 min" },
            { value: 600, label: "10 min" },
          ],
          formatOption: seconds => `${seconds / 60} min`,
        },
      }),
      value: 420,
    });

    const control = wrapper.findComponent(SelectPill);
    expect(control.exists()).toBe(true);
    expect(control.props("options").map(option => option.label)).toEqual([
      "5 min",
      "7 min",
      "10 min",
    ]);
    control.vm.$emit("update:modelValue", 600);
    expect(wrapper.emitted("set")).toEqual([[600]]);
  });

  it("renders a number with its limits and emits the stepper value", () => {
    const wrapper = mountRow({
      descriptor: descriptor({
        control: { kind: "number", min: 5, max: 60, step: 5, unit: "s" },
      }),
      value: 20,
    });

    const control = wrapper.findComponent(NumberStepper);
    expect(control.exists()).toBe(true);
    expect(control.props()).toMatchObject({ modelValue: 20, min: 5, max: 60, step: 5, unit: "s" });
    control.vm.$emit("update:modelValue", 25);
    expect(wrapper.emitted("set")).toEqual([[25]]);
  });

  it("renders the theme picker and emits the chosen theme id", () => {
    const wrapper = mount(ScreenSettingRow, {
      props: {
        descriptor: descriptor({
          key: "selectedTheme",
          label: "Theme",
          section: "look",
          control: { kind: "theme" },
        }),
        value: null,
        showScope: true,
      },
      global: {
        stubs: {
          ThemePicker: {
            name: "ThemePicker",
            props: ["selectedThemeId"],
            emits: ["select"],
            template: '<div class="theme-picker-stub" />',
          },
        },
      },
    });

    const picker = wrapper.findComponent({ name: "ThemePicker" });
    expect(picker.exists()).toBe(true);
    expect(picker.props("selectedThemeId")).toBeNull();
    picker.vm.$emit("select", "ocean");
    expect(wrapper.emitted("set")).toEqual([["ocean"]]);
  });

  it("renders dark hours as a whole-hour time field and emits the hour", async () => {
    const wrapper = mountRow({
      descriptor: descriptor({
        key: "darkModeStart",
        label: "Dark from",
        section: "look",
        control: { kind: "time" },
        showWhen: { key: "themeMode", equals: "time" },
      }),
      value: 18,
    });

    const input = wrapper.find('input[type="time"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes("step")).toBe("3600");
    expect(input.element.value).toBe("18:00");
    await input.setValue("20:00");
    expect(wrapper.emitted("set")).toEqual([[20]]);
  });

  it("renders the photo-source picker for the photos-from row", () => {
    const wrapper = mountRow({
      descriptor: descriptor({
        label: "Photos from",
        control: { kind: "photoSources" },
      }),
      value: [],
    });

    const control = wrapper.findComponent(PhotoSourcePicker);
    expect(control.exists()).toBe(true);
    control.vm.$emit("update:modelValue", ["image-1"]);
    expect(wrapper.emitted("set")).toEqual([[["image-1"]]]);
  });
});

describe("ScreenSettingRow — scope", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows Same as Default / Changed here only when asked", async () => {
    const inherited = mountRow({
      descriptor: descriptor(),
      value: "a",
      overridden: false,
      showScope: true,
    });
    expect(inherited.findComponent(ScopeLine).exists()).toBe(true);
    expect(inherited.text()).toContain("Same as Default");

    const own = mountRow({
      descriptor: descriptor(),
      value: "a",
      overridden: true,
      showScope: true,
    });
    expect(own.text()).toContain("Changed here");
    await own.find('[data-test="reset-demo"]').trigger("click");
    expect(own.emitted("reset")).toHaveLength(1);
  });

  it("renders nothing scope-related on Default", () => {
    const wrapper = mountRow({ descriptor: descriptor(), value: "a", showScope: false });
    expect(wrapper.findComponent(ScopeLine).exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Same as Default");
    expect(wrapper.text()).not.toContain("Changed here");
  });

  it("keeps a row with no description free of an empty description block on Default", () => {
    const wrapper = mountRow({
      descriptor: descriptor({ description: "" }),
      value: "a",
      showScope: false,
    });
    expect(wrapper.find(".setting-row__desc").exists()).toBe(false);
  });
});

describe("ScreenSettingRow — notes", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows the resolved Auto note only while the value is Auto", () => {
    const auto = mountRow({
      descriptor: descriptor({
        control: {
          kind: "segmented",
          options: [
            { value: "auto", label: "Auto" },
            { value: "standard", label: "Standard" },
          ],
        },
      }),
      value: "auto",
      autoNote: "Auto (Standard on this screen)",
    });
    expect(auto.text()).toContain("Auto (Standard on this screen)");

    const explicit = mountRow({
      descriptor: auto.props("descriptor"),
      value: "standard",
      autoNote: "Auto (Standard on this screen)",
    });
    expect(explicit.text()).not.toContain("Auto (Standard on this screen)");
  });

  it("shows a one-off row note, such as when the screen will pick a change up", () => {
    const wrapper = mountRow({ note: "Kitchen will switch on its next check (about 30 s)" });
    expect(wrapper.find("[data-test='demo-note']").text()).toBe(
      "Kitchen will switch on its next check (about 30 s)"
    );
  });
});
