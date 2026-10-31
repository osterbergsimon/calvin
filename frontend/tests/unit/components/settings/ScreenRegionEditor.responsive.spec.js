import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, enableAutoUnmount } from "@vue/test-utils";
import ScreenRegionEditor from "@/components/settings/shared/ScreenRegionEditor.vue";

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

enableAutoUnmount(afterEach);

/* --- host fakes: ResizeObserver + matchMedia ------------------------------ */
const observers = [];

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.elements = [];
    observers.push(this);
  }
  observe(el) {
    this.elements.push(el);
  }
  unobserve(el) {
    this.elements = this.elements.filter(candidate => candidate !== el);
  }
  disconnect() {
    this.elements = [];
  }
}

const setMedia = ({ coarse = false, reduce = false } = {}) => {
  window.matchMedia = vi.fn(query => ({
    matches: query.includes("coarse") ? coarse : query.includes("reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

beforeEach(() => {
  observers.length = 0;
  global.ResizeObserver = FakeResizeObserver;
  setMedia();
});

afterEach(() => {
  delete global.ResizeObserver;
  setMedia();
});

/* --- fixtures ------------------------------------------------------------- */
const baseConfig = () => ({
  orientation: "landscape",
  clockBarEnabled: true,
  clockBarPosition: "top",
  dashboardScreens: {
    activeScreenId: "home",
    screens: [
      {
        id: "home",
        name: "Home",
        layout: {
          preset: "split_two",
          direction: "row",
          regions: [
            { id: "r1", kind: "calendar", size: 50 },
            { id: "r2", kind: "service", size: 50 },
          ],
        },
      },
    ],
  },
});

const mountEditor = async (props = {}) => {
  const w = mount(ScreenRegionEditor, {
    props: { config: baseConfig(), open: true, ...props },
    global: { stubs: { teleport: true } },
  });
  await flushPromises();
  return w;
};

const resize = async (w, selector, width, height) => {
  // The teleport stub can replace its children on re-render, so match the
  // observer by the element's selector rather than node identity.
  const observer = [...observers]
    .reverse()
    .find(candidate => candidate.elements.some(node => node.matches?.(selector)));
  if (!observer) throw new Error(`no ResizeObserver watching ${selector}`);
  observer.callback([
    {
      target: observer.elements[0],
      contentRect: { width, height, top: 0, left: 0, right: width, bottom: height },
    },
  ]);
  await w.vm.$nextTick();
};

const classes = w => w.find(".sre-root").classes();

const deviceBox = w => {
  const style = w.find(".sre-device").element.style;
  return { width: parseFloat(style.width), height: parseFloat(style.height) };
};

/* --- §1 size classes ------------------------------------------------------ */
describe("ScreenRegionEditor size classes", () => {
  it("derives Wide / Compact / Phone from the measured modal", async () => {
    const w = await mountEditor();
    expect(classes(w)).toContain("size-wide");

    await resize(w, ".sre-modal", 1280, 720);
    expect(classes(w)).toContain("size-wide");

    await resize(w, ".sre-modal", 800, 480);
    expect(classes(w)).toContain("size-compact");

    await resize(w, ".sre-modal", 390, 844);
    expect(classes(w)).toContain("size-phone");
  });

  it("moves a kiosk from Wide to Compact when the OSK shrinks the modal", async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 1280, 720);
    expect(classes(w)).toContain("size-wide");

    // The on-screen keyboard eats the bottom of the screen.
    await resize(w, ".sre-modal", 1280, 430);
    expect(classes(w)).toContain("size-compact");
  });

  it("is applied above the on-screen keyboard", async () => {
    const w = await mountEditor();
    expect(classes(w)).toContain("dialog-above-osk");
  });

  it("moves the orientation badge under the device in Compact", async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 800, 480);
    const caption = w.find('[data-test="orientation-caption"]');
    expect(caption.exists()).toBe(true);
    // Any browser owns its orientation through the toggle, so the caption
    // carries the value where the badge would otherwise sit.
    expect(caption.text()).toBe("Landscape");
    expect(w.find('[data-test="orientation-badge"]').exists()).toBe(false);
  });
});

/* --- §2 the device fits the stage ----------------------------------------- */
describe("ScreenRegionEditor device fit", () => {
  it.each([
    { name: "phone", modal: [390, 844], stage: [390, 600] },
    { name: "small kiosk", modal: [800, 480], stage: [800, 420] },
    { name: "wide", modal: [1280, 720], stage: [1280, 700] },
  ])("keeps the aspect ratio and stays in the stage at $name", async ({ modal, stage }) => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", ...modal);
    await resize(w, ".sre-stage", ...stage);

    const { width, height } = deviceBox(w);
    expect(width / height).toBeCloseTo(16 / 9, 1);
    expect(width).toBeLessThanOrEqual(stage[0]);
    expect(height).toBeLessThanOrEqual(stage[1]);
  });

  it("stops shrinking at 200px on the long side", async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 300, 844);
    await resize(w, ".sre-stage", 300, 160);
    const { width, height } = deviceBox(w);
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(200);
  });

  it("shrinks region labels and drops the icon and size badge under 320px", async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 390, 844);
    await resize(w, ".sre-stage", 300, 600);
    expect(w.find(".sre-device").classes()).toContain("is-narrow");
    expect(w.findAll(".sre-region-name").length).toBeGreaterThan(0);
    expect(w.findAll(".sre-region-icon")).toHaveLength(0);
    expect(w.findAll(".sre-region-size")).toHaveLength(0);
  });

  it("keeps the region icon and size badge when the device has room", async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 1280, 720);
    await resize(w, ".sre-stage", 1280, 700);
    expect(w.find(".sre-device").classes()).not.toContain("is-narrow");
    expect(w.findAll(".sre-region-icon").length).toBeGreaterThan(0);
    expect(w.findAll(".sre-region-size").length).toBeGreaterThan(0);
  });

  it("hides the icon and % badge when the open phone sheet leaves a narrow device", async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 390, 844);
    // The stage left above an open 65% inspector sheet.
    await resize(w, ".sre-stage", 390, 204);
    expect(w.find(".sre-device").classes()).toContain("is-narrow");
    expect(w.findAll(".sre-region-icon")).toHaveLength(0);
    expect(w.findAll(".sre-region-size")).toHaveLength(0);
  });
});

