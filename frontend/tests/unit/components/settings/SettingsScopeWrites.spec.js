// settings-scope §7 item 10 — the descriptor rows write the right target.
//
// One test per descriptor, so a new per-screen setting is covered as soon as it
// is added to SCREEN_SETTING_DESCRIPTORS. A screen page writes that screen's
// overrides from any browser; Screens › Default writes the household config and
// never a kiosk override or a localStorage copy (the F1 regression).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises as flushPromisesNow } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import DefaultScreenSettings from "@/components/settings/categories/DefaultScreenSettings.vue";
import ScreenSettingRow from "@/components/settings/shared/ScreenSettingRow.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import { SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";
import { SCREEN_SETTING_DESCRIPTORS } from "@/utils/screenOverrides";
import { screenStorageKey } from "@/utils/screenSetting";
import { LAYOUT_STORAGE_KEY } from "@/utils/layoutMode";
import { useKiosksStore } from "@/stores/kiosks";

// The idle row writes two keys at once (enabled + seconds); it is one setting,
// so the descriptor pair is covered by its own test below instead of the loop.
const SHARED_IDLE_KEYS = new Set(["displayTimeoutEnabled", "displayTimeout"]);

// Values that make every conditional row visible: the corner rows need hidden
// controls, the photo-frame rows need the frame on, and the dark hours need the
// schedule mode.
const VISIBLE_OVERRIDES = {
  showUI: false,
  photoFrameEnabled: true,
  themeMode: "time",
  displayScheduleEnabled: true,
};

const RETIRED_KEYS = {
  // Layout mode used its own old key before the descriptors; any write through
  // the old browser path would still be a leftover of that path.
  layoutMode: LAYOUT_STORAGE_KEY,
};

const baseConfig = over => ({
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  displayScheduleEnabled: true,
  displaySchedule: [],
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  touchControls: "auto",
  onScreenKeyboard: "auto",
  showUI: false,
  photoFrameEnabled: true,
  themeMode: "time",
  selectedTheme: null,
  typeTheme: "instrument",
  availableScreens: null,
  defaultScreenId: null,
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [{ id: "home", name: "Home", layout: { version: 1, direction: "row", regions: [] } }],
  },
  ...over,
});

const kiosk = (over = {}) => ({
  id: "kitchen",
  hostname: "kitchen-pi",
  lastSeen: new Date().toISOString(),
  lastAppliedVersion: null,
  agentVersion: null,
  agentUpdateStatus: "ok",
  agentUpdateMessage: null,
  agentUpdateRequested: false,
  overrides: {},
  viewport: null,
  displayStack: null,
  ...over,
});

async function flushQueuedSave() {
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  await flushPromisesNow();
}

function mountScreens({ kioskScope = false, overrides = {}, cfg = baseConfig() } = {}) {
  setActivePinia(createPinia());
  window.localStorage.clear();
  window.sessionStorage.clear();
  if (kioskScope) window.sessionStorage.setItem("calvin_kiosk_id", "kitchen");

  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = [kiosk({ overrides })];
  });
  store.refreshKiosks = vi.fn(async () => {});
  store.fetchOverrides = vi.fn(async () => overrides);
  store.saveOverrides = vi.fn(async () => {});
  store.setKioskOverrides = vi.fn((id, next) => {
    const target = store.kiosks.find(item => item.id === id);
    if (target) target.overrides = next;
  });
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => null);

  return {
    wrapper: mount(ScreensSettings, { props: { config: cfg } }),
    store,
  };
}

async function openScreen(wrapper) {
  await wrapper.find("[data-test='screen-card']").trigger("click");
  await flushQueuedSave();
}

function rowsByDescriptor(wrapper) {
  return new Map(
    wrapper.findAllComponents(ScreenSettingRow).map(row => [row.props("descriptor")?.key, row])
  );
}

const controlByAria = (wrapper, kind, label) =>
  wrapper.findAllComponents(kind).find(control => control.props("ariaLabel") === label);

// The rows that still have a hand-written control rather than ScreenSettingRow.
// They are still descriptors, so the loop below includes them; this map is the
// explicit place a newly hand-written row has to be registered.
const manualControls = {
  orientation: wrapper => controlByAria(wrapper, SegmentedControl, "Orientation"),
  orientationFlipped: wrapper => controlByAria(wrapper, ToggleSwitch, "Upside down"),
  applyDisplayRotation: wrapper => controlByAria(wrapper, ToggleSwitch, "Rotate the screen output"),
  displayScheduleEnabled: wrapper => controlByAria(wrapper, ToggleSwitch, "Screen on/off schedule"),
  displaySchedule: wrapper => wrapper.findComponent(DisplayScheduleGrid),
  touchControls: wrapper => controlByAria(wrapper, SegmentedControl, "Touchscreen"),
  onScreenKeyboard: wrapper => controlByAria(wrapper, SegmentedControl, "On-screen keyboard"),
};

function nextValue(descriptor, current) {
  const control = descriptor.control || {};
  if (control.kind === "theme") return current === "ocean" ? "marble" : "ocean";
  if (control.kind === "time") {
    const hour = Number(current);
    return Number.isFinite(hour) ? (hour + 2) % 24 : 20;
  }
  if (control.kind === "toggle") return !current;
  if (control.kind === "segmented" || control.kind === "select") {
    const options = control.options || [];
    const other = options.find(option => option.value !== current);
    if (other) return other.value;
  }
  if (control.kind === "number" || control.kind === "range") {
    const min = control.min ?? 0;
    const max = control.max ?? 100;
    return Number(current) === min ? max : min;
  }
  if (control.kind === "photoSources") return current?.length ? [] : ["img-1"];
  if (control.kind === "schedule") {
    return [{ day: 0, enabled: true, onTime: "07:00", offTime: "22:00" }];
  }
  throw new Error(`No next value for descriptor ${descriptor.key} (${control.kind})`);
}

