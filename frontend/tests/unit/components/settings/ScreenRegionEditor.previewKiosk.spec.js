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
const deviceBox = w => {
  const style = device(w).element.style;
  return { width: parseFloat(style.width), height: parseFloat(style.height) };
};

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

  it("otherwise starts on Browsers & new screens", async () => {
    const { w } = await mountEditor({ kiosks: [{ id: "hall", hostname: "pi-hall" }] });
    expect(w.find(".pill__label").text()).toBe("Browsers & new screens");
    expect(w.find(".sre-orient-toggle").exists()).toBe(true);
    expect(w.find('[data-test="orientation-badge"]').exists()).toBe(false);
  });

  it("shows the orientation toggle for Any browser and the badge for a screen, never both", async () => {
    const { w } = await mountEditor({ kiosks: [{ id: "hall", hostname: "pi-hall" }] });
    expect(w.find(".sre-orient-toggle").exists()).toBe(true);
    expect(w.find('[data-test="orientation-badge"]').exists()).toBe(false);

    await selectPreview(w, "hall");
    expect(w.find(".sre-orient-toggle").exists()).toBe(false);
    expect(w.find('[data-test="orientation-badge"]').exists()).toBe(true);

    await selectPreview(w, "__global");
    expect(w.find(".sre-orient-toggle").exists()).toBe(true);
    expect(w.find('[data-test="orientation-badge"]').exists()).toBe(false);
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

  it("previews a portrait kiosk as portrait when it reports a landscape viewport", async () => {
    const { w } = await mountEditor({
      kiosks: [
        {
          id: "hall",
          hostname: "pi-hall",
          overrides: { orientation: "portrait" },
          viewport: { w: 1920, h: 1080 },
        },
      ],
    });
    await selectPreview(w, "hall");
    const { width, height } = deviceBox(w);
    expect(device(w).classes()).toContain("portrait");
    expect(height).toBeGreaterThan(width);
    expect(badge(w)).toBe("Portrait · 1920×1080");
  });

  it("previews a landscape kiosk as landscape when it reports a portrait viewport", async () => {
    const { w } = await mountEditor({
      kiosks: [
        {
          id: "hall",
          hostname: "pi-hall",
          overrides: { orientation: "landscape" },
          viewport: { w: 1080, h: 1920 },
        },
      ],
    });
    await selectPreview(w, "hall");
    const { width, height } = deviceBox(w);
    expect(device(w).classes()).toContain("landscape");
    expect(width).toBeGreaterThan(height);
    expect(badge(w)).toBe("Landscape · 1080×1920");
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
    // The toggle owns the Any-browser state; the badge is only for a screen.
    expect(w.find('[data-test="orientation-badge"]').exists()).toBe(false);
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
    const lines = w.findAll(".tabs__meta").map(n => n.text());
    expect(lines).toEqual(["Kitchen, Hallway · browsers", "Office · browsers"]);
  });

  it("says All screens when every screen shows the page", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-h", overrides: {} }],
    });
    expect(w.findAll(".tabs__meta").map(n => n.text())).toEqual(["All screens", "All screens"]);
  });

  it("says All screens when no screens are known", async () => {
    const { w } = await mountEditor({ kiosks: [] });
    expect(w.findAll(".tabs__meta").map(n => n.text())).toEqual(["All screens", "All screens"]);
  });

  it("says Not shown anywhere when neither a screen nor Default shows the page", async () => {
    const restricted = JSON.parse(JSON.stringify(config));
    restricted.availableScreens = [];
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", overrides: { availableScreens: [] } }],
      props: { config: restricted },
    });
    expect(w.findAll(".tabs__meta").map(n => n.text())).toEqual([
      "Not shown anywhere",
      "Not shown anywhere",
    ]);
  });

  it("dims the tabs a previewed screen does not show", async () => {
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", overrides: { displayName: "Hallway", availableScreens: ["photos"] } }],
    });
    await selectPreview(w, "hall");
    const tabs = w.findAll(".tabs__tab");
    expect(tabs[0].classes()).toContain("is-dimmed"); // Home
    expect(tabs[1].classes()).not.toContain("is-dimmed"); // Photos
  });

  it("dims a page Default hides when a screen follows Default", async () => {
    const restricted = JSON.parse(JSON.stringify(config));
    restricted.availableScreens = ["photos"];
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", overrides: { displayName: "Hallway" } }],
      props: { config: restricted },
    });
    await selectPreview(w, "hall");
    const tabs = w.findAll(".tabs__tab");
    expect(tabs[0].classes()).toContain("is-dimmed"); // Home
    expect(tabs[1].classes()).not.toContain("is-dimmed"); // Photos
  });

  it("says Not shown for a page Default hides, even when every screen follows Default", async () => {
    const restricted = JSON.parse(JSON.stringify(config));
    restricted.availableScreens = ["photos"];
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-h", overrides: {} }],
      props: { config: restricted },
    });
    expect(w.findAll(".tabs__meta").map(n => n.text())).toEqual([
      "Not shown anywhere",
      "All screens",
    ]);
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

  it("warns when a screen follows a restricted Default that does not show the page", async () => {
    const restricted = JSON.parse(JSON.stringify(config));
    restricted.availableScreens = ["photos"];
    const { w } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-hall", overrides: { displayName: "Hallway" } }],
      props: { config: restricted },
    });
    await selectPreview(w, "hall");
    expect(w.find('[data-test="mismatch"]').exists()).toBe(true);
    expect(w.find('[data-test="mismatch"]').text()).toContain("doesn’t show “Home”");
  });

  it("Show it on adds the page to Default's restricted list", async () => {
    const restricted = JSON.parse(JSON.stringify(config));
    restricted.availableScreens = ["photos"];
    const { w, store } = await mountEditor({
      kiosks: [{ id: "hall", hostname: "pi-hall", overrides: { displayName: "Hallway" } }],
      props: { config: restricted },
    });
    await selectPreview(w, "hall");
    await w.find(".sre-mismatch__btn").trigger("click");
    await flushPromises();
    expect(store.saveOverrides).toHaveBeenCalledWith("hall", {
      displayName: "Hallway",
      availableScreens: ["photos", "home"],
    });
    expect(w.find('[data-test="mismatch"]').exists()).toBe(false);
  });
});
