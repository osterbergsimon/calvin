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
import ListRow from "@/components/ui/ListRow.vue";
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
  displayStack: null,
  ...over,
});

function mountScreens({
  kiosks = [kiosk()],
  overrides = {},
  cfg = config(),
  availableVersion = null,
  narrow,
  initialSection = null,
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
  return {
    wrapper: mount(ScreensSettings, { props: { config: cfg, initialSection } }),
    store,
    cfg,
  };
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

  it("leaves no empty intro strip above the first row", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    expect(wrapper.find("#section-screens-list .settings-section__intro").exists()).toBe(false);
    expect(wrapper.find("[data-test='screens-empty']").exists()).toBe(false);
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
    expect(btn.classes()).toContain("btn--secondary");
    expect(btn.classes()).not.toContain("btn--primary");
    expect(wrapper.findAll("[data-test='add-screen-btn']")).toHaveLength(1);
  });

  it("puts the Default card first, with the summary", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ orientation: "portrait", onScreenKeyboard: "on" }),
    });
    await flushPromises();
    const cards = wrapper.findAll("[data-test='screens-list'] .screen-card");
    expect(cards[0].attributes("data-test")).toBe("screen-default-card");
    const def = wrapper.find("[data-test='screen-default-card']");
    expect(def.text()).toContain("Default");
    expect(def.text()).toContain(
      "Used by new screens and by browsers that aren't set up as a screen"
    );
    expect(wrapper.find("[data-test='default-summary']").text()).toBe("portrait · keyboard Always");
    // Solid border: it is a screen now, not the dashed "shared" card.
    expect(def.classes()).toContain("screen-card--default");
  });

  it("counts the screens that have their own settings on the Default card", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", overrides: { orientation: "portrait" } }),
        kiosk({ id: "kitchen", overrides: { displayName: "Kitchen" } }),
        kiosk({ id: "office", overrides: {} }),
      ],
    });
    await flushPromises();
    expect(wrapper.find("[data-test='default-summary']").text()).toContain(
      "1 screen has its own settings"
    );
  });

  it("says Same as Default on the This browser card with no browser choice", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    expect(wrapper.find("[data-test='screen-browser-card']").exists()).toBe(true);
    expect(wrapper.find("[data-test='browser-summary']").text()).toBe("Same as Default");
  });

  it("hides the This browser card on a set-up screen", async () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "kitchen");
    const { wrapper } = mountScreens();
    await flushPromises();
    expect(wrapper.find("[data-test='screen-browser-card']").exists()).toBe(false);
  });

  it("counts the settings changed on a screen's card", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({
          overrides: {
            displayName: "Hallway",
            orientation: "portrait",
            orientationFlipped: true,
            displayTimeoutEnabled: true,
            displayTimeout: 300,
          },
        }),
      ],
    });
    await flushPromises();
    expect(wrapper.find("[data-test='screen-changed-count']").text()).toBe("3 settings changed");
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

  it("titles cards and the screen header Name, then hostname, then id (CLV-103)", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({
          id: "calvin401-aaaaaa",
          hostname: "calvin401",
          overrides: { displayName: "Kitchen" },
        }),
        kiosk({ id: "calvin400-16d03d", hostname: "calvin400" }),
        kiosk({ id: "calvin402-bbbbbb", hostname: "" }),
      ],
    });
    await flushPromises();
    const titles = wrapper
      .findAll("[data-test='screen-card']")
      .map(card => card.findComponent(ListRow).props("name"));
    expect(titles).toEqual(["Kitchen", "calvin400", "calvin402-bbbbbb"]);

    const expected = ["Kitchen", "calvin400", "calvin402-bbbbbb"];
    for (const [index, label] of expected.entries()) {
      await wrapper.findAll("[data-test='screen-card']")[index].trigger("click");
      await flushPromises();
      expect(wrapper.findComponent(KioskStatusHeader).props("kioskId")).toBe(label);
      await wrapper.find("[data-test='screens-back']").trigger("click");
      await flushPromises();
    }
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
      "section-screen-behaviour",
      "section-screen-software",
    ]);
  });

  it("returns to the list from the back link", async () => {
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
    expect(wrapper.find("[data-test='screen-default-card']").exists()).toBe(true);
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
    expect(
      wrapper
        .find("[data-test='screens-detail']")
        .text()
        .match(/Hallway/g)
    ).toHaveLength(1);
  });

  it("says Same as Default on inherited rows", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.text()).toContain("Same as Default");
    expect(wrapper.text()).not.toContain("Same as all screens");
    expect(wrapper.find("[data-test='reset-orientation-row']").exists()).toBe(false);
  });

  it("says Changed here · Reset to default on an overridden row", async () => {
    const { wrapper } = mountScreens({
      overrides: { orientation: "portrait", availableScreens: ["home"] },
    });
    await flushPromises();
    await selectFirst(wrapper);

    expect(wrapper.text()).toContain("Changed here");
    const link = wrapper.find("[data-test='reset-orientation-row']");
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe("Reset to default");
  });
});

