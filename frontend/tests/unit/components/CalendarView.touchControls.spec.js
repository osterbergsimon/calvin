import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";

vi.mock("vue-router", () => ({ useRoute: () => ({ path: "/" }) }));
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

  it("hides the control row when not focused", () => {
    const w = mountCal({ focused: false });
    expect(w.find(".calendar-header__controls").exists()).toBe(false);
  });

  it("shows the control row when focused and a pointer is present", () => {
    const w = mountCal({ focused: true });
    expect(w.find(".calendar-header__controls").exists()).toBe(true);
  });

  it("hides the control row on a keyboard-only kiosk even when focused", () => {
    touch.hasPointer.value = false;
    const w = mountCal({ focused: true });
    expect(w.find(".calendar-header__controls").exists()).toBe(false);
  });
});
