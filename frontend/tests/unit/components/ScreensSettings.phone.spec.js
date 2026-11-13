import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref, computed, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { vi } from "vitest";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { openQuery } from "@/composables/useSettingsPhoneNav";
import ListRow from "@/components/ui/ListRow.vue";

const kiosk = {
  id: "kitchen",
  hostname: "kitchen-pi",
  lastSeen: new Date().toISOString(),
  overrides: {},
  agentVersion: null,
};

async function mountPhone(query, props = {}) {
  setActivePinia(createPinia());
  delete window.matchMedia;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/settings", component: { template: "<div />" } }],
  });
  router.push({ path: "/settings", query });
  await router.isReady();
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = [kiosk];
  });
  store.refreshKiosks = vi.fn(async () => {});
  store.fetchOverrides = vi.fn(async () => ({}));
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => null);
  const nav = {
    active: ref(true),
    open: vi.fn(async (patch, { replace = false } = {}) => {
      const query = openQuery(router.currentRoute.value.query, patch);
      return replace ? router.replace({ query }) : router.push({ query });
    }),
    up: vi.fn(),
    setTitle: vi.fn(),
    titles: ref({}),
    query: computed(() => router.currentRoute.value.query),
  };
  const wrapper = mount(ScreensSettings, {
    props: {
      ...props,
      config: {
        orientation: "landscape",
        dashboardScreens: { version: 2, activeScreenId: "h", screens: [] },
      },
    },
    global: { plugins: [router], provide: { settingsPhoneNav: nav } },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("ScreensSettings — phone page stack", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a chevron on every screen row and hides the repeated SCREENS eyebrow", async () => {
    const { wrapper } = await mountPhone({ category: "screens" });
    const rows = wrapper.findAllComponents(ListRow);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) expect(row.props("chevron")).toBe(true);
    const eyebrow = wrapper.find(".settings-section__eyebrow");
    expect(eyebrow.classes()).toContain("settings-section__eyebrow--hidden");
  });

  it("steps up to the list with a note when ?screen= names a removed screen", async () => {
    const { wrapper, router } = await mountPhone({ category: "screens", screen: "ghost" });
    await nextTick();
    expect(router.currentRoute.value.query.screen).toBeUndefined();
    expect(router.currentRoute.value.query.category).toBe("screens");
    expect(wrapper.find("[data-test='screen-removed-note']").text()).toContain(
      "That screen was removed"
    );
    expect(wrapper.find("[data-test='screens-detail']").exists()).toBe(false);
    // Padded like a row, not a bare child of the panel's border.
    expect(wrapper.find("[data-test='screen-removed-note']").element.parentElement.className).toBe(
      "settings-section__intro"
    );
  });

  it("opens a known ?screen= normally, with no note", async () => {
    const { wrapper } = await mountPhone({ category: "screens", screen: "kitchen" });
    expect(wrapper.find("[data-test='screen-removed-note']").exists()).toBe(false);
    expect(wrapper.find("[data-test='screens-detail']").exists()).toBe(true);
  });

  it("keeps the category in the URL when a ?setting= deep link opens a screen page", async () => {
    const { router } = await mountPhone(
      { setting: "dashboard-ui" },
      { initialSection: "screen-look" }
    );
    await nextTick();
    const query = router.currentRoute.value.query;
    expect(query.category).toBe("screens");
    expect(query.screen).toBe("default");
    expect(query.section).toBe("screen-look");
    expect(query.setting).toBeUndefined();
  });
});
