import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";
import DisplayScheduleGrid from "@/components/settings/shared/DisplayScheduleGrid.vue";
import PageThumbnail from "@/components/settings/shared/PageThumbnail.vue";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";

const AVAILABLE = "e4f5a6b7c8d9e0f1";
const OLD = "a1b2c3d4e5f6a7b8";

const layout = (ids = ["r1", "r2"]) => ({
  version: 1,
  direction: "row",
  regions: ids.map(id => ({ id, kind: "calendar", size: 100 / ids.length })),
});

const config = (over = {}) => ({
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
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
  ...over,
});

function mountScreens({
  kiosks = [kiosk()],
  overrides = {},
  cfg = config(),
  availableVersion = null,
  narrow,
} = {}) {
  setActivePinia(createPinia());
  if (narrow === undefined) {
    delete window.matchMedia;
  } else {
    window.matchMedia = vi.fn(() => ({
      matches: narrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.fetchOverrides = vi.fn(async () => overrides);
  store.saveOverrides = vi.fn(async () => {});
  store.setKioskOverrides = vi.fn((id, next) => {
    const target = store.kiosks.find(k => k.id === id);
    if (target) target.overrides = next;
  });
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => availableVersion);
  return { wrapper: mount(ScreensSettings, { props: { config: cfg } }), store, cfg };
}

async function selectFirst(wrapper) {
  await wrapper.find("[data-test='screen-card']").trigger("click");
  await flushPromises();
}

const rowByLabel = (w, label) =>
  w.findAllComponents(SettingRow).find(r => r.props("label") === label);

describe("ScreensSettings — screen list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the empty state and opens Add a screen on a fresh install", async () => {
    const { wrapper } = mountScreens({ kiosks: [] });
    await flushPromises();
    expect(wrapper.find("[data-test='screens-empty']").text()).toContain(
      "No screens have connected yet"
    );
    expect(wrapper.find("[data-test='screens-empty']").text()).toContain("?kiosk=<name>");
    expect(wrapper.find("[data-test='add-kiosk-panel']").exists()).toBe(true);
  });

  it("keeps Add a screen collapsed behind a button once screens exist", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    expect(wrapper.find("[data-test='add-kiosk-panel']").exists()).toBe(false);
    const btn = wrapper.find("[data-test='add-screen-btn']");
    expect(btn.text()).toBe("+ Add a screen");
    await btn.trigger("click");
    expect(wrapper.find("[data-test='add-kiosk-panel']").exists()).toBe(true);
  });

  it("puts + Add a screen in the Screens header as a secondary button", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    const head = wrapper.find("#section-screens-list .settings-section__head");
    expect(head.exists()).toBe(true);
    expect(head.find(".settings-section__eyebrow").text()).toBe("Screens");
    const btn = head.find("[data-test='add-screen-btn']");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe("+ Add a screen");
    // Secondary, not the filled primary style used by Edit pages.
    expect(btn.classes()).toContain("screens__add");
    expect(btn.classes()).not.toContain("screens__add--primary");
    expect(wrapper.findAll("[data-test='add-screen-btn']")).toHaveLength(1);
  });

  it("puts the All screens card first, with the shared summary", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ orientation: "portrait", onScreenKeyboard: "on" }),
    });
    await flushPromises();
    const all = wrapper.find("[data-test='screen-all-card']");
    expect(all.exists()).toBe(true);
    expect(all.text()).toContain("All screens");
    expect(all.text()).toContain("Shared settings every screen uses unless it has its own");
    expect(wrapper.find("[data-test='all-screens-summary']").text()).toBe(
      "portrait · keyboard Always"
    );
  });

  it("renders a card per screen with its name, id, presence and summary", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({
          id: "kitchen",
          hostname: "kitchen-pi",
          overrides: { displayName: "Kitchen" },
        }),
        kiosk({
          id: "hall",
          hostname: "hall-pi",
          lastSeen: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          overrides: {
            orientation: "portrait",
            orientationFlipped: true,
            availableScreens: ["home"],
          },
        }),
      ],
    });
    await flushPromises();
    const cards = wrapper.findAll("[data-test='screen-card']");
    expect(cards).toHaveLength(2);
    expect(cards[0].text()).toContain("Kitchen");
    expect(cards[0].text()).toContain("kitchen");
    expect(cards[0].text()).toContain("Online");
    expect(cards[1].text()).toContain("hall-pi");
    expect(cards[1].text()).toContain("Offline");
    expect(cards[1].find("[data-test='screen-summary']").text()).toBe(
      "1 page · portrait · upside down"
    );
  });

  it("falls back to the hostname, then the id, when no name is set", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "kitchen", hostname: "kitchen-pi" }),
        kiosk({ id: "nohost", hostname: "" }),
      ],
    });
    await flushPromises();
    const cards = wrapper.findAll("[data-test='screen-card']");
    expect(cards[0].text()).toContain("kitchen-pi");
    expect(cards[1].text()).toContain("nohost");
  });

  it("draws each card's start page thumbnail in that screen's orientation", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "kitchen", overrides: {} }),
        kiosk({ id: "hall", overrides: { orientation: "portrait", defaultScreenId: "photos" } }),
      ],
    });
    await flushPromises();
    const cards = wrapper.findAll("[data-test='screen-card']");
    expect(cards[0].findComponent(PageThumbnail).props("orientation")).toBe("landscape");
    expect(cards[1].findComponent(PageThumbnail).props("orientation")).toBe("portrait");
    expect(cards[1].findComponent(PageThumbnail).props("page").id).toBe("photos");
  });

  it("summarises the schedule on the card", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({
          overrides: {
            displayScheduleEnabled: true,
            displaySchedule: [{ day: 1, enabled: true, onTime: "06:30", offTime: "23:00" }],
          },
        }),
      ],
    });
    await flushPromises();
    expect(wrapper.find("[data-test='screen-summary']").text()).toBe(
      "2 pages · landscape · off 23:00–06:30"
    );
  });
});

