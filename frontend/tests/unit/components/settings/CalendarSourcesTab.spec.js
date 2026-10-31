// frontend/tests/unit/components/settings/CalendarSourcesTab.spec.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, nextTick } from "vue";

// ---------------------------------------------------------------------------
// Shared mock state — closures in vi.mock factories read these by reference
// ---------------------------------------------------------------------------
let mockSources;
let mockFetchSources;
let mockUpdateSource;
let mockRefreshEvents;
let mockAddCalendarSource;
let mockDeleteCalendarSource;
let mockPluginInstances;
let mockPlugins;
let mockLoadPlugins;

vi.mock("@/stores/calendar", () => ({
  // Pinia auto-unwraps refs; mirror that by returning .value from a getter so
  // Vue's reactivity system still tracks mockSources inside computed effects.
  useCalendarStore: () => ({
    get sources() {
      return mockSources ? mockSources.value : [];
    },
    get fetchSources() {
      return mockFetchSources;
    },
    get updateSource() {
      return mockUpdateSource;
    },
    get refreshEvents() {
      return mockRefreshEvents;
    },
  }),
}));

vi.mock("@/services/calendarApi", () => ({
  addCalendarSource: (...args) => mockAddCalendarSource(...args),
  deleteCalendarSource: (...args) => mockDeleteCalendarSource(...args),
}));

vi.mock("@/services/pluginsApi", () => ({
  deletePluginInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/composables", () => ({
  usePlugins: () => ({
    plugins: mockPlugins,
    pluginInstances: mockPluginInstances,
    loadPlugins: mockLoadPlugins,
  }),
}));

import CalendarSourcesTab from "@/components/settings/tabs/content/CalendarSourcesTab.vue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const baseConfig = { calendarRefreshInterval: 15 };

const sampleSource = {
  id: "google-1234",
  type: "google",
  name: "Work Calendar",
  ical_url: "https://calendar.google.com/calendar/ical/test/basic.ics",
  color: "#275f86",
  show_time: true,
  enabled: true,
};

const STUBS = {
  AddSourceButton: { name: "AddSourceButton", emits: ["saved"], template: "<div />" },
  InstanceModal: true,
};

