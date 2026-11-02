/**
 * CalendarView header width comes from the ResizeObserver's contentRect, not a
 * forced `clientWidth` read during mount/render (calvin-ex6w, kiosk
 * performance fix 6).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));
const touch = { isTouch: { value: false }, hasPointer: { value: true } };
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => touch,
}));

import CalendarView from "@/components/CalendarView.vue";
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

describe("CalendarView header measurement", () => {
  let observers;
  let clientWidthTargets;

  beforeEach(() => {
    setActivePinia(createPinia());
    const cal = useCalendarStore();
    cal.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    cal.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    cal.events = [];
    cal.sources = [];
    cal.loading = false;
    cal.setCurrentDate(new Date(2027, 0, 15));
    useConfigStore();

    observers = [];
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    };
    clientWidthTargets = [];
    vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function () {
      clientWidthTargets.push(this);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.ResizeObserver;
  });

  it("caches the header width from the ResizeObserver and never reads clientWidth", async () => {
    const wrapper = mount(CalendarView, {
      props: { sourceIds: [], regionId: "r1", view: VIEW, focused: true },
      global: { stubs: { ...stubs, teleport: true } },
    });
    await flushPromises();

    const headerObserver = observers.find(observer =>
      observer.observe.mock.calls.some(([element]) =>
        element?.classList?.contains("calendar-header")
      )
    );
    expect(headerObserver).toBeDefined();
    expect(
      clientWidthTargets.some(element => element?.classList?.contains("calendar-header"))
    ).toBe(false);

    headerObserver.callback([{ contentRect: { width: 390, height: 80 } }]);
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".calendar-header__view-switch .pill").exists()).toBe(true);
    wrapper.unmount();
  });
});