describe("ScreensSettings — one screen's page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the sub-view with a back link and sections 1-6", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    expect(wrapper.find("[data-test='screens-category']").classes()).toContain("screens--detail");
    expect(wrapper.find("[data-test='screens-list']").exists()).toBe(true);
    expect(wrapper.find("[data-test='screens-detail']").exists()).toBe(true);
    expect(wrapper.find("[data-test='screens-back']").text()).toBe("‹ Screens");

    const ids = wrapper
      .findAll("section.settings-section")
      .map(s => s.attributes("id"))
      .filter(id => id.startsWith("section-screen-"));
    expect(ids).toEqual([
      "section-screen-name",
      "section-screen-pages",
      "section-screen-display",
      "section-screen-power",
      "section-screen-touch",
      "section-screen-software",
    ]);
  });

  it("returns to the list, and the shared settings, from the back link", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("#section-device-keyboard").exists()).toBe(false);

    await wrapper.find("[data-test='screens-back']").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-test='screens-detail']").exists()).toBe(false);
    expect(wrapper.find("[data-test='screens-category']").classes()).not.toContain(
      "screens--detail"
    );
    expect(wrapper.find("#section-device-keyboard").exists()).toBe(true);
  });

  it("is two-pane, list beside detail, on a kiosk-width screen", async () => {
    const { wrapper } = mountScreens({ narrow: false });
    await flushPromises();
    await selectFirst(wrapper);

    const root = wrapper.find("[data-test='screens-category']");
    expect(root.classes()).toContain("screens--two-pane");
    expect(root.classes()).not.toContain("screens--single-pane");
    expect(wrapper.find("[data-test='screens-list']").exists()).toBe(true);
    expect(wrapper.find("[data-test='screens-detail']").exists()).toBe(true);
  });

  it("hides the list and shows one pane at a time on a phone", async () => {
    const { wrapper } = mountScreens({ narrow: true });
    await flushPromises();
    await selectFirst(wrapper);

    const root = wrapper.find("[data-test='screens-category']");
    expect(root.classes()).toContain("screens--single-pane");
    expect(root.classes()).not.toContain("screens--two-pane");
    // The list stays in the DOM (so state survives) but is hidden by layout.
    expect(wrapper.find("[data-test='screens-list']").exists()).toBe(true);
    expect(wrapper.find("[data-test='screens-back']").exists()).toBe(true);

    await wrapper.find("[data-test='screens-back']").trigger("click");
    expect(wrapper.find("[data-test='screens-category']").classes()).not.toContain(
      "screens--single-pane"
    );
  });

  it("shows the screen's name and hardware-status header", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ overrides: { displayName: "Hallway" } })],
      overrides: { displayName: "Hallway" },
    });
    await flushPromises();
    await selectFirst(wrapper);
    const header = wrapper.findComponent(KioskStatusHeader);
    expect(header.exists()).toBe(true);
    expect(header.props("kioskId")).toBe("Hallway");
    // The name lives in the status header; the Name section is titled "Name"
    // instead of repeating it (design lead nit on #165).
    expect(wrapper.find("#section-screen-name .settings-section__eyebrow").text()).toBe("Name");
    expect(wrapper.find("[data-test='screens-detail']").text().match(/Hallway/g)).toHaveLength(1);
  });

  it("says Same as all screens on inherited rows", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.text()).toContain("Same as all screens");
    expect(wrapper.find("[data-test='reset-orientation-row']").exists()).toBe(false);
  });

  it("says Only this screen · Use the shared setting on an overridden row", async () => {
    const { wrapper } = mountScreens({
      overrides: { orientation: "portrait", availableScreens: ["home"] },
    });
    await flushPromises();
    await selectFirst(wrapper);

    expect(wrapper.text()).toContain("Only this screen");
    const link = wrapper.find("[data-test='reset-orientation-row']");
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe("Use the shared setting");
  });
});