/* --- §3 the phone sheet --------------------------------------------------- */
describe("ScreenRegionEditor phone inspector sheet", () => {
  const phone = async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 390, 844);
    return w;
  };

  it("peeks with the current selection and is a labelled region", async () => {
    const w = await phone();
    const rail = w.find(".sre-rail");
    expect(rail.attributes("role")).toBe("region");
    expect(rail.attributes("aria-label")).toBe("Inspector");
    expect(w.find('[data-test="sheet-selection"]').text()).toBe("Page · Home");
  });

  it("opens when a region is selected and names it in the peek", async () => {
    const w = await phone();
    expect(w.find(".sre-rail").classes()).not.toContain("is-open");

    await w.find(".sre-region").trigger("click");

    expect(w.find(".sre-rail").classes()).toContain("is-open");
    expect(w.find('[data-test="sheet-selection"]').text()).toBe("Region · Calendar");
  });

  it("the chevron toggles the sheet and is labelled for the action", async () => {
    const w = await phone();
    const chevron = w.find('[data-test="sheet-chevron"]');
    expect(chevron.attributes("aria-label")).toBe("Show settings");
    expect(chevron.attributes("aria-expanded")).toBe("false");

    await chevron.trigger("click");
    expect(w.find(".sre-rail").classes()).toContain("is-open");
    expect(w.find('[data-test="sheet-chevron"]').attributes("aria-label")).toBe("Hide settings");
    expect(w.find('[data-test="sheet-chevron"]').attributes("aria-expanded")).toBe("true");

    await w.find('[data-test="sheet-chevron"]').trigger("click");
    expect(w.find(".sre-rail").classes()).not.toContain("is-open");
  });

  it("tapping the stage's empty area closes it", async () => {
    const w = await phone();
    await w.find(".sre-region").trigger("click");
    expect(w.find(".sre-rail").classes()).toContain("is-open");

    await w.find(".sre-stage").trigger("click");
    expect(w.find(".sre-rail").classes()).not.toContain("is-open");
  });

  it("dragging the handle down closes it", async () => {
    const w = await phone();
    await w.find('[data-test="sheet-chevron"]').trigger("click");
    expect(w.find(".sre-rail").classes()).toContain("is-open");

    await w.find('[data-test="sheet-handle"]').trigger("pointerdown", { clientY: 100 });
    window.dispatchEvent(new MouseEvent("pointermove", { clientY: 200 }));
    await w.vm.$nextTick();

    expect(w.find(".sre-rail").classes()).not.toContain("is-open");
  });

  it("drops the slide transition under reduced motion", async () => {
    setMedia({ reduce: true });
    const w = await phone();
    expect(w.find(".sre-rail").classes()).toContain("no-motion");
  });
});

