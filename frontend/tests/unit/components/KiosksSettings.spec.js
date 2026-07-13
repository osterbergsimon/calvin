import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KiosksSettings from "@/components/settings/categories/KiosksSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { useConfigStore } from "@/stores/config";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import CollapsibleSection from "@/components/settings/shared/CollapsibleSection.vue";

function mountWithKiosks(list) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = list;
  });
  store.fetchOverrides = vi.fn(async () => ({}));
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  return mount(KiosksSettings);
}

describe("KiosksSettings — list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the empty state when there are no kiosks", async () => {
    const w = mountWithKiosks([]);
    await flushPromises();
    expect(w.text()).toContain("No kiosks have connected yet");
  });

  it("renders a card per kiosk with id and hostname", async () => {
    const now = new Date().toISOString();
    const w = mountWithKiosks([
      { id: "kitchen-1", hostname: "raspberrypi", lastSeen: now, lastAppliedVersion: null },
    ]);
    await flushPromises();
    expect(w.text()).toContain("kitchen-1");
    expect(w.text()).toContain("raspberrypi");
  });

  it("marks a recently-seen kiosk Online and a stale one Offline", async () => {
    const recent = new Date().toISOString();
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const w = mountWithKiosks([
      { id: "on", hostname: "a", lastSeen: recent, lastAppliedVersion: null },
      { id: "off", hostname: "b", lastSeen: stale, lastAppliedVersion: null },
    ]);
    await flushPromises();
    const cards = w.findAll("[data-test='kiosk-card']");
    expect(cards[0].text()).toContain("Online");
    expect(cards[1].text()).toContain("Offline");
  });
});

describe("KiosksSettings — orientation editor", () => {
  beforeEach(() => vi.clearAllMocks());

  async function selectFirst(list, overrides = {}) {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = list;
    });
    store.fetchOverrides = vi.fn(async () => overrides);
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.orientation = "landscape";
    cfg.orientationFlipped = false;
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w, store, cfg };
  }

  const one = [
    { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
  ];

  it("shows the global default as effective when no override, tagged inherited", async () => {
    const { w } = await selectFirst(one, {});
    expect(w.text().toLowerCase()).toContain("inherited from global");
  });

  it("changing orientation saves a merged override and tags it set", async () => {
    const { w, store } = await selectFirst(one, { availableScreens: ["a"] });
    // Emit SegmentedControl's event to exercise the parent's @update:model-value handler
    // without depending on SegmentedControl's internal button markup.
    w.findComponent(SegmentedControl).vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      availableScreens: ["a"],
      orientation: "portrait",
    });
    expect(w.text().toLowerCase()).toContain("set for this kiosk");
  });

  it("Reset to global removes only the orientation keys", async () => {
    const { w, store } = await selectFirst(one, {
      orientation: "portrait",
      availableScreens: ["a"],
    });
    await w.find("[data-test='reset-orientation']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { availableScreens: ["a"] });
  });

  it("Reset to global button is disabled when there is no orientation override", async () => {
    const { w } = await selectFirst(one, {});
    const btn = w.find("[data-test='reset-orientation']");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("shows save-failure copy and no success copy when saveOverrides rejects", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = one;
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {
      throw new Error("network error");
    });
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    w.findComponent(SegmentedControl).vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(w.text()).toContain("Couldn't save to the server. Check the connection and try again.");
    expect(w.text()).not.toContain("Saved.");
  });

  it("shows offline post-save copy when the kiosk is not recently seen", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const offline = [{ id: "k1", hostname: "pi", lastSeen: stale, lastAppliedVersion: null }];
    const { w } = await selectFirst(offline, {});
    w.findComponent(SegmentedControl).vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(w.text()).toContain("Saved. Changes apply when this kiosk reconnects.");
  });

  it("setFlipped preserves unrelated override keys alongside orientationFlipped", async () => {
    const { w, store } = await selectFirst(one, { availableScreens: ["a"] });
    // ToggleSwitch[1] is the Flip 180° control (index 0 is the Power schedule toggle in the schedule section)
    w.findAllComponents(ToggleSwitch)[1].vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      availableScreens: ["a"],
      orientationFlipped: true,
    });
  });
});