describe("ScreensSettings — Name", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the displayName override", async () => {
    const { wrapper, store } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='screen-name-input']").setValue("Hallway");

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { displayName: "Hallway" });
  });

  it("clearing the name drops the override (falls back to hostname, then id)", async () => {
    const { wrapper, store } = mountScreens({
      overrides: { displayName: "Hallway", orientation: "portrait" },
    });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='screen-name-input']").setValue("");

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { orientation: "portrait" });
  });
});

describe("ScreensSettings — Pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists every page with Show and Start here, marking the effective start page", async () => {
    const { wrapper } = mountScreens({ overrides: { defaultScreenId: "photos" } });
    await flushPromises();
    await selectFirst(wrapper);

    const rows = wrapper.findAll("[data-test='screen-page-row']");
    expect(rows).toHaveLength(2);
    const radios = rows.map(row => row.find('input[type="radio"]').element);
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
  });

  it("unchecking Show saves an availableScreens allowlist", async () => {
    const { wrapper, store } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const row = wrapper.findAll("[data-test='screen-page-row']")[1];
    await row.find('input[type="checkbox"]').setValue(false);

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      availableScreens: ["home"],
    });
  });

  it("checking every page again removes the allowlist override", async () => {
    const { wrapper, store } = mountScreens({ overrides: { availableScreens: ["home"] } });
    await flushPromises();
    await selectFirst(wrapper);

    const row = wrapper.findAll("[data-test='screen-page-row']")[1];
    await row.find('input[type="checkbox"]').setValue(true);

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {});
  });

  it("refuses to hide the last shown page", async () => {
    const { wrapper, store } = mountScreens({ overrides: { availableScreens: ["home"] } });
    await flushPromises();
    await selectFirst(wrapper);

    const row = wrapper.findAll("[data-test='screen-page-row']")[0];
    await row.find('input[type="checkbox"]').setValue(false);

    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Pick at least one page.");
  });

  it("writes defaultScreenId from Start here", async () => {
    const { wrapper, store } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const row = wrapper.findAll("[data-test='screen-page-row']")[1];
    await row.find('input[type="radio"]').setValue(true);

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      defaultScreenId: "photos",
    });
  });

  it("says Only one page so far and still offers Edit pages", async () => {
    const { wrapper } = mountScreens({
      cfg: config({
        dashboardScreens: {
          version: 2,
          activeScreenId: "home",
          screens: [{ id: "home", name: "Home", layout: layout() }],
        },
      }),
    });
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("[data-test='only-one-page']").text()).toBe("Only one page so far.");
    expect(wrapper.find("[data-test='edit-pages-btn']").text()).toBe("Edit pages");
  });

  it("Edit pages opens the editor already previewing this screen", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    expect(wrapper.findComponent(ScreenRegionEditor).props("open")).toBe(false);
    await wrapper.find("[data-test='edit-pages-btn']").trigger("click");
    expect(wrapper.findComponent(ScreenRegionEditor).props("open")).toBe(true);
    expect(wrapper.findComponent(ScreenRegionEditor).props("initialPreviewKiosk")).toBe("kitchen");
  });

  it("Use the shared setting removes just the pages keys", async () => {
    const { wrapper, store } = mountScreens({
      overrides: {
        orientation: "portrait",
        availableScreens: ["home"],
        defaultScreenId: "home",
      },
    });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='reset-default-screen']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      availableScreens: ["home"],
    });

    await wrapper.find("[data-test='reset-screens-shown']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenLastCalledWith("kitchen", {
      orientation: "portrait",
    });
  });
});