describe("ScreensSettings — Name", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the displayName override", async () => {
    const { wrapper, store } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='screen-name-input']").setValue("Hallway");
    await wrapper.find("[data-test='screen-name-input']").trigger("blur");

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { displayName: "Hallway" });
  });

  it("clearing the name drops the override (falls back to hostname, then id)", async () => {
    const { wrapper, store } = mountScreens({
      overrides: { displayName: "Hallway", orientation: "portrait" },
    });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='screen-name-input']").setValue("");
    await wrapper.find("[data-test='screen-name-input']").trigger("blur");

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
    const startButtons = rows.map(row => row.find("button[aria-pressed]"));
    expect(startButtons[0].attributes("aria-pressed")).toBe("false");
    expect(startButtons[1].attributes("aria-pressed")).toBe("true");
  });

  it("unchecking Show saves an availableScreens allowlist", async () => {
    const { wrapper, store } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const row = wrapper.findAll("[data-test='screen-page-row']")[1];
    expect(row.find('[role="switch"]').attributes("aria-checked")).toBe("true");
    await row.find('[role="switch"]').trigger("click");

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
    expect(row.find('[role="switch"]').attributes("aria-checked")).toBe("false");
    await row.find('[role="switch"]').trigger("click");

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {});
  });

  it("refuses to hide the last shown page", async () => {
    const { wrapper, store } = mountScreens({ overrides: { availableScreens: ["home"] } });
    await flushPromises();
    await selectFirst(wrapper);

    const row = wrapper.findAll("[data-test='screen-page-row']")[0];
    expect(row.find('[role="switch"]').attributes("aria-checked")).toBe("true");
    await row.find('[role="switch"]').trigger("click");

    expect(store.saveOverrides).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Pick at least one page.");
  });

  it("writes defaultScreenId from Start here", async () => {
    const { wrapper, store } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const row = wrapper.findAll("[data-test='screen-page-row']")[1];
    await row.find("button[aria-pressed]").trigger("click");

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

  it("Reset to default removes just the pages keys", async () => {
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

  it("Reset to default removes only that display key", async () => {
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

  it("Reset to default removes only the power keys", async () => {
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

  it("shows the current state, when the schedule takes over, and Follow schedule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T09:00:00+02:00"));
    try {
      const { wrapper, store } = mountScreens({
        cfg: config({
          timezone: "Europe/Stockholm",
          displayScheduleEnabled: true,
          displaySchedule: [
            { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" },
            { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" },
          ],
        }),
        overrides: {
          screenNow: { power: "off", setAt: "2026-07-11T07:00:00.000Z" }, // 09:00 local
        },
      });
      await flushPromises();
      await selectFirst(wrapper);

      expect(wrapper.find("[data-test='screen-now-state']").text()).toBe("Off now");
      expect(wrapper.find("[data-test='screen-now-until']").text()).toBe("Off until 22:00");
      expect(wrapper.find("[data-test='screen-now-off']").attributes("disabled")).toBeDefined();
      expect(wrapper.find("[data-test='screen-now-on']").attributes("disabled")).toBeUndefined();

      await wrapper.find("[data-test='screen-now-follow']").trigger("click");
      await flushPromises();
      expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {});
    } finally {
      vi.useRealTimers();
    }
  });

  it("Turn off now saves the choice with the UTC set time, not a computed boundary", async () => {
    const { wrapper, store } = mountScreens({ cfg: config({ displayScheduleEnabled: false }) });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='screen-now-off']").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      screenNow: { power: "off", setAt: expect.any(String) },
    });
    const saved = store.saveOverrides.mock.calls[0][1].screenNow;
    expect(Number.isNaN(Date.parse(saved.setAt))).toBe(false);
  });

  it("says 'until the next scheduled change' when the screen uses the system timezone", async () => {
    const { wrapper } = mountScreens({
      cfg: config({
        timezone: "system",
        displayScheduleEnabled: true,
        displaySchedule: [0, 1, 2, 3, 4, 5, 6].map(day => ({
          day,
          enabled: true,
          onTime: "06:00",
          offTime: "22:00",
        })),
      }),
      overrides: { screenNow: { power: "off", setAt: new Date().toISOString() } },
    });
    await flushPromises();
    await selectFirst(wrapper);

    expect(wrapper.find("[data-test='screen-now-until']").text()).toBe(
      "Off until the next scheduled change"
    );
  });

  it("keeps the note when the admin browser's zone runs ahead of the screen's", async () => {
    vi.useFakeTimers();
    // The Pi uses its system zone (Stockholm, +01:00); this browser is in
    // Athens (+02:00), so its own 22:00-06:00 window ended at 04:00Z while the
    // Pi's ends at 05:00Z. The browser must not end the override for the Pi.
    vi.setSystemTime(new Date("2026-11-02T04:30:00Z"));
    const originalTz = process.env.TZ;
    process.env.TZ = "Europe/Athens";
    try {
      const { wrapper } = mountScreens({
        cfg: config({
          timezone: "system",
          displayScheduleEnabled: true,
          displaySchedule: [0, 1, 2, 3, 4, 5, 6].map(day => ({
            day,
            enabled: true,
            onTime: "06:00",
            offTime: "22:00",
          })),
        }),
        overrides: { screenNow: { power: "on", setAt: "2026-11-01T21:48:25.107Z" } },
      });
      await flushPromises();
      await selectFirst(wrapper);

      expect(wrapper.find("[data-test='screen-now-state']").text()).toBe("On now");
      expect(wrapper.find("[data-test='screen-now-until']").text()).toBe(
        "On until the next scheduled change"
      );
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
      vi.useRealTimers();
    }
  });

  it("drops the override at its boundary as the clock ticks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T21:59:00+02:00"));
    try {
      const { wrapper } = mountScreens({
        cfg: config({
          timezone: "Europe/Stockholm",
          displayScheduleEnabled: true,
          displaySchedule: [
            { day: 5, enabled: true, onTime: "06:00", offTime: "22:00" },
            { day: 6, enabled: true, onTime: "06:00", offTime: "22:00" },
          ],
        }),
        overrides: { screenNow: { power: "on", setAt: "2026-07-11T07:00:00.000Z" } },
      });
      await flushPromises();
      await selectFirst(wrapper);
      expect(wrapper.find("[data-test='screen-now-state']").text()).toBe("On now");
      expect(wrapper.find("[data-test='screen-now-until']").text()).toBe("On until 22:00");

      vi.setSystemTime(new Date("2026-07-11T22:00:01+02:00"));
      vi.advanceTimersByTime(30000);
      await flushPromises();
      expect(wrapper.find("[data-test='screen-now-state']").text()).toBe("Off now");
      expect(wrapper.find("[data-test='screen-now-until']").exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores an expired Screen now override and follows the schedule again", async () => {
    const { wrapper } = mountScreens({
      cfg: config({
        displayScheduleEnabled: true,
        displaySchedule: [{ day: 5, enabled: true, onTime: "06:00", offTime: "22:00" }],
      }),
      overrides: { screenNow: { power: "off", setAt: "2020-01-01T00:00:00.000Z" } },
    });
    await flushPromises();
    await selectFirst(wrapper);

    expect(wrapper.find("[data-test='screen-now-state']").text()).toBe("On now");
    expect(wrapper.find("[data-test='screen-now-until']").exists()).toBe(false);
    expect(wrapper.find("[data-test='screen-now-follow']").exists()).toBe(false);
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

describe("ScreensSettings — save messages name the real wait", () => {
  beforeEach(() => vi.clearAllMocks());

  const savedIn = (wrapper, section) => wrapper.find(`#section-${section} .screens-saved`).text();

  it("says within a minute for the settings the kiosk display agent applies", async () => {
    const { wrapper } = mountScreens({
      cfg: config({
        displayScheduleEnabled: true,
        displaySchedule: [0, 1, 2, 3, 4, 5, 6].map(day => ({
          day,
          enabled: true,
          onTime: "06:00",
          offTime: "22:00",
        })),
      }),
    });
    await flushPromises();
    await selectFirst(wrapper);

    // The agent polls its merged config every 60 s. Screen now, Follow
    // schedule, the schedule rows and the physical orientation all ride it.
    const onButton = wrapper.find("[data-test='screen-now-on']");
    const offButton = wrapper.find("[data-test='screen-now-off']");
    await (onButton.attributes("disabled") === undefined ? onButton : offButton).trigger("click");
    await flushPromises();
    expect(savedIn(wrapper, "screen-power")).toBe("Saved. This screen updates within a minute.");

    await wrapper.find("[data-test='screen-now-follow']").trigger("click");
    await flushPromises();
    expect(savedIn(wrapper, "screen-power")).toBe("Saved. This screen updates within a minute.");

    const orientation = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "portrait");
    await flushPromises();
    expect(savedIn(wrapper, "screen-display")).toBe("Saved. This screen updates within a minute.");

    const schedule = wrapper
      .findAllComponents(ToggleSwitch)
      .find(c => c.props("ariaLabel") === "Screen on/off schedule");
    schedule.vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(savedIn(wrapper, "screen-power")).toBe("Saved. This screen updates within a minute.");
  });

  it("says within 30 seconds for the settings the dashboard page applies", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    // The dashboard polls /api/config every 30 s (configPollInterval) and
    // applies the name, pages, touch and keyboard itself.
    const nameInput = wrapper.find("[data-test='screen-name-input']");
    await nameInput.setValue("Hallway");
    await nameInput.trigger("blur");
    await flushPromises();
    expect(savedIn(wrapper, "screen-name")).toBe("Saved. This screen updates within 30 seconds.");

    const pageToggle = wrapper
      .findAllComponents(ToggleSwitch)
      .find(c => String(c.props("ariaLabel")).startsWith("Show "));
    pageToggle.vm.$emit("update:modelValue", false);
    await flushPromises();
    expect(savedIn(wrapper, "screen-pages")).toBe("Saved. This screen updates within 30 seconds.");

    const touch = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Touchscreen");
    touch.vm.$emit("update:modelValue", "off");
    await flushPromises();
    expect(savedIn(wrapper, "screen-touch")).toBe("Saved. This screen updates within 30 seconds.");
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
      "unknown · Kiosk software a1b2c3d · e4f5a6b available"
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
    const empty = wrapper.find("[data-test='screen-software-empty']");
    expect(empty.text()).toContain("no kiosk software to update");
    // The note gets the normal row padding instead of sitting on the border.
    expect(empty.classes()).toContain("setting-row");
  });
});

describe("ScreensSettings — display stack (calvin-2ibz)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the stack beside the agent version on the card", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: OLD, displayStack: "cog" })],
      availableVersion: AVAILABLE,
    });
    await flushPromises();
    expect(wrapper.find("[data-test='kiosk-version-line']").text()).toBe(
      "cog · Kiosk software a1b2c3d · e4f5a6b available"
    );
  });

  it("says unknown when an older agent does not report its stack", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: OLD, displayStack: null })],
      availableVersion: AVAILABLE,
    });
    await flushPromises();
    expect(wrapper.find("[data-test='kiosk-version-line']").text()).toBe(
      "unknown · Kiosk software a1b2c3d · e4f5a6b available"
    );
  });

  it("shows the stack and agent version in the screen's header", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: OLD, displayStack: "wayland" })],
      availableVersion: AVAILABLE,
    });
    await flushPromises();
    await selectFirst(wrapper);
    const tag = wrapper.find("[data-test='kiosk-display-stack']");
    expect(tag.text()).toBe("wayland · agent a1b2c3d");
  });

  it("keeps the header readout to unknown for an older agent", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: OLD, displayStack: null })],
      availableVersion: AVAILABLE,
    });
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("[data-test='kiosk-display-stack']").text()).toBe(
      "unknown · agent a1b2c3d"
    );
  });

  it("shows no stack readout for a browser-only screen", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: null, displayStack: null })],
    });
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("[data-test='kiosk-display-stack']").exists()).toBe(false);
  });
});

