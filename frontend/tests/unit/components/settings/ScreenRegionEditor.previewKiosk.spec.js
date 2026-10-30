import { describe, it, expect, vi, beforeEach } from "vitest";
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

const config = {
  orientation: "landscape",
  dashboardScreens: {
    activeScreenId: "home",
    screens: [
      { id: "home", name: "Home", layout: { type: "region", id: "r1", content: null } },
      { id: "photos", name: "Photos", layout: { type: "region", id: "r2", content: null } },
    ],
  },
};

const mountEditor = async ({
  kiosks = [],
  props = {},
  initialPreviewKiosk = null,
  open = true,
} = {}) => {
  const store = useKiosksStore();
  store.kiosks = kiosks;
  store.loadKiosks = vi.fn();
  // GET /kiosks carries overrides now; only the "Show it on" write path fetches.
  store.fetchOverrides = vi
    .fn()
    .mockImplementation(async id => store.kiosks.find(k => k.id === id)?.overrides ?? {});
  store.saveOverrides = vi.fn().mockResolvedValue();
  const w = mount(ScreenRegionEditor, {
    props: {
      config: props.config ?? JSON.parse(JSON.stringify(config)),
      open,
      initialPreviewKiosk,
      ...props,
    },
    global: {
      stubs: { teleport: true, RegionNode: true, ScreenInspector: true, RegionInspector: true },
    },
  });
  await flushPromises();
  return { w, store };
};

const selectPreview = async (w, id) => {
  await w.findComponent({ name: "SelectPill" }).vm.$emit("update:modelValue", id);
  await flushPromises();
};

const badge = w => w.find('[data-test="orientation-badge"]').text();
const device = w => w.find(".sre-device");

describe("ScreenRegionEditor preview on a screen", () => {
  beforeEach(() => sessionStorage.clear());

  it("preselects the kiosk when the editor is opened on one", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "hall");
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-hall", overrides: { displayName: "Hallway" } }],
    });
    expect(w.find(".pill__label").text()).toBe("Hallway");
    expect(w.find('[data-test="orientation-badge"]').exists()).toBe(true);
  });

  it("preselects the screen passed by Edit pages", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-hall", overrides: { displayName: "Hallway" } }],
      initialPreviewKiosk: "hall",
    });
    expect(w.find(".pill__label").text()).toBe("Hallway");
  });

  it("otherwise starts on Any browser", async () => {
    const { w } = await mountEditor({ kiosks: [{ id: "hall", hostname: "pi-hall" }] });
    expect(w.find(".pill__label").text()).toBe("Any browser");
    expect(w.find(".sre-orient-toggle").exists()).toBe(true);
  });

  it("names a screen by displayName, then hostname, then id", async () => {
    const { w } = await mountEditor({
      kiosks: [
        { id: "a", hostname: "pi-a", overrides: { displayName: "Kitchen" } },
        { id: "b", hostname: "pi-b", overrides: {} },
        { id: "c", overrides: {} },
      ],
    });
    await selectPreview(w, "a");
    expect(w.find(".pill__label").text()).toBe("Kitchen");
    await selectPreview(w, "b");
    expect(w.find(".pill__label").text()).toBe("pi-b");
    await selectPreview(w, "c");
    expect(w.find(".pill__label").text()).toBe("c");
  });

  it("uses the screen's orientation and reported viewport", async () => {
    const { w } = await mountEditor({
      kiosks: [
        {
          id: "hall",
          hostname: "pi-hall",
          overrides: { orientation: "portrait" },
          viewport: { w: 1080, h: 1920 },
        },
      ],
    });
    await selectPreview(w, "hall");
    expect(device(w).classes()).toContain("portrait");
    expect(device(w).attributes("style")).toContain("width: 315px");
    expect(device(w).attributes("style")).toContain("height: 560px");
    expect(badge(w)).toBe("Portrait · 1080×1920");
  });

  it("falls back to 16:9 / 9:16 without a viewport report", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-hall", overrides: { orientation: "portrait" } }],
    });
    await selectPreview(w, "hall");
    expect(device(w).attributes("style")).toContain("width: 315px");
    expect(device(w).attributes("style")).toContain("height: 560px");
    expect(badge(w)).toBe("Portrait");
  });

  it("states upside down in the badge without rotating the preview", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", overrides: { orientationFlipped: true } }],
    });
    await selectPreview(w, "hall");
    expect(badge(w)).toBe("Landscape · mounted upside down");
    expect(w.find(".sre-device-wrap").classes()).not.toContain("flip");
    expect(w.find(".sre-device-wrap").attributes("style") || "").not.toContain("rotate");
  });

  it("with Any browser, the orientation toggle changes the preview and writes nothing", async () => {
    const { w } = await mountEditor({ kiosks: [{ id: "hall" }] });
    expect(device(w).classes()).toContain("landscape");
    const portrait = w.findAll(".sre-orient-toggle .seg__btn").find(b => b.text() === "Portrait");
    await portrait.trigger("click");
    expect(device(w).classes()).toContain("portrait");
    expect(badge(w)).toBe("Portrait");
    expect(w.emitted("update:config")).toBeUndefined();
  });
});