describe("ScreensSettings — Display", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves orientation, upside down and rotation as overrides", async () => {
    const { wrapper, store } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    const orientation = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { orientation: "portrait" });

    const toggles = wrapper.findAllComponents(ToggleSwitch);
    const flip = toggles.find(t => t.props("ariaLabel") === "Upside down");
    flip.vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      orientationFlipped: true,
    });

    const apply = toggles.find(t => t.props("ariaLabel") === "Rotate the screen output");
    apply.vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      orientationFlipped: true,
      applyDisplayRotation: false,
    });
  });

  it("updates the live preview orientation as Orientation changes", async () => {
    const { wrapper } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const preview = () => wrapper.find("[data-test='screen-live-thumbnail']");
    expect(preview().attributes("data-orientation")).toBe("portrait");
    expect(wrapper.find("[data-test='screen-live-preview']").text()).toContain("Home");
  });

  it("shows the reported viewport beside the preview", async () => {
    const { wrapper } = mountScreens({
      overrides: { orientation: "portrait" },
      kiosks: [kiosk({ viewport: { w: 1080, h: 1920 } })],
    });
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("[data-test='screen-live-preview']").text()).toContain("1080×1920");
  });

  it("Use the shared setting removes only that display key", async () => {
    const { wrapper, store } = mountScreens({
      overrides: { orientation: "portrait", availableScreens: ["home"] },
    });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='reset-orientation-row']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { availableScreens: ["home"] });
  });
});

describe("ScreensSettings — Power", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the schedule toggle and grid, and the idle timeout", async () => {
    const { wrapper, store } = mountScreens({
      cfg: config({ displayScheduleEnabled: false }),
    });
    await flushPromises();
    await selectFirst(wrapper);

    const schedule = wrapper
      .findAllComponents(ToggleSwitch)
      .find(t => t.props("ariaLabel") === "Screen on/off schedule");
    schedule.vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      displayScheduleEnabled: true,
    });

    // The grid appears once the effective schedule is on.
    const { wrapper: w2, store: store2 } = mountScreens({
      cfg: config({
        displayScheduleEnabled: true,
        displaySchedule: [{ day: 0, enabled: true, onTime: "06:00", offTime: "22:00" }],
      }),
    });
    await flushPromises();
    await selectFirst(w2);
    const next = [{ day: 0, enabled: false, onTime: "07:00", offTime: "23:00" }];
    w2.findComponent(DisplayScheduleGrid).vm.$emit("update:modelValue", next);
    await flushPromises();
    expect(store2.saveOverrides).toHaveBeenCalledWith("kitchen", { displaySchedule: next });
  });

  it("writes Never as timeout off and any other choice as seconds", async () => {
    const { wrapper, store } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    const idle = () =>
      wrapper
        .findAllComponents(SelectPill)
        .find(c => c.props("ariaLabel") === "Turn off when idle");

    idle().vm.$emit("update:modelValue", 0);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      displayTimeoutEnabled: false,
    });

    idle().vm.$emit("update:modelValue", 1800);
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenLastCalledWith("kitchen", {
      displayTimeoutEnabled: true,
      displayTimeout: 1800,
    });
  });

  it("offers an existing value that is not in the list as its own option", async () => {
    const { wrapper } = mountScreens({
      overrides: { displayTimeoutEnabled: true, displayTimeout: 420 },
    });
    await flushPromises();
    await selectFirst(wrapper);
    const idle = wrapper
      .findAllComponents(SelectPill)
      .find(c => c.props("ariaLabel") === "Turn off when idle");
    expect(idle.props("options").map(o => o.label)).toContain("7 min");
  });

  it("Use the shared setting removes only the power keys", async () => {
    const { wrapper, store } = mountScreens({
      overrides: {
        orientation: "portrait",
        displayScheduleEnabled: true,
        displaySchedule: [{ day: 0, enabled: false, onTime: "07:00", offTime: "23:00" }],
      },
    });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='reset-schedule-enabled']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      displaySchedule: [{ day: 0, enabled: false, onTime: "07:00", offTime: "23:00" }],
    });
  });
});