describe("ScreensSettings — decision C placement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps screen rows on the Default page and leaves remote rows in Dashboard", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await wrapper.find("[data-test='screen-default-card']").trigger("click");
    await flushPromises();

    // Default: Display, Power (with the reboot combo) and Touch & keyboard.
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

// ---------------------------------------------------------------------------
// docs/design/2026-10-30-default-screen.md §8
// ---------------------------------------------------------------------------
const openDefault = async wrapper => {
  await wrapper.find("[data-test='screen-default-card']").trigger("click");
  await flushPromises();
};
const openBrowser = async wrapper => {
  await wrapper.find("[data-test='screen-browser-card']").trigger("click");
  await flushPromises();
};

describe("ScreensSettings — Default is a screen (§2, §3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("opens the Default page with the same sections as a screen", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openDefault(wrapper);

    const ids = wrapper
      .findAll("section.settings-section")
      .map(s => s.attributes("id"))
      .filter(id => id !== "section-screens-list");
    expect(ids).toEqual([
      "section-default-pages",
      "section-layout",
      "section-device-power",
      "section-device-keyboard",
      "section-device-behaviour",
    ]);
    // No status header, no Software section, no per-row reset links.
    expect(wrapper.find("#section-screen-software").exists()).toBe(false);
    expect(wrapper.find("[data-test='reset-orientation-row']").exists()).toBe(false);
    expect(wrapper.find("[data-test='default-screen-page']").exists()).toBe(true);
  });

  it("marks the default-only rows Applies to every screen", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ displayScheduleEnabled: true }),
    });
    await flushPromises();
    await openDefault(wrapper);

    const notes = wrapper.findAll("[data-test='default-only-note']").map(n => n.text());
    expect(notes.length).toBe(4);
    expect(notes.every(text => text === "Applies to every screen")).toBe(true);
    expect(wrapper.find("#section-device-power").text()).toContain("Applies to every screen");
    expect(wrapper.find("#section-device-keyboard").text()).toContain("Applies to every screen");
  });

  it("has no global Room name row (the name is per screen, CLV-84)", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openDefault(wrapper);

    expect(wrapper.find("[data-test='default-room-name']").exists()).toBe(false);
    expect(rowByLabel(wrapper, "Room name")).toBeUndefined();
  });

  it("writes the global page allowlist and start page", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openDefault(wrapper);

    const rows = wrapper.findAll("[data-test='default-page-row']");
    await rows[1].find("button[aria-pressed]").trigger("click");
    expect(wrapper.emitted("update:config")).toContainEqual([{ defaultScreenId: "photos" }]);

    expect(rows[1].find('[role="switch"]').attributes("aria-checked")).toBe("true");
    await rows[1].find('[role="switch"]').trigger("click");
    expect(wrapper.emitted("update:config")).toContainEqual([{ availableScreens: ["home"] }]);
  });

  it("opens the page editor previewing Any browser", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openDefault(wrapper);

    const editor = wrapper.findComponent(ScreenRegionEditor);
    expect(editor.props("open")).toBe(false);
    await wrapper.find("[data-test='default-edit-pages-btn']").trigger("click");
    expect(editor.props("open")).toBe(true);
    expect(editor.props("initialPreviewKiosk")).toBeNull();
  });

  it("removes Screen now from Screens entirely", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    expect(wrapper.text()).not.toContain("Screen now");
    await openDefault(wrapper);
    expect(wrapper.text()).not.toContain("Screen now");
  });

  it("opens the Default page from an old All-screens deep link", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {});
    store.fetchAvailableAgentVersion = vi.fn(async () => null);
    const wrapper = mount(ScreensSettings, {
      props: { config: config(), initialSection: "device-power" },
    });
    await flushPromises();
    expect(wrapper.find("[data-test='default-screen-page']").exists()).toBe(true);
    expect(wrapper.find("#section-device-power").exists()).toBe(true);
  });
});

