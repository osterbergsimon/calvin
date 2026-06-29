// frontend/tests/unit/components/settings/CalendarSourcesTab.spec.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, nextTick } from "vue";
import CalendarSourcesTab from "@/components/settings/tabs/content/CalendarSourcesTab.vue";

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
  getPlugins: vi.fn().mockResolvedValue({
    plugins: [
      { id: "google", name: "Google Calendar", enabled: true },
      { id: "ical", name: "iCal URL", enabled: true },
    ],
  }),
}));

vi.mock("@/composables", () => ({
  usePlugins: () => ({ pluginInstances: mockPluginInstances }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const baseConfig = { calendarRefreshInterval: 15 };

const sampleSource = {
  id: "google-1234",
  type: "google",
  name: "Work Calendar",
  ical_url: "https://calendar.google.com/calendar/ical/test/basic.ics",
  color: "#2196f3",
  show_time: true,
  enabled: true,
};

function mountComp(config = baseConfig) {
  return mount(CalendarSourcesTab, { props: { config } });
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
  });

  // -------------------------------------------------------------------------
  // 1. Mount → fetchSources
  // -------------------------------------------------------------------------
  it("calls fetchSources on mount", async () => {
    mountComp();
    await flushPromises();
    expect(mockFetchSources).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 2. Add → addCalendarSource then fetchSources
  // -------------------------------------------------------------------------
  it("add: fills name+url and clicks 'Add calendar' → calls addCalendarSource then fetchSources", async () => {
    const w = mountComp();
    await flushPromises();
    mockFetchSources.mockClear(); // discard the mount call

    // Fill name and url text inputs
    const textInputs = w.findAll('input[type="text"]');
    await textInputs[0].setValue("My New Cal");
    await textInputs[1].setValue("https://example.com/cal.ics");

    // Find and click the Add button
    const addBtn = w.findAll("button").find(b => /add calendar/i.test(b.text()));
    expect(addBtn).toBeTruthy();
    await addBtn.trigger("click");
    await flushPromises();

    expect(mockAddCalendarSource).toHaveBeenCalledOnce();
    expect(mockAddCalendarSource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My New Cal",
        ical_url: "https://example.com/cal.ics",
        type: expect.any(String),
        color: expect.stringMatching(/^#/),
        show_time: true,
      })
    );
    expect(mockFetchSources).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 3. Color change → updateSource with full object
  // -------------------------------------------------------------------------
  it("color change calls updateSource with full source spread + new hex", async () => {
    mockSources.value = [{ ...sampleSource }];
    const w = mountComp();
    await flushPromises();

    const colorInput = w.find('input[type="color"]');
    colorInput.element.value = "#ff0000";
    await colorInput.trigger("change");
    await flushPromises();

    expect(mockUpdateSource).toHaveBeenCalledOnce();
    expect(mockUpdateSource).toHaveBeenCalledWith(
      sampleSource.id,
      expect.objectContaining({ ...sampleSource, color: "#ff0000" })
    );
  });

  // -------------------------------------------------------------------------
  // 4. show_time toggle → updateSource
  // -------------------------------------------------------------------------
  it("show_time toggle calls updateSource with full object + updated show_time", async () => {
    mockSources.value = [{ ...sampleSource, show_time: true }];
    const w = mountComp();
    await flushPromises();

    // The first ToggleSwitch in a source card is the show_time toggle
    const toggles = w.findAllComponents({ name: "ToggleSwitch" });
    const showTimeToggle = toggles[0];
    showTimeToggle.vm.$emit("update:modelValue", false);
    await flushPromises();

    expect(mockUpdateSource).toHaveBeenCalledOnce();
    expect(mockUpdateSource).toHaveBeenCalledWith(
      sampleSource.id,
      expect.objectContaining({ show_time: false })
    );
  });

  // -------------------------------------------------------------------------
  // 5. enabled toggle → updateSource
  // -------------------------------------------------------------------------
  it("enabled toggle calls updateSource with full object + updated enabled", async () => {
    mockSources.value = [{ ...sampleSource, enabled: true }];
    const w = mountComp();
    await flushPromises();

    // The second ToggleSwitch in a source card is the enabled toggle
    const toggles = w.findAllComponents({ name: "ToggleSwitch" });
    const enabledToggle = toggles[1];
    enabledToggle.vm.$emit("update:modelValue", false);
    await flushPromises();

    expect(mockUpdateSource).toHaveBeenCalledOnce();
    expect(mockUpdateSource).toHaveBeenCalledWith(
      sampleSource.id,
      expect.objectContaining({ enabled: false })
    );
  });

  // -------------------------------------------------------------------------
  // 6. Remove → confirm → deleteCalendarSource then fetchSources
  // -------------------------------------------------------------------------
  it("remove → confirm calls deleteCalendarSource then fetchSources", async () => {
    mockSources.value = [{ ...sampleSource }];
    const w = mountComp();
    await flushPromises();
    mockFetchSources.mockClear();

    // Click the Remove button on the source card
    const removeBtn = w.findAll("button").find(b => /remove/i.test(b.text()));
    expect(removeBtn).toBeTruthy();
    await removeBtn.trigger("click");
    await flushPromises();

    // ConfirmModal should appear — click the confirm (danger) button
    const confirmBtn = w.find(".btn-danger");
    expect(confirmBtn.exists()).toBe(true);
    await confirmBtn.trigger("click");
    await flushPromises();

    expect(mockDeleteCalendarSource).toHaveBeenCalledOnce();
    expect(mockDeleteCalendarSource).toHaveBeenCalledWith(sampleSource.id);
    expect(mockFetchSources).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 7. Refresh interval change → emit update:config
  // -------------------------------------------------------------------------
  it("refresh interval change emits update:config with calendarRefreshInterval", async () => {
    const w = mountComp({ calendarRefreshInterval: 15 });
    await flushPromises();

    const stepper = w.findComponent({ name: "NumberStepper" });
    expect(stepper.exists()).toBe(true);
    stepper.vm.$emit("update:modelValue", 30);
    await flushPromises();

    expect(w.emitted("update:config")).toBeTruthy();
    const emitted = w.emitted("update:config").flat();
    expect(emitted.some(e => e.calendarRefreshInterval === 30)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 8. "Refresh now" button → calendarStore.refreshEvents()
  // -------------------------------------------------------------------------
  it('"Refresh now" button calls calendarStore.refreshEvents()', async () => {
    const w = mountComp();
    await flushPromises();

    const refreshBtn = w.findAll("button").find(b => /refresh now/i.test(b.text()));
    expect(refreshBtn).toBeTruthy();
    await refreshBtn.trigger("click");
    await flushPromises();

    expect(mockRefreshEvents).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 9. Named color → getColorValue hex rendered (data color, not tokenized)
  // -------------------------------------------------------------------------
  it("source with named color 'green' renders the color input as the mapped hex #4caf50", async () => {
    mockSources.value = [{ ...sampleSource, color: "green" }];
    const w = mountComp();
    await flushPromises();

    const colorInput = w.find('input[type="color"]');
    expect(colorInput.element.value).toBe("#4caf50");
  });

  // -------------------------------------------------------------------------
  // 10. Refresh status text shows "Refreshing…" and button is disabled during call
  // -------------------------------------------------------------------------
  it('"Refresh now" shows "Refreshing…" and disables button while refreshEvents is pending', async () => {
    let resolveRefresh;
    mockRefreshEvents = vi.fn().mockImplementation(
      () => new Promise(resolve => { resolveRefresh = resolve; })
    );

    const w = mountComp();
    await flushPromises();

    const refreshBtn = w.findAll("button").find(b => /refresh now/i.test(b.text()));
    expect(refreshBtn).toBeTruthy();

    // Trigger click but do NOT flush — leave the promise pending
    refreshBtn.trigger("click");
    await nextTick();

    expect(refreshBtn.element.disabled).toBe(true);
    expect(w.text()).toContain("Refreshing…");

    // Resolve to allow teardown
    resolveRefresh();
    await flushPromises();
  });

  // -------------------------------------------------------------------------
  // 11. Running dot renders only when source.running is defined
  // -------------------------------------------------------------------------
  it("running dot is absent when no matching plugin instance exists (running undefined)", async () => {
    mockSources.value = [{ ...sampleSource }];
    // mockPluginInstances is {} by default → running stays undefined
    const w = mountComp();
    await flushPromises();

    expect(w.find(".cst-running-dot").exists()).toBe(false);
  });

  it("running dot renders when a matching plugin instance provides a running value", async () => {
    mockSources.value = [{ ...sampleSource }];
    mockPluginInstances = ref({
      google: [{ id: sampleSource.id, running: true }],
    });

    const w = mountComp();
    await flushPromises();

    expect(w.find(".cst-running-dot").exists()).toBe(true);
  });
});
