import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import { useConfigStore } from "@/stores/config";

vi.mock("@/composables", async () => {
  const { ref } = await import("vue");
  return {
    usePlugins: () => ({
      plugins: ref([{ id: "x" }]),
      pluginInstances: ref({}),
      loadingPlugins: ref(false),
      loadPlugins: vi.fn(),
    }),
  };
});

describe("ScreenRegionEditor clock-bar preview (F8)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29, 9, 7)); // Thu 09:07
  });
  afterEach(() => vi.useRealTimers());

  it("shows the current time instead of a frozen 12:45 · Tue", async () => {
    useConfigStore().timeFormat = "24h";
    const w = mount(ScreenRegionEditor, {
      props: { config: { clockBarEnabled: true, clockBarPosition: "top" }, open: true },
      global: { stubs: { teleport: true, RegionNode: true, ScreenInspector: true } },
    });
    await flushPromises();

    const bar = w.find(".sre-clockbar");
    expect(bar.exists()).toBe(true);
    expect(bar.text()).not.toContain("12:45");
    expect(bar.text()).toContain("09:07");
    expect(bar.text()).toContain(new Date().toLocaleDateString([], { weekday: "short" }));
  });
});