describe("ScreensSettings — a screen's page against Default (§4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("Reset everything removes every override except the name", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ overrides: { displayName: "Hallway", orientation: "portrait" } })],
      overrides: {
        displayName: "Hallway",
        orientation: "portrait",
        touchControls: "on",
        availableScreens: ["home"],
      },
    });
    await flushPromises();
    await selectFirst(wrapper);

    const footer = wrapper.find("[data-test='screen-override-footer']");
    expect(footer.exists()).toBe(true);
    await wrapper.find("[data-test='reset-everything']").trigger("click");
    const modal = wrapper.findComponent({ name: "ConfirmModal" });
    expect(modal.props("title")).toBe("Reset Hallway to the default?");
    expect(modal.props("message")).toBe(
      "Its 3 changed settings go back to the default. Its name stays."
    );
    expect(modal.props("confirmText")).toBe("Reset");
    expect(modal.props("danger")).toBe(true);

    modal.vm.$emit("confirm");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { displayName: "Hallway" });
  });

  it("Use these as the default writes the values globally and clears them here", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ overrides: { displayName: "Hallway" } })],
      overrides: {
        displayName: "Hallway",
        orientation: "portrait",
        orientationFlipped: true,
        availableScreens: ["home"],
      },
    });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find("[data-test='use-as-default']").trigger("click");
    const modal = wrapper.findComponent({ name: "ConfirmModal" });
    expect(modal.props("title")).toBe("Make Hallway's settings the default?");
    expect(modal.props("message")).toBe(
      "Default and every screen that follows it will use Hallway's Orientation and Upside down."
    );
    expect(modal.props("confirmText")).toBe("Make default");
    expect(modal.props("danger")).toBe(false);

    modal.vm.$emit("confirm");
    await flushPromises();

    expect(wrapper.emitted("update:config")).toContainEqual([
      { orientation: "portrait", orientationFlipped: true },
    ]);
    // Name and pages stay on the screen; the promoted settings are gone.
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      displayName: "Hallway",
      availableScreens: ["home"],
    });
  });

  it("hides the footer when the screen has no setting of its own", async () => {
    const { wrapper } = mountScreens({
      overrides: { displayName: "Hallway" },
      kiosks: [kiosk({ overrides: { displayName: "Hallway" } })],
    });
    await flushPromises();
    await selectFirst(wrapper);
    expect(wrapper.find("[data-test='screen-override-footer']").exists()).toBe(false);
  });
});