describe("ScreensSettings — Touch & keyboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the touchscreen override and can go back to the shared setting", async () => {
    const { wrapper, store } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const touch = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Touchscreen");
    touch.vm.$emit("update:modelValue", "off");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      touchControls: "off",
    });

    await wrapper.find("[data-test='reset-touchscreen']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenLastCalledWith("kitchen", { orientation: "portrait" });
  });

  it("saves the on-screen keyboard override and can go back", async () => {
    const { wrapper, store } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const osk = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "On-screen keyboard");
    osk.vm.$emit("update:modelValue", "on");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      onScreenKeyboard: "on",
    });

    await wrapper.find("[data-test='osk-use-shared']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenLastCalledWith("kitchen", { orientation: "portrait" });
  });
});

describe("ScreensSettings — save failures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the failure copy and not Saved. when saveOverrides rejects", async () => {
    const { wrapper, store } = mountScreens();
    store.saveOverrides = vi.fn(async () => {
      throw new Error("network error");
    });
    store.setKioskOverrides = vi.fn();
    await flushPromises();
    await selectFirst(wrapper);

    const orientation = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "portrait");
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Couldn't save to the server. Check the connection and try again."
    );
    expect(wrapper.text()).not.toContain("Saved.");
  });
});

describe("ScreensSettings — software (CLV-19)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the fleet summary and Update all", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ agentVersion: OLD })],
      availableVersion: AVAILABLE,
    });
    await flushPromises();
    expect(wrapper.find("[data-test='kiosk-software-state']").text()).toBe(
      "1 kiosk can be updated to e4f5a6b."
    );
    const updateAll = wrapper.find("[data-test='kiosk-software-update-all']");
    expect(updateAll.text()).toBe("Update all");
    store.triggerUpdate = vi.fn(async () => {});
    await updateAll.trigger("click");
    await flushPromises();
    expect(store.triggerUpdate).toHaveBeenCalledWith("kitchen");
  });

  it("shows the per-card software line", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: OLD })],
      availableVersion: AVAILABLE,
    });
    await flushPromises();
    expect(wrapper.find("[data-test='kiosk-version-line']").text()).toBe(
      "Kiosk software a1b2c3d · e4f5a6b available"
    );
  });

  it("moves Update into the screen's Software section and calls triggerUpdate", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ agentVersion: OLD })],
      availableVersion: AVAILABLE,
    });
    store.triggerUpdate = vi.fn(async () => {});
    await flushPromises();
    // No update action in the list before a screen is opened.
    expect(wrapper.find("[data-test='kiosk-update-btn']").exists()).toBe(false);

    await selectFirst(wrapper);
    const btn = wrapper.find("[data-test='kiosk-update-btn']");
    expect(btn.text()).toBe("Update");
    await btn.trigger("click");
    await flushPromises();
    expect(store.triggerUpdate).toHaveBeenCalledWith("kitchen");
  });

  it("explains a python-too-old failure with no Update button", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({
          agentVersion: OLD,
          agentUpdateStatus: "error",
          agentUpdateMessage: "device python < 3.9; keeping current agent",
        }),
      ],
      availableVersion: AVAILABLE,
    });
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("[data-test='screen-software-state']").text()).toContain(
      "update needs a newer OS"
    );
    expect(wrapper.text()).toContain(
      "Reinstall this kiosk with a current Raspberry Pi OS, then update."
    );
    expect(wrapper.find("[data-test='kiosk-update-btn']").exists()).toBe(false);
  });

  it("says a browser-only screen has no kiosk software", async () => {
    const { wrapper } = mountScreens({ kiosks: [kiosk({ agentVersion: null })] });
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("[data-test='screen-software-empty']").text()).toContain(
      "no kiosk software to update"
    );
  });
});

describe("ScreensSettings — decision C placement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps screen rows in All screens and moves the remote rows to Dashboard", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();

    // All screens: Display, Power (with the reboot combo) and Touch & keyboard.
    expect(wrapper.find("#section-layout").exists()).toBe(true);
    expect(wrapper.find("#section-device-power").exists()).toBe(true);
    expect(wrapper.find("#section-device-keyboard").exists()).toBe(true);
    expect(rowByLabel(wrapper, "Touchscreen")).toBeTruthy();
    expect(rowByLabel(wrapper, "Orientation")).toBeTruthy();
    expect(wrapper.findComponent({ name: "RebootCombo" }).exists()).toBe(true);
    expect(wrapper.find("#section-device-power").text()).toContain("Power");

    // Remote & buttons and key-press feedback are not here any more.
    expect(rowByLabel(wrapper, "Show button presses")).toBeUndefined();
    expect(rowByLabel(wrapper, "Button bindings")).toBeUndefined();
  });
});
