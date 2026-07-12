import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KiosksSettings from "@/components/settings/categories/KiosksSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { useConfigStore } from "@/stores/config";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";

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
});