describe("ScreensSettings — editing Default when screens differ (§5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  const mountWithOverrides = () => {
    const mounted = mountScreens({
      kiosks: [
        kiosk({ id: "hall", overrides: { displayName: "Hallway", orientation: "portrait" } }),
        kiosk({ id: "kitchen", hostname: "kitchen-pi", overrides: { orientation: "portrait" } }),
        kiosk({ id: "office", hostname: "office-pi", overrides: { orientationFlipped: true } }),
      ],
    });
    return mounted;
  };

  it("names the screens that keep their own value after a Default edit", async () => {
    const { wrapper } = mountWithOverrides();
    await flushPromises();
    await openDefault(wrapper);

    const orientation = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "landscape");
    await flushPromises();

    const note = wrapper.find("[data-test='default-override-note']");
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("Hallway and kitchen-pi keep their own Orientation.");
  });

  it("Change them too removes that key on those screens", async () => {
    const { wrapper, store } = mountWithOverrides();
    await flushPromises();
    await openDefault(wrapper);

    const orientation = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Orientation");
    orientation.vm.$emit("update:modelValue", "landscape");
    await flushPromises();

    await wrapper.find("[data-test='default-note-change']").trigger("click");
    await flushPromises();

    expect(store.saveOverrides).toHaveBeenCalledWith("hall", { displayName: "Hallway" });
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {});
    // The note goes away once handled.
    expect(wrapper.find("[data-test='default-override-note']").exists()).toBe(false);
  });

  it("shows no note when no screen overrides the key", async () => {
    const { wrapper } = mountWithOverrides();
    await flushPromises();
    await openDefault(wrapper);

    const flip = wrapper
      .findAllComponents(ToggleSwitch)
      .find(c => c.props("ariaLabel") === "Upside down");
    flip.vm.$emit("update:modelValue", true);
    await flushPromises();

    // The office screen overrides Upside down, so a note names only it …
    expect(wrapper.find("[data-test='default-override-note']").text()).toContain(
      "office-pi keeps its own Upside down."
    );

    // … while the touchscreen row has no screen overriding it.
    const touch = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Touchscreen");
    touch.vm.$emit("update:modelValue", "off");
    await flushPromises();
    expect(wrapper.find("[data-test='default-override-note']").exists()).toBe(false);
  });
});

