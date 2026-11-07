// settings-scope §7 item 7 — the Changed here line and the section index on a
// screen's own page.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises as flushPromisesNow } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import { SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";
import { rowAnchorId } from "@/utils/screenOverrides";

async function flushPromises() {
  await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  await flushPromisesNow();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const layout = (ids = ["r1", "r2"]) => ({
  version: 1,
  direction: "row",
  regions: ids.map(id => ({ id, kind: "calendar", size: 100 / ids.length })),
});

const config = (over = {}) => ({
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  showUI: true,
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [
      { id: "home", name: "Home", layout: layout() },
      { id: "photos", name: "Photos", layout: layout(["r1", "r2", "r3"]) },
    ],
  },
  displayScheduleEnabled: false,
  displaySchedule: [],
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  touchControls: "auto",
  onScreenKeyboard: "auto",
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

function mountScreens({ kiosks = [kiosk()], overrides = {}, cfg = config() } = {}) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.refreshKiosks = vi.fn(async () => {});
  store.fetchOverrides = vi.fn(async () => overrides);
  store.saveOverrides = vi.fn(async () => {});
  store.setKioskOverrides = vi.fn((id, next) => {
    const target = store.kiosks.find(k => k.id === id);
    if (target) target.overrides = next;
  });
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => null);
  return { wrapper: mount(ScreensSettings, { props: { config: cfg } }), store };
}

async function openFirstScreen(wrapper) {
  await wrapper.find("[data-test='screen-card']").trigger("click");
  await flushPromises();
}

const changedLine = wrapper => wrapper.find("[data-test='changed-here-line']");

describe("ScreensSettings — Changed here line", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists exactly the overridden keys by their row labels, in page order", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ showUI: false }),
      overrides: {
        selectedTheme: "ocean",
        focusLightMode: "always",
        hotCornerSize: 80,
        displayName: "Kitchen",
        screenNow: { power: "off", setAt: "2026-11-03T10:00:00.000Z" },
        _deviceFingerprint: "abc",
        unknownKey: true,
      },
    });
    await flushPromises();
    await openFirstScreen(wrapper);

    const line = changedLine(wrapper);
    expect(line.exists()).toBe(true);
    expect(line.text().replace(/\s+/g, " ").trim()).toBe(
      "Changed here: Theme, Focus light, Corner size"
    );
    expect(line.find("[data-test='changed-here-displayName']").exists()).toBe(false);
    expect(line.find("[data-test='changed-here-screenNow']").exists()).toBe(false);
    expect(line.find("[data-test='changed-here-_deviceFingerprint']").exists()).toBe(false);
    expect(line.find("[data-test='changed-here-unknownKey']").exists()).toBe(false);
  });

  it("uses the row label for pages, orientation and the idle row", async () => {
    const { wrapper } = mountScreens({
      overrides: {
        availableScreens: ["home"],
        orientation: "portrait",
        displayTimeoutEnabled: true,
        displayTimeout: 300,
      },
    });
    await flushPromises();
    await openFirstScreen(wrapper);

    expect(changedLine(wrapper).text().replace(/\s+/g, " ").trim()).toBe(
      "Changed here: Pages shown, Orientation, Turn off when idle"
    );
  });

  it("updates after a setting is set and after it is reset", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openFirstScreen(wrapper);
    expect(changedLine(wrapper).exists()).toBe(false);

    const orientation = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(changedLine(wrapper).text()).toContain("Orientation");

    await wrapper.find("[data-test='reset-orientation-row']").trigger("click");
    await flushPromises();
    expect(changedLine(wrapper).exists()).toBe(false);
  });

  it("scrolls to the row and briefly highlights it", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { wrapper } = mountScreens({ overrides: { selectedTheme: "ocean" } });
    await flushPromises();
    await openFirstScreen(wrapper);
    document.body.appendChild(wrapper.element);

    const link = wrapper.find("[data-test='changed-here-selectedTheme']");
    expect(link.attributes("href")).toBe(`#${rowAnchorId("selectedTheme")}`);

    await link.trigger("click");

    const row = wrapper.find(`#${rowAnchorId("selectedTheme")}`);
    expect(row.exists()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(row.classes()).toContain("calvin-row-flash");
    vi.advanceTimersByTime(1600);
    await flushPromisesNow();
    expect(row.classes()).not.toContain("calvin-row-flash");
    wrapper.element.remove();
  });
});

describe("ScreensSettings — section index", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links to the same section ids the deep links use", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openFirstScreen(wrapper);

    const index = wrapper.find("[data-test='section-index']");
    expect(index.exists()).toBe(true);
    for (const id of [
      "screen-name",
      "screen-pages",
      "screen-look",
      "screen-display",
      "screen-effects",
      "screen-controls",
      "screen-power",
      "screen-touch",
      "screen-behaviour",
      "screen-software",
    ]) {
      const link = index.find(`[data-test='section-index-${id}']`);
      expect(link.exists(), id).toBe(true);
      expect(link.attributes("href")).toBe(`#section-${id}`);
      expect(wrapper.find(`#section-${id}`).exists(), id).toBe(true);
    }
  });

  it("renders a select instead of the link row on a phone", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    window.innerWidth = 390;
    window.innerHeight = 844;
    try {
      const { wrapper } = mountScreens();
      await flushPromises();
      await openFirstScreen(wrapper);

      const select = wrapper.find("[data-test='section-index-select']");
      expect(select.exists()).toBe(true);
      expect(wrapper.find("[data-test='section-index-screen-look']").exists()).toBe(false);
      expect(select.findAll("option").map(option => option.attributes("label"))).toContain("Look");
    } finally {
      window.innerWidth = originalWidth;
      window.innerHeight = originalHeight;
    }
  });
});