describe("KiosksSettings — content editor", () => {
  beforeEach(() => vi.clearAllMocks());

  const one = [
    { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
  ];

  const twoScreens = {
    version: 2,
    activeScreenId: "a",
    screens: [
      { id: "a", name: "Home" },
      { id: "b", name: "Agenda" },
    ],
  };

  // Mounts the view, seeds a screen catalog, selects the first kiosk with the given overrides.
  async function selectContent(list, overrides = {}, screens = twoScreens) {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = list;
    });
    store.fetchOverrides = vi.fn(async () => overrides);
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.orientation = "landscape";
    cfg.orientationFlipped = false;
    cfg.dashboardScreens = screens;
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w, store, cfg };
  }

  it("shows all screens selected and tagged inherited when there is no override", async () => {
    const { w } = await selectContent(one, {});
    const chips = w.findComponent(ChipMultiSelect);
    expect(chips.props("modelValue")).toEqual(["a", "b"]);
    expect(w.text().toLowerCase()).toContain("inherited from global");
  });

  it("selecting a subset saves availableScreens merged, preserving unrelated keys", async () => {
    const { w, store } = await selectContent(one, { orientation: "portrait" });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a"]);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      orientation: "portrait",
      availableScreens: ["a"],
    });
    expect(w.text().toLowerCase()).toContain("set for this kiosk");
  });

  it("selecting all screens normalizes to inherited (removes availableScreens)", async () => {
    const { w, store } = await selectContent(one, { availableScreens: ["a"] });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a", "b"]);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {});
  });

  it("rejecting an empty selection shows a hint and does not save", async () => {
    const { w, store } = await selectContent(one, { availableScreens: ["a"] });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", []);
    await flushPromises();
    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(w.text()).toContain("Pick at least one screen");
  });

  it("dropping the default's screen from the set clears defaultScreenId", async () => {
    const { w, store } = await selectContent(one, {
      availableScreens: ["a", "b"],
      defaultScreenId: "b",
    });
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a"]);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { availableScreens: ["a"] });
  });

  it("renders a hint and no chips when the catalog has fewer than two screens", async () => {
    const oneScreen = { version: 2, activeScreenId: "a", screens: [{ id: "a", name: "Home" }] };
    const { w } = await selectContent(one, {}, oneScreen);
    expect(w.findComponent(ChipMultiSelect).exists()).toBe(false);
    expect(w.text()).toContain("Add more screens in Display");
  });

  it("shows offline content copy after saving to an offline kiosk", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const offline = [{ id: "k1", hostname: "pi", lastSeen: stale, lastAppliedVersion: null }];
    const { w } = await selectContent(offline, {});
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a"]);
    await flushPromises();
    expect(w.text()).toContain("Saved. Changes apply when this kiosk reconnects.");
  });

  it("shows save-failure copy and no success copy when persistContent's saveOverrides rejects", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = one;
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {
      throw new Error("network error");
    });
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.orientation = "landscape";
    cfg.orientationFlipped = false;
    cfg.dashboardScreens = twoScreens;
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    w.findComponent(ChipMultiSelect).vm.$emit("update:modelValue", ["a"]);
    await flushPromises();
    expect(w.text()).toContain("Couldn't save to the server. Check the connection and try again.");
    expect(w.text()).not.toContain("Saved.");
  });

  it("shows the global active screen as the effective default, tagged inherited", async () => {
    const { w } = await selectContent(one, {});
    const pill = w.findComponent(SelectPill);
    expect(pill.props("modelValue")).toBe("a");
    // find the "Default screen" SettingRow specifically and assert its description prop
    const defaultRow = w
      .findAllComponents(SettingRow)
      .find(r => r.props("label") === "Default screen");
    expect(defaultRow.props("description")).toBe("‹inherited from global›");
  });

  it("Default screen row description is set for this kiosk when defaultScreenId is overridden", async () => {
    const { w } = await selectContent(one, { defaultScreenId: "b" });
    const defaultRow = w
      .findAllComponents(SettingRow)
      .find(r => r.props("label") === "Default screen");
    expect(defaultRow.props("description")).toBe("‹set for this kiosk›");
  });

  it("limits the default-screen options to the available set", async () => {
    const { w } = await selectContent(one, { availableScreens: ["b"] });
    const pill = w.findComponent(SelectPill);
    expect(pill.props("options")).toEqual([{ value: "b", label: "Agenda" }]);
  });

  it("choosing a default saves defaultScreenId merged, preserving unrelated keys", async () => {
    const { w, store } = await selectContent(one, { orientation: "portrait" });
    w.findComponent(SelectPill).vm.$emit("update:modelValue", "b");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      orientation: "portrait",
      defaultScreenId: "b",
    });
  });

  it("Reset content to global removes only the content keys", async () => {
    const { w, store } = await selectContent(one, {
      orientation: "portrait",
      availableScreens: ["a"],
      defaultScreenId: "a",
    });
    await w.find("[data-test='reset-content']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { orientation: "portrait" });
  });

  it("Reset content button is disabled when there is no content override", async () => {
    const { w } = await selectContent(one, { orientation: "portrait" });
    const btn = w.find("[data-test='reset-content']");
    expect(btn.attributes("disabled")).toBeDefined();
  });
});