/* --- §4 touch ------------------------------------------------------------- */
describe("ScreenRegionEditor touch behaviour", () => {
  it("grows the divider hit area to 28px on a coarse pointer", async () => {
    setMedia({ coarse: true });
    const w = await mountEditor();
    const resizer = w.find(".sre-resizer");
    expect(resizer.attributes("style")).toContain("0 0 28px");
  });

  it("keeps the 6px divider on a fine pointer", async () => {
    const w = await mountEditor();
    expect(w.find(".sre-resizer").attributes("style") || "").not.toContain("28px");
  });

  it("makes the clock bar tappable instead of draggable on a coarse pointer", async () => {
    setMedia({ coarse: true });
    const w = await mountEditor();
    const bar = w.find(".sre-clockbar");
    expect(bar.attributes("draggable")).toBe("false");
    expect(bar.attributes("title")).toBe("Tap to change the clock bar");
    expect(w.find(".sre-clock-grip").exists()).toBe(false);

    await bar.trigger("dragstart");
    expect(w.findAll(".sre-drop").length).toBe(0);
  });

  it("keeps the clock grip when the bar is draggable", async () => {
    const w = await mountEditor();
    expect(w.find(".sre-clockbar").attributes("draggable")).toBe("true");
    expect(w.find(".sre-clock-grip").exists()).toBe(true);
  });

  it("is not draggable in Compact either", async () => {
    const w = await mountEditor();
    await resize(w, ".sre-modal", 800, 480);
    expect(w.find(".sre-clockbar").attributes("draggable")).toBe("false");
    expect(w.find(".sre-clock-grip").exists()).toBe(false);
  });

  it("a tap selects the clock bar and Position moves it", async () => {
    setMedia({ coarse: true });
    const w = await mountEditor();
    await w.find(".sre-region").trigger("click"); // region settings first
    expect(w.find('[aria-label="Page name"]').exists()).toBe(false);

    await w.find(".sre-clockbar").trigger("click");

    // Page settings are shown, where the clock bar's Position lives.
    expect(w.find('[aria-label="Page name"]').exists()).toBe(true);
    const position = w.find('[aria-label^="Clock bar position"]');
    expect(position.exists()).toBe(true);
    await position.trigger("click");
    const bottom = w.findAll(".pill__opt").find(option => option.text() === "Bottom");
    await bottom.trigger("click");

    const emitted = w.emitted("update:config");
    expect(emitted).toBeTruthy();
    const next = emitted.at(-1)[0];
    expect(next.dashboardScreens.screens[0].clockBar.position).toBe("bottom");
  });

  it("names the clock bar in the phone peek", async () => {
    setMedia({ coarse: true });
    const w = await mountEditor();
    await resize(w, ".sre-modal", 390, 844);
    await w.find(".sre-clockbar").trigger("click");
    expect(w.find('[data-test="sheet-selection"]').text()).toBe("Clock bar");
    expect(w.find(".sre-rail").classes()).toContain("is-open");
  });
});