describe("ScreenRegionEditor page tabs know their screens", () => {
  beforeEach(() => sessionStorage.clear());

  it("lists the named screens showing each page", async () => {
    const { w } = await mountEditor({
      kiosks: [
        {
          id: "kitchen",
          hostname: "pi-k",
          overrides: { displayName: "Kitchen", availableScreens: ["home"] },
        },
        {
          id: "hall",
          hostname: "pi-h",
          overrides: { displayName: "Hallway", availableScreens: ["home"] },
        },
        {
          id: "office",
          hostname: "pi-o",
          overrides: { displayName: "Office", availableScreens: ["photos"] },
        },
      ],
    });
    const lines = w.findAll('[data-test="page-screens"]').map(n => n.text());
    expect(lines).toEqual(["Kitchen, Hallway", "Office"]);
  });

  it("says All screens when every screen shows the page", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-h", overrides: {} }],
    });
    expect(w.findAll('[data-test="page-screens"]').map(n => n.text())).toEqual([
      "All screens",
      "All screens",
    ]);
  });

  it("says All screens when no screens are known", async () => {
    const { w } = await mountEditor({ kiosks: [] });
    expect(w.findAll('[data-test="page-screens"]').map(n => n.text())).toEqual([
      "All screens",
      "All screens",
    ]);
  });

  it("says Not on any screen when no screen shows the page", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", overrides: { availableScreens: [] } }],
    });
    expect(w.findAll('[data-test="page-screens"]').map(n => n.text())).toEqual([
      "Not shown",
      "Not shown",
    ]);
  });

  it("dims the tabs a previewed screen does not show", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", overrides: { displayName: "Hallway", availableScreens: ["photos"] } }],
    });
    await selectPreview(w, "hall");
    const tabs = w.findAll(".sre-tab");
    expect(tabs[0].classes()).toContain("is-dimmed"); // Home
    expect(tabs[1].classes()).not.toContain("is-dimmed"); // Photos
  });
});

describe("ScreenRegionEditor mismatch banner", () => {
  beforeEach(() => sessionStorage.clear());

  const mismatchKiosk = () => ({
    id: "hall",
    hostname: "pi-hall",
    overrides: { displayName: "Hallway", availableScreens: ["photos"] },
  });

  it("Show it on <screen> PUTs the merged overrides and dismisses the banner", async () => {
    const { w, store } = await mountEditor({ kiosks: [mismatchKiosk()] });
    await selectPreview(w, "hall");
    expect(w.find('[data-test="mismatch"]').exists()).toBe(true);
    await w.find(".sre-mismatch__btn").trigger("click");
    await flushPromises();
    expect(store.fetchOverrides).toHaveBeenCalledWith("hall");
    expect(store.saveOverrides).toHaveBeenCalledWith("hall", {
      displayName: "Hallway",
      availableScreens: ["photos", "home"],
    });
    expect(w.find('[data-test="mismatch"]').exists()).toBe(false);
  });

  it("keeps the banner and explains the failure when the PUT fails", async () => {
    const { w, store } = await mountEditor({ kiosks: [mismatchKiosk()] });
    store.saveOverrides.mockRejectedValueOnce(new Error("offline"));
    await selectPreview(w, "hall");
    await w.find(".sre-mismatch__btn").trigger("click");
    await flushPromises();
    expect(w.find('[data-test="mismatch"]').exists()).toBe(true);
    expect(w.find('[data-test="mismatch"]').text()).toContain(
      "Couldn't update Hallway. Try again."
    );
  });
});