function rowValue(wrapper, descriptor) {
  const row = rowsByDescriptor(wrapper).get(descriptor.key);
  if (row) return row.props("value");
  const control = manualControls[descriptor.key]?.(wrapper);
  if (!control) return undefined;
  // DisplayScheduleGrid models the array directly; the rest model the value.
  return control.props("modelValue");
}

async function emitRowValue(wrapper, descriptor, value) {
  const row = rowsByDescriptor(wrapper).get(descriptor.key);
  if (row) {
    row.vm.$emit("set", value);
    return;
  }
  const control = manualControls[descriptor.key]?.(wrapper);
  if (!control) {
    throw new Error(
      `No row for descriptor ${descriptor.key}. Add it to ScreenSettingRow or manualControls.`
    );
  }
  control.vm.$emit("update:modelValue", value);
}

const descriptorsUnderTest = SCREEN_SETTING_DESCRIPTORS.filter(
  descriptor => !SHARED_IDLE_KEYS.has(descriptor.key)
);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe.each([
  ["a plain browser", false],
  ["a kiosk browser", true],
])("Screens › {screen} writes that screen's overrides from %s", (scopeLabel, kioskScope) => {
  it.each(descriptorsUnderTest.map(descriptor => [descriptor.key, descriptor]))(
    "%s writes the kiosk override",
    async (_key, descriptor) => {
      const { wrapper, store } = mountScreens({ kioskScope, overrides: VISIBLE_OVERRIDES });
      await flushPromisesNow();
      await openScreen(wrapper);

      const current = rowValue(wrapper, descriptor);
      const next = nextValue(descriptor, current);
      await emitRowValue(wrapper, descriptor, next);
      await flushQueuedSave();

      const [id, saved] = store.saveOverrides.mock.calls.at(-1) || [];
      expect(id, `${descriptor.key} target`).toBe("kitchen");
      expect(saved, `${descriptor.key} saved value`).toMatchObject({ [descriptor.key]: next });

      // Never the household config, and no browser copy of a per-screen row.
      expect(wrapper.emitted("update:config"), `${descriptor.key} config write`).toBeUndefined();
      expect(
        window.localStorage.getItem(
          RETIRED_KEYS[descriptor.key] ?? screenStorageKey(descriptor.key)
        ),
        `${descriptor.key} localStorage`
      ).toBeNull();

      wrapper.unmount();
    }
  );
});

describe("Screens › {screen} idle row", () => {
  it("writes enabled and seconds to that screen, not the household config", async () => {
    const { wrapper, store } = mountScreens({ overrides: VISIBLE_OVERRIDES });
    await flushPromisesNow();
    await openScreen(wrapper);

    const idle = controlByAria(wrapper, SelectPill, "Turn off when idle");
    idle.vm.$emit("update:modelValue", 900);
    await flushQueuedSave();

    expect(store.saveOverrides.mock.calls.at(-1)?.[1]).toMatchObject({
      displayTimeoutEnabled: true,
      displayTimeout: 900,
    });
    expect(wrapper.emitted("update:config")).toBeUndefined();
    expect(window.localStorage.getItem(screenStorageKey("displayTimeout"))).toBeNull();
    wrapper.unmount();
  });
});

describe("Screens › Default writes the household config", () => {
  function mountDefault(overrides = {}) {
    setActivePinia(createPinia());
    window.localStorage.clear();
    const store = useKiosksStore();
    store.kiosks = [];
    store.saveOverrides = vi.fn(async () => {});
    return mount(DefaultScreenSettings, {
      props: { config: baseConfig(overrides) },
      global: { stubs: { RebootCombo: true } },
    });
  }

  it.each(descriptorsUnderTest.map(descriptor => [descriptor.key, descriptor]))(
    "%s emits the household patch",
    async (_key, descriptor) => {
      const wrapper = mountDefault();
      await flushPromisesNow();

      const current = rowValue(wrapper, descriptor);
      const next = nextValue(descriptor, current);
      await emitRowValue(wrapper, descriptor, next);

      const emitted = wrapper.emitted("update:config") || [];
      expect(emitted.at(-1)?.[0], descriptor.key).toEqual({ [descriptor.key]: next });
      // Default is the household form: no kiosk write and no browser copy (F1).
      expect(useKiosksStore().saveOverrides, descriptor.key).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(screenStorageKey(descriptor.key)), descriptor.key).toBe(
        null
      );
      wrapper.unmount();
    }
  );

  it("writes the idle row as household enabled and seconds", async () => {
    const wrapper = mountDefault();
    await flushPromisesNow();

    const idle = controlByAria(wrapper, SelectPill, "Turn off when idle");
    idle.vm.$emit("update:modelValue", 1800);

    expect(wrapper.emitted("update:config")).toContainEqual([
      { displayTimeoutEnabled: true, displayTimeout: 1800 },
    ]);
    expect(useKiosksStore().saveOverrides).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(screenStorageKey("displayTimeout"))).toBeNull();
    wrapper.unmount();
  });
});
