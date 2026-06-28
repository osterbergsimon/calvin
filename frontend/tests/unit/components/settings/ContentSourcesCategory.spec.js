import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ContentSourcesCategory from "@/components/settings/categories/ContentSourcesCategory.vue";

// Mock the pluginsApi to prevent actual API calls
vi.mock("@/services/pluginsApi", () => ({
  getPlugins: vi.fn().mockResolvedValue({ plugins: [] }),
  getInstalledPlugins: vi.fn().mockRejectedValue({ response: { status: 404 } }),
}));

const stubs = {
  CalendarSourcesTab: { name: "CalendarSourcesTab", props: ["config"], emits: ["update:config"], template: "<div />" },
  PhotosTab: { name: "PhotosTab", props: ["config"], emits: ["update:config"], template: "<div />" },
  ImagesTab: { name: "ImagesTab", template: "<div />" },
  ServicesTab: { name: "ServicesTab", template: "<div />" },
  SettingsTab: { name: "SettingsTab", template: "<div><slot /></div>" },
};

describe("ContentSourcesCategory", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the four tab labels: Calendars, Photos, Image Sources, Services", () => {
    const w = mount(ContentSourcesCategory, { props: { config: {} }, global: { stubs } });
    const text = w.text();
    expect(text).toContain("Calendars");
    expect(text).toContain("Photos");
    expect(text).toContain("Image Sources");
    expect(text).toContain("Services");
  });
});
