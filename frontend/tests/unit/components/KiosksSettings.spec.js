import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KiosksSettings from "@/components/settings/categories/KiosksSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";

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