function mountComp(config = baseConfig) {
  return mount(CalendarSourcesTab, {
    props: { config },
    global: { stubs: STUBS },
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("CalendarSourcesTab", () => {
  beforeEach(() => {
    mockSources = ref([]);
    mockFetchSources = vi.fn().mockResolvedValue(undefined);
    mockUpdateSource = vi.fn().mockResolvedValue(undefined);
    mockRefreshEvents = vi.fn().mockResolvedValue(undefined);
    mockAddCalendarSource = vi.fn().mockResolvedValue({});
    mockDeleteCalendarSource = vi.fn().mockResolvedValue({});
    mockPluginInstances = ref({});
    mockPlugins = ref([{ id: "google", name: "Google Calendar", type: "calendar", enabled: true }]);
    mockLoadPlugins = vi.fn().mockResolvedValue(undefined);
  });

  it("calls fetchSources on mount", async () => {
    mountComp();
    await flushPromises();
    expect(mockFetchSources).toHaveBeenCalledOnce();
  });

  it("names the provider and keeps the calendar row extras", async () => {
    mockSources.value = [{ ...sampleSource }];
    const w = mountComp();
    await flushPromises();

    const row = w.find(".sl-row");
    expect(row.find(".list-row__name").text()).toBe("Work Calendar");
    expect(row.text()).toContain("Google Calendar");
    // Colour is the only calendar-only extra on the row.
    expect(row.find('input[type="color"]').exists()).toBe(true);
    // Show event times lives in the Edit dialog, so the row carries exactly one
    // toggle (enabled) and never two side by side.
    expect(row.text()).not.toContain("Show event times");
    expect(row.find(".cal-show-times").exists()).toBe(false);
    const toggles = row.findAllComponents({ name: "ToggleSwitch" });
    expect(toggles).toHaveLength(1);
    expect(toggles[0].props("ariaLabel")).toBe("Show Work Calendar");
  });

  it("add: the shared form's new calendar becomes a calendar source row", async () => {
    mockPluginInstances.value = {
      google: [{ id: "google-new", name: "New Cal", enabled: true, config: {} }],
    };
    const w = mountComp();
    await flushPromises();
    mockFetchSources.mockClear();

    const addStub = w.findComponent({ name: "AddSourceButton" });
    expect(addStub.exists()).toBe(true);
    addStub.vm.$emit("saved", {
      pluginId: "google",
      saveData: {
        isCalendar: true,
        instanceName: "New Cal",
        calendarConfig: {
          color: "#ff0000",
          show_time: true,
          ical_url: "https://example.com/cal.ics",
          type: "google",
        },
      },
    });
    await flushPromises();

    expect(mockAddCalendarSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "google-new",
        type: "google",
        name: "New Cal",
        ical_url: "https://example.com/cal.ics",
        color: "#ff0000",
        show_time: true,
      })
    );
    expect(mockFetchSources).toHaveBeenCalled();
  });

  it("color change calls updateSource with full source spread + new hex", async () => {
    mockSources.value = [{ ...sampleSource }];
    const w = mountComp();
    await flushPromises();

    const colorInput = w.find('input[type="color"]');
    colorInput.element.value = "#ff0000";
    await colorInput.trigger("change");
    await flushPromises();

    expect(mockUpdateSource).toHaveBeenCalledWith(
      sampleSource.id,
      expect.objectContaining({ ...sampleSource, color: "#ff0000" })
    );
  });

  it("enabled toggle calls updateSource with full object + updated enabled", async () => {
    mockSources.value = [{ ...sampleSource, enabled: true }];
    const w = mountComp();
    await flushPromises();

    const enabledToggle = w
      .findAllComponents({ name: "ToggleSwitch" })
      .find(t => t.props("ariaLabel") === "Show Work Calendar");
    enabledToggle.vm.$emit("update:modelValue", false);
    await flushPromises();

    expect(mockUpdateSource).toHaveBeenCalledWith(
      sampleSource.id,
      expect.objectContaining({ enabled: false })
    );
  });

  it("remove → confirm calls deleteCalendarSource then fetches sources", async () => {
    mockSources.value = [{ ...sampleSource }];
    const w = mountComp();
    await flushPromises();
    mockFetchSources.mockClear();

    await w.find(".sl-more-btn").trigger("click");
    await w.find(".sl-menu-item").trigger("click");
    await flushPromises();

    const confirmBtn = w.find(".btn-danger");
    expect(confirmBtn.exists()).toBe(true);
    await confirmBtn.trigger("click");
    await flushPromises();

    expect(mockDeleteCalendarSource).toHaveBeenCalledWith(sampleSource.id);
    expect(mockFetchSources).toHaveBeenCalledOnce();
  });

  it("refresh interval change emits update:config with calendarRefreshInterval", async () => {
    const w = mountComp({ calendarRefreshInterval: 15 });
    await flushPromises();

    const stepper = w.findComponent({ name: "NumberStepper" });
    stepper.vm.$emit("update:modelValue", 30);
    await flushPromises();

    expect(w.emitted("update:config")).toContainEqual([{ calendarRefreshInterval: 30 }]);
  });

  it('"Refresh now" button calls calendarStore.refreshEvents()', async () => {
    const w = mountComp();
    await flushPromises();

    const refreshBtn = w.findAll("button").find(b => /refresh now/i.test(b.text()));
    await refreshBtn.trigger("click");
    await flushPromises();

    expect(mockRefreshEvents).toHaveBeenCalledOnce();
  });

  it('"Refresh now" shows "Refreshing…" and disables the button while pending', async () => {
    let resolveRefresh;
    mockRefreshEvents = vi.fn().mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve;
        })
    );

    const w = mountComp();
    await flushPromises();

    const refreshBtn = w.findAll("button").find(b => /refresh now/i.test(b.text()));
    refreshBtn.trigger("click");
    await nextTick();

    expect(refreshBtn.element.disabled).toBe(true);
    expect(w.text()).toContain("Refreshing…");

    resolveRefresh();
    await flushPromises();
  });

  it("source with named color 'green' renders the mapped hex #4caf50", async () => {
    mockSources.value = [{ ...sampleSource, color: "green" }];
    const w = mountComp();
    await flushPromises();

    expect(w.find('input[type="color"]').element.value).toBe("#4caf50");
  });

  it("running dot is absent when no matching plugin instance exists", async () => {
    mockSources.value = [{ ...sampleSource }];
    const w = mountComp();
    await flushPromises();

    expect(w.find(".sl-dot").exists()).toBe(false);
  });

  it("running dot renders when a matching plugin instance provides a running value", async () => {
    mockSources.value = [{ ...sampleSource }];
    mockPluginInstances.value = { google: [{ id: sampleSource.id, running: true }] };

    const w = mountComp();
    await flushPromises();

    expect(w.find(".sl-dot").exists()).toBe(true);
  });
});