describe("ScreensSettings — This browser page (§6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("lists the per-browser rows with Same as Default", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openBrowser(wrapper);

    expect(wrapper.find("[data-test='this-browser-page']").exists()).toBe(true);
    expect(rowByLabel(wrapper, "Touchscreen")).toBeTruthy();
    expect(rowByLabel(wrapper, "On-screen keyboard")).toBeTruthy();
    expect(rowByLabel(wrapper, "Settings text size")).toBeTruthy();
    expect(wrapper.text()).toContain("Same as Default");
  });

  it("stores a browser choice locally and counts it on the card", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openBrowser(wrapper);

    const touch = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Touchscreen");
    touch.vm.$emit("update:modelValue", "off");
    await flushPromises();
    expect(window.localStorage.getItem("calvin-touch-controls")).toBe("off");
    expect(wrapper.text()).toContain("Changed here");

    await wrapper.find("[data-test='reset-browser-touch']").trigger("click");
    await flushPromises();
    expect(window.localStorage.getItem("calvin-touch-controls")).toBeNull();

    await wrapper.find("[data-test='screens-back']").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-test='browser-summary']").text()).toBe("Same as Default");
  });
});

// §4: Photo frame, Loading light and Layout live on the screen page now.
describe("ScreensSettings — Behaviour (§4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the moved rows in a Behaviour section on a screen's page", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await selectFirst(wrapper);

    expect(wrapper.find("#section-screen-behaviour").exists()).toBe(true);
    expect(rowByLabel(wrapper, "Photo frame")).toBeTruthy();
    expect(rowByLabel(wrapper, "Loading light")).toBeTruthy();
    expect(rowByLabel(wrapper, "Layout")).toBeTruthy();
  });

  it("reads the Default value until this screen has its own", async () => {
    const { wrapper } = mountScreens({
      cfg: config({ photoFrameEnabled: true, loadingLight: "off" }),
    });
    await flushPromises();
    await selectFirst(wrapper);

    const frame = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Photo frame");
    expect(frame.props("modelValue")).toBe(true);
    const light = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Loading light");
    expect(light.props("modelValue")).toBe("off");
    expect(rowByLabel(wrapper, "Photo frame").text()).toContain("Same as Default");
  });

  it("saves a photo frame choice as this screen's override", async () => {
    const { wrapper, store } = mountScreens({ overrides: { orientation: "portrait" } });
    await flushPromises();
    await selectFirst(wrapper);

    const frame = wrapper
      .findAllComponents(SegmentedControl)
      .find(c => c.props("ariaLabel") === "Photo frame");
    frame.vm.$emit("update:modelValue", true);
    await flushPromises();

    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", {
      orientation: "portrait",
      photoFrameEnabled: true,
    });
    expect(rowByLabel(wrapper, "Photo frame").text()).toContain("Changed here");
  });

  it("resets one behaviour override without touching the others", async () => {
    const { wrapper, store } = mountScreens({
      overrides: { loadingLight: "pulse", layoutMode: "phone" },
    });
    await flushPromises();
    await selectFirst(wrapper);

    await wrapper.find('[data-test="reset-loading-light"]').trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("kitchen", { layoutMode: "phone" });
  });

  it("opens the Default page on the Behaviour section from a deep link", async () => {
    const { wrapper } = mountScreens({ initialSection: "device-behaviour" });
    await flushPromises();
    expect(wrapper.find("[data-test='default-screen-page']").exists()).toBe(true);
    expect(wrapper.find("#section-device-behaviour").exists()).toBe(true);
  });
});
