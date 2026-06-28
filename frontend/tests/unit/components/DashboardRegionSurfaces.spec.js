import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import CalendarView from "@/components/CalendarView.vue";
import PhotoSlideshow from "@/components/PhotoSlideshow.vue";
import ServiceViewer from "@/components/service/ServiceViewer.vue";
import { useCalendarStore } from "@/stores/calendar";
import { useConfigStore } from "@/stores/config";
import { useImagesStore } from "@/stores/images";

const schemaData = ref(null);

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/composables/useSchemaData", () => ({
  useSchemaData: () => ({ data: schemaData }),
}));

describe("dashboard region surfaces", () => {
  let wrappers;

  beforeEach(() => {
    setActivePinia(createPinia());
    wrappers = [];
    schemaData.value = { value: "ok" };
    vi.spyOn(console, "log").mockImplementation(() => {});

    const configStore = useConfigStore();
    configStore.showUI = false;
    configStore.calendarViewMode = "month";
    configStore.showWeekNumbers = false;
    configStore.showRedDays = false;

    const calendarStore = useCalendarStore();
    calendarStore.fetchSources = vi.fn().mockResolvedValue({ sources: [] });
    calendarStore.fetchEvents = vi.fn().mockResolvedValue({ events: [] });
    calendarStore.events = [];
    calendarStore.sources = [];
    calendarStore.loading = false;

    const imagesStore = useImagesStore();
    imagesStore.fetchImages = vi.fn().mockResolvedValue({ images: [] });
    imagesStore.fetchCurrentImage = vi.fn().mockResolvedValue(undefined);
    imagesStore.loading = false;
    imagesStore.error = null;
    imagesStore.images = [];
    imagesStore.currentImage = null;
  });

  afterEach(() => {
    wrappers.forEach(wrapper => wrapper.unmount());
    vi.restoreAllMocks();
  });

  function track(wrapper) {
    wrappers.push(wrapper);
    return wrapper;
  }

  it("hides shared headers consistently when dashboard UI is hidden", () => {
    const calendar = track(mount(CalendarView));
    const photos = track(mount(PhotoSlideshow, { props: { isFullscreen: false } }));
    const service = track(
      mount(ServiceViewer, {
        props: {
          service: {
            id: "service",
            name: "Weather",
            display_schema: { kind: "status-tile", title: "Weather" },
          },
        },
        global: {
          stubs: {
            SchemaRenderer: {
              template: '<div class="schema-renderer-stub" />',
            },
          },
        },
      })
    );

    expect(calendar.find(".dashboard-panel__header").exists()).toBe(false);
    expect(calendar.find(".calendar-header-minimal").exists()).toBe(false);
    expect(photos.find(".dashboard-panel__header").exists()).toBe(false);
    expect(photos.find(".slideshow-header").exists()).toBe(false);
    expect(service.find(".dashboard-panel__header").exists()).toBe(false);
  });
});
