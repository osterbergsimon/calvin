import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";
import { useKiosksStore } from "@/stores/kiosks";

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

// GET /kiosks carries no overrides, so the preview must fetch them per kiosk.
const mountWithKiosk = async overrides => {
  const kiosks = useKiosksStore();
  kiosks.kiosks = [{ id: "hall", hostname: "hallway" }];
  kiosks.loadKiosks = vi.fn();
  kiosks.fetchOverrides = vi.fn().mockResolvedValue(overrides);
  const w = mount(ScreenRegionEditor, {
    props: {
      config: {
        orientation: "landscape",
        dashboardScreens: {
          activeScreenId: "home",
          screens: [
            { id: "home", name: "Home", layout: { type: "region", id: "r1", content: null } },
            { id: "photos", name: "Photos", layout: { type: "region", id: "r2", content: null } },
          ],
        },
      },
      open: true,
    },
    global: {
      stubs: { teleport: true, RegionNode: true, ScreenInspector: true, RegionInspector: true },
    },
  });
  await flushPromises();
  await w.findComponent({ name: "SelectPill" }).vm.$emit("update:modelValue", "hall");
  await flushPromises();
  return { w, kiosks };
};

describe("ScreenRegionEditor preview as kiosk", () => {
  it("uses the kiosk's own orientation and flip", async () => {
    const { w, kiosks } = await mountWithKiosk({
      orientation: "portrait",
      orientationFlipped: true,
    });
    expect(kiosks.fetchOverrides).toHaveBeenCalledWith("hall");
    expect(w.find(".sre-device").classes()).toContain("portrait");
    expect(w.find(".sre-orient-badge").text()).toBe("Portrait · 180°");
  });

  it("warns when the kiosk doesn't show the screen", async () => {
    const { w } = await mountWithKiosk({ availableScreens: ["photos"] });
    expect(w.find(".sre-mismatch").exists()).toBe(true);
  });

  it("falls back to the shared settings when the kiosk has none", async () => {
    const { w } = await mountWithKiosk({});
    expect(w.find(".sre-device").classes()).toContain("landscape");
    expect(w.find(".sre-mismatch").exists()).toBe(false);
  });
});