describe("KiosksSettings — pending badge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the pending badge for an offline kiosk whose applied != desired", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [{ id: "off", hostname: "b", lastSeen: stale, lastAppliedVersion: "old" }];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async () => "new");
    const w = mount(KiosksSettings);
    await flushPromises();
    expect(w.find("[data-test='kiosk-pending-badge']").exists()).toBe(true);
  });

  it("hides the badge when online, when versions match, or when desired is unknown", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    const recent = new Date().toISOString();
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "online-mismatch", hostname: "a", lastSeen: recent, lastAppliedVersion: "old" },
        { id: "offline-match", hostname: "b", lastSeen: stale, lastAppliedVersion: "same" },
        { id: "offline-unknown", hostname: "c", lastSeen: stale, lastAppliedVersion: "old" },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async id => {
      if (id === "online-mismatch") return "new";
      if (id === "offline-match") return "same";
      return null; // offline-unknown → desired unknown → fail-open, no badge
    });
    const w = mount(KiosksSettings);
    await flushPromises();
    expect(w.findAll("[data-test='kiosk-pending-badge']").length).toBe(0);
  });
});

describe("KiosksSettings — status header", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders KioskStatusHeader for the selected kiosk with applied and desired versions", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: "old" },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => "new");
    const w = mount(KiosksSettings);
    await flushPromises();
    // No selection yet → no header.
    expect(w.findComponent(KioskStatusHeader).exists()).toBe(false);
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    const header = w.findComponent(KioskStatusHeader);
    expect(header.exists()).toBe(true);
    expect(header.props("appliedVersion")).toBe("old");
    expect(header.props("desiredVersion")).toBe("new");
    expect(header.props("kioskId")).toBe("k1");
  });
});

