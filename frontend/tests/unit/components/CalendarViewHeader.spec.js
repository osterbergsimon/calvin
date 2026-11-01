/**
 * Calendar header controls (calvin-8nad).
 *
 * The header had one control per era: a small primary "Today", text-glyph ‹ ›
 * and ⤢ IconButtons at size="custom", a button that cycled the view behind a
 * text caret, and a custom-size tune trigger. Every control now comes from the
 * ui/ gallery at the control height, with one icon set (chevron / close paths
 * from @mdi/js), and the view selector is a direct picker: a SegmentedControl
 * on a wide region, a SelectPill when the region is narrow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";
import { mdiChevronLeft, mdiChevronRight, mdiClose, mdiFullscreen } from "@mdi/js";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));
const touch = { isTouch: ref(false), hasPointer: ref(true) };
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => touch,
}));

import CalendarView from "@/components/CalendarView.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import { useCalendarStore } from "@/stores/calendar";
import { useConfigStore } from "@/stores/config";

const stubs = {
  DashboardPanel: {
    name: "DashboardPanel",
    props: ["title", "focused", "dim", "headerVisible", "showTitle"],
    template: "<section><slot name='actions' /><slot /></section>",
  },
  EventDetailPanel: true,
  DialogScrim: true,
  CalendarEventItem: true,
  CalendarViewOptions: {
    name: "CalendarViewOptions",
    template: "<button class='region-view-options__trigger' aria-label='Calendar view options' />",
  },
};

const VIEW = { mode: "month", rolling: false, weeks: 4, days: 7 };
const originalWidth = window.innerWidth;

function setViewportWidth(width) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

function mountHeader(view = VIEW, { touchControlSize } = {}) {
  setActivePinia(createPinia());
  const cal = useCalendarStore();
  cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
  cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
  cal.events = [];
  cal.sources = [];
  cal.loading = false;
  const cfg = useConfigStore();
  cfg.updateRegionView = vi.fn().mockResolvedValue();
  if (touchControlSize) cfg.touchControlSize = touchControlSize;
  // Move off the current period so the conditional "Today" jump renders too.
  cal.setCurrentDate(new Date(2027, 0, 15));

  const w = mount(CalendarView, {
    props: { sourceIds: [], regionId: "r1", view, focused: true },
    global: { stubs: { ...stubs, teleport: true } },
  });
  return { w, cfg };
}

const segments = w => w.findAll(".calendar-header__view-switch .seg__btn");
const segmentByLabel = (w, label) => segments(w).find(seg => seg.text() === label);

afterEach(() => {
  setViewportWidth(originalWidth);
});

describe("CalendarView header view selector", () => {
  beforeEach(() => setViewportWidth(1280));

  it("renders a SegmentedControl listing the cycleView views with the current one selected", () => {
    const { w } = mountHeader();
    const seg = w.findComponent(SegmentedControl);

    expect(seg.exists()).toBe(true);
    expect(seg.props("options").map(o => o.value)).toEqual(["month", "week", "day"]);
    expect(segments(w).map(seg => seg.text())).toEqual(["Month", "Week", "Day"]);
    expect(
      segments(w)
        .find(seg => seg.classes().includes("on"))
        .text()
    ).toBe("Month");
    expect(seg.props("modelValue")).toBe("month");
  });

  it("selects a view directly instead of cycling to the next one", async () => {
    const { w, cfg } = mountHeader();

    await segmentByLabel(w, "Day").trigger("click");

    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { mode: "day" });
  });

  it("tracks the selected view from the region's view prop", async () => {
    const { w } = mountHeader();
    await w.setProps({ view: { ...VIEW, mode: "week" } });

    expect(
      segments(w)
        .find(seg => seg.classes().includes("on"))
        .text()
    ).toBe("Week");
  });

  it("uses a SelectPill instead of the segmented control on a narrow region", () => {
    setViewportWidth(390);
    const { w } = mountHeader();

    expect(w.findComponent(SelectPill).exists()).toBe(true);
    expect(w.findComponent(SegmentedControl).exists()).toBe(false);
    expect(w.find(".calendar-header__view-switch").text()).toContain("Month");
    // The pill keeps the same accessible name (including rolling) as segments.
    expect(w.find(".calendar-header__view-switch .pill").attributes("aria-label")).toContain(
      "Calendar view, currently Month"
    );
  });

  it("selects a view from the narrow SelectPill", async () => {
    setViewportWidth(390);
    const { w, cfg } = mountHeader();

    const pill = w.findComponent(SelectPill);
    expect(pill.props("options").map(o => o.value)).toEqual(["month", "week", "day"]);
    await pill.vm.$emit("update:modelValue", "week");
    expect(cfg.updateRegionView).toHaveBeenCalledWith("r1", { mode: "week" });
  });
});

describe("CalendarView header control set", () => {
  beforeEach(() => setViewportWidth(1280));

  it("uses mdi chevrons with accessible names for previous/next", () => {
    const { w } = mountHeader();
    const prev = w.find('.calendar-header__controls [aria-label="Previous"]');
    const next = w.find('.calendar-header__controls [aria-label="Next"]');

    expect(prev.find("path").attributes("d")).toBe(mdiChevronLeft);
    expect(next.find("path").attributes("d")).toBe(mdiChevronRight);
    // No text glyphs left in the control.
    expect(prev.text()).toBe("");
    expect(next.text()).toBe("");
  });

  it("puts every control on the shared region control rail", () => {
    const { w } = mountHeader();
    const today = w.find(".calendar-header__today");
    const prev = w.find('.calendar-header__controls [aria-label="Previous"]');
    const next = w.find('.calendar-header__controls [aria-label="Next"]');
    const fullscreen = w.find(".calendar-header__fullscreen");

    expect(w.find(".region-header-controls").exists()).toBe(true);
    expect(today.classes()).toContain("btn--custom");
    for (const control of [prev, next, fullscreen]) {
      expect(control.classes()).toContain("icon-btn--custom");
    }
  });

  it("uses mdi fullscreen and close icons, not text glyphs", () => {
    const { w } = mountHeader();
    expect(w.find(".calendar-header__fullscreen path").attributes("d")).toBe(mdiFullscreen);

    const fullscreenView = mount(CalendarView, {
      props: { sourceIds: [], regionId: "r1", view: VIEW, focused: true, isFullscreen: true },
      global: { stubs: { ...stubs, teleport: true } },
    });
    expect(
      fullscreenView
        .find('.fullscreen-close-overlay [data-action="exit-fullscreen"] path')
        .attributes("d")
    ).toBe(mdiClose);
    fullscreenView.unmount();
  });

  it("follows Dashboard size: xsmall and xlarge give different control rails", () => {
    const { w: small } = mountHeader(VIEW, { touchControlSize: "xsmall" });
    const { w: large } = mountHeader(VIEW, { touchControlSize: "xlarge" });
    const rail = w =>
      w.find(".region-header-controls").element.style.getPropertyValue("--region-rail-h");
    const glyph = w =>
      w.find(".region-header-controls").element.style.getPropertyValue("--region-glyph-fs");

    expect(rail(small)).toBe("22px");
    expect(rail(large)).toBe("40px");
    expect(glyph(small)).toBe("0.8rem");
    expect(glyph(large)).toBe("1.25rem");
  });

  it("keeps the previous/next actions working", async () => {
    const { w } = mountHeader();
    const label = () => w.find(".calendar-header__label").text();

    expect(label()).toBe("January 2027");
    await w.find('.calendar-header__controls [aria-label="Next"]').trigger("click");
    expect(label()).toBe("February 2027");
    await w.find('.calendar-header__controls [aria-label="Previous"]').trigger("click");
    expect(label()).toBe("January 2027");
  });
});
