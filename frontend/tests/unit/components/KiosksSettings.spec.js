import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KiosksSettings from "@/components/settings/categories/KiosksSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { useConfigStore } from "@/stores/config";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import ChipMultiSelect from "@/components/ui/ChipMultiSelect.vue";

function mountWithKiosks(list) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = list;
  });
  store.fetchOverrides = vi.fn(async () => ({}));
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
    // ToggleSwitch[0] is the Flip 180° control
    w.findAllComponents(ToggleSwitch)[0].vm.$emit("update:modelValue", true);
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
});
