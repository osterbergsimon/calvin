import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";
import { readFileSync } from "node:fs";

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
import { useCalendarStore } from "@/stores/calendar";

const stubs = {
  DashboardPanel: {
    name: "DashboardPanel",
    props: ["title", "focused", "dim", "headerVisible", "showTitle"],
    template: '<section><slot name="actions" /><slot /></section>',
  },
  EventDetailPanel: true,
  DialogScrim: true,
  CalendarEventItem: true,
  CalendarViewOptions: { name: "CalendarViewOptions", template: "<div class='cvo-stub' />" },
};

function mountCal(props) {
  setActivePinia(createPinia());
  const cal = useCalendarStore();
  cal.fetchSources = vi.fn().mockResolvedValue();
  cal.fetchEvents = vi.fn().mockResolvedValue();
  return mount(CalendarView, {
    props: { view: { mode: "month" }, regionId: "r1", ...props },
    global: { stubs },
  });
}

describe("CalendarView touch controls", () => {
  beforeEach(() => {
    touch.hasPointer.value = true;
  });

  it("never renders the legacy RegionControls cluster", () => {
    const w = mountCal({ focused: true });
    expect(w.find(".region-controls").exists()).toBe(false);
  });

  it("shows the month/year label even when not focused", () => {
    const w = mountCal({ focused: false });
    expect(w.find(".calendar-header__label").exists()).toBe(true);
  });

  it("keeps the control row in the layout but hidden when not focused (calvin-mbze)", () => {
    const w = mountCal({ focused: false });
    const controls = w.find(".calendar-header__controls");
    expect(controls.exists()).toBe(true);
    expect(controls.classes()).toContain("calendar-header__controls--hidden");
    expect(controls.attributes("aria-hidden")).toBe("true");
  });

  it("shows the control row when focused and a pointer is present", () => {
    const w = mountCal({ focused: true });
    const controls = w.find(".calendar-header__controls");
    expect(controls.exists()).toBe(true);
    expect(controls.classes()).not.toContain("calendar-header__controls--hidden");
    expect(controls.attributes("aria-hidden")).toBeUndefined();
  });

  it("gives the hidden row visibility:hidden so it leaves the tab order", () => {
    const css = readFileSync("src/components/CalendarView.vue", "utf8");
    expect(css).toMatch(/\.calendar-header__controls--hidden\s*\{[^}]*visibility:\s*hidden/);
  });

  it("keeps the month title and controls as separate header groups so the header can wrap", () => {
    const w = mountCal({ focused: true });
    const label = w.find(".calendar-header > .calendar-header__label");
    const controls = w.find(".calendar-header > .calendar-header__controls");
    expect(label.exists()).toBe(true);
    expect(label.text()).not.toBe("");
    expect(controls.exists()).toBe(true);
    expect(controls.find(".calendar-header__view-switch").exists()).toBe(true);
  });

  it("hides the control row on a keyboard-only kiosk even when focused", () => {
    touch.hasPointer.value = false;
    const w = mountCal({ focused: true });
    expect(w.find(".calendar-header__controls").exists()).toBe(false);
  });
});