describe("KiosksSettings — schedule editor", () => {
  beforeEach(() => vi.clearAllMocks());

  async function selectFirst(overrides = {}) {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
      ];
    });
    store.fetchOverrides = vi.fn(async () => overrides);
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.displayScheduleEnabled = true;
    cfg.displaySchedule = [{ day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }];
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w, store };
  }

  it("shows the global schedule as effective and tagged inherited when no override", async () => {
    const { w } = await selectFirst({});
    const section = w.get("#section-kiosks-schedule");
    expect(section.text().toLowerCase()).toContain("inherited from global");
  });

  it("editing the grid saves a merged displaySchedule override, preserving unrelated keys", async () => {
    const { w, store } = await selectFirst({ orientation: "portrait" });
    const next = [{ day: 0, enabled: false, onTime: "07:00", offTime: "23:00" }];
    w.findComponent(DisplayScheduleGrid).vm.$emit("update:modelValue", next);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", {
      orientation: "portrait",
      displaySchedule: next,
    });
  });

  it("Reset schedule removes only the schedule keys", async () => {
    const { w, store } = await selectFirst({
      orientation: "portrait",
      displayScheduleEnabled: false,
      displaySchedule: [{ day: 0, enabled: false, onTime: "07:00", offTime: "23:00" }],
    });
    await w.find("[data-test='reset-schedule']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("k1", { orientation: "portrait" });
  });

  it("Reset schedule is disabled when there is no schedule override", async () => {
    const { w } = await selectFirst({});
    expect(w.find("[data-test='reset-schedule']").attributes("disabled")).toBeDefined();
  });

  it("shows save-failure copy when saveOverrides rejects", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {
      throw new Error("boom");
    });
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.displayScheduleEnabled = true;
    cfg.displaySchedule = [{ day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }];
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    w.findComponent(DisplayScheduleGrid).vm.$emit("update:modelValue", [
      { day: 0, enabled: false, onTime: "07:00", offTime: "23:00" },
    ]);
    await flushPromises();
    expect(w.get("#section-kiosks-schedule").text()).toContain("Couldn't save to the server");
  });

  it("refreshes desiredVersion after a schedule save so Applied becomes Pending", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    const stale = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: stale, lastAppliedVersion: "v1" },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {});
    // onMounted prefetch → "v1"; select() call → "v1"; post-save refetch → "v2"
    store.fetchDeviceConfigVersion = vi.fn()
      .mockResolvedValueOnce("v1") // onMounted prefetch for k1
      .mockResolvedValueOnce("v1") // select() call
      .mockResolvedValueOnce("v2"); // post-save refreshDesiredVersion
    const cfg = useConfigStore();
    cfg.displayScheduleEnabled = true;
    cfg.displaySchedule = [{ day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }];
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    // Before save: desiredVersion === "v1", appliedVersion === "v1" → Applied
    const header = w.findComponent(KioskStatusHeader);
    expect(header.props("desiredVersion")).toBe("v1");
    expect(header.props("appliedVersion")).toBe("v1");
    // Trigger a schedule edit and save
    w.findComponent(DisplayScheduleGrid).vm.$emit("update:modelValue", [
      { day: 0, enabled: false, onTime: "07:00", offTime: "23:00" },
    ]);
    await flushPromises();
    // After save: desiredVersion should have been refreshed to "v2" → Pending
    expect(w.findComponent(KioskStatusHeader).props("desiredVersion")).toBe("v2");
  });
});

describe("KiosksSettings — detail order and hardware drawer", () => {
  beforeEach(() => vi.clearAllMocks());

  async function selectFirst() {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        { id: "k1", hostname: "pi", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
        { id: "k2", hostname: "pi2", lastSeen: new Date().toISOString(), lastAppliedVersion: null },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.saveOverrides = vi.fn(async () => {});
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    const cfg = useConfigStore();
    cfg.orientation = "landscape";
    cfg.orientationFlipped = false;
    const w = mount(KiosksSettings);
    await flushPromises();
    await w.find("[data-test='kiosk-card']").trigger("click");
    await flushPromises();
    return { w };
  }

  it("orders detail sections Content, then Schedule, then the hardware drawer", async () => {
    const { w } = await selectFirst();
    const html = w.html();
    const iContent = html.indexOf("section-kiosks-content");
    const iSchedule = html.indexOf("section-kiosks-schedule");
    const iHardware = html.indexOf("Display hardware");
    expect(iContent).toBeGreaterThan(-1);
    expect(iContent).toBeLessThan(iSchedule);
    expect(iSchedule).toBeLessThan(iHardware);
  });

  it("puts the orientation editor inside a collapsed drawer that starts closed", async () => {
    const { w } = await selectFirst();
    const drawer = w.findComponent(CollapsibleSection);
    expect(drawer.exists()).toBe(true);
    expect(drawer.get("section").classes()).not.toContain("expanded");
    // orientation controls are still present (v-show keeps them mounted)
    expect(w.find("[data-test='reset-orientation']").exists()).toBe(true);
  });

  it("re-collapses the drawer when switching kiosks", async () => {
    const { w } = await selectFirst();
    const drawer = w.findComponent(CollapsibleSection);
    await drawer.get("button.section-header").trigger("click"); // expand
    expect(drawer.get("section").classes()).toContain("expanded");
    await w.findAll("[data-test='kiosk-card']")[1].trigger("click"); // switch kiosk
    await flushPromises();
    expect(w.findComponent(CollapsibleSection).get("section").classes()).not.toContain("expanded");
  });
});
