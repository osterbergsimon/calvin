import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ClockBarEditor from "@/components/settings/shared/ClockBarEditor.vue";
import { useWebServicesStore } from "@/stores/webServices";
import { useKiosksStore } from "@/stores/kiosks";
import {
  buildClockBarDesign,
  defaultClockBarDesign,
  resolveClockBarDesign,
} from "@/utils/clockBarDesign";

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const baseConfig = () => ({
  orientation: "landscape",
  clockBarMode: "horizontal",
  clockShowDate: false,
  clockShowSeconds: false,
  clockBarShowLogo: true,
  clockBarLayout: "single-line",
  clockBarVerticalLayout: "upright",
  clockBarDesign: null,
});

const services = () => [
  {
    id: "weather",
    name: "Weather",
    statusbar_schema: { kind: "status" },
    config: {},
  },
  {
    id: "recipes",
    name: "Recipes",
    statusbar_schema: { kind: "status" },
    config: { show_in_statusbar: false },
  },
];

const mountEditor = (config = baseConfig(), mountOptions = {}) => {
  const web = useWebServicesStore();
  web.services = services();
  web.fetchServices = vi.fn(async () => {});
  const kiosks = useKiosksStore();
  kiosks.loadKiosks = vi.fn(async () => {});
  return mount(ClockBarEditor, {
    ...mountOptions,
    props: { config, open: true },
    global: {
      stubs: {
        BarActionCluster: true,
        PluginStatusbarItems: {
          props: ["ids"],
          template: '<span class="statusbar-stub">{{ (ids || []).join(",") }}</span>',
        },
      },
    },
  });
};

const latestDesign = wrapper => {
  const emitted = wrapper.emitted("update:config");
  return emitted?.[emitted.length - 1]?.[0]?.clockBarDesign;
};

const select = async (wrapper, partId) => {
  await wrapper.find(`[data-part-id="${partId}"]`).trigger("click");
};

// The default design resolved against the sample services: a plugin that starts
// hidden stays hidden, and the tile placeholder covers the shown ones.
const defaultClockBarDesignWithServices = () =>
  buildClockBarDesign(
    resolveClockBarDesign({ clockBarDesign: defaultClockBarDesign() }, services())
  );

describe("ClockBarEditor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders the real bar in a sample page and the Not shown shelf", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    expect(wrapper.find(".clock-bar-horizontal").exists()).toBe(true);
    expect(wrapper.text()).toContain("Kitchen");
    expect(wrapper.text()).toContain("Not shown");
    // Date is hidden by default, so it waits on the shelf.
    expect(wrapper.find('[data-part-id="date"]').exists()).toBe(true);
    expect(wrapper.find('[data-part-id="status"]').exists()).toBe(true);
  });

  it("hides a part by dragging it to the shelf's Show toggle", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await select(wrapper, "logo");
    await wrapper.find('[aria-label="Show Calvin logo"]').trigger("click");
    await flushPromises();

    const design = latestDesign(wrapper);
    expect(design.horizontal.hidden).toContain("logo");
    expect(design.horizontal.zones.left).not.toContain("logo");
  });

  it("moves a part with the non-drag Order buttons", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await select(wrapper, "time");
    await wrapper.find('[aria-label="Move Time later"]').trigger("click");
    await flushPromises();

    const design = latestDesign(wrapper);
    expect(design.horizontal.zones.center).not.toContain("time");
    expect(design.horizontal.zones.right).toContain("time");
  });

  it("writes Time › Show seconds live", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await select(wrapper, "time");
    await wrapper.find('[aria-label="Show seconds"]').trigger("click");
    await flushPromises();

    expect(latestDesign(wrapper).horizontal.parts.time.seconds).toBe(true);
  });

  it("never offers to hide Status & menu", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await select(wrapper, "status");
    expect(wrapper.find('[aria-label="Show Status & menu"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Always shown");
  });

  it("disables Under the time while Date is away from Time", async () => {
    const config = {
      ...baseConfig(),
      clockBarDesign: {
        version: 1,
        horizontal: {
          zones: { left: ["logo", "date"], center: ["time"], right: ["tiles", "status"] },
          hidden: [],
          parts: { date: { underTime: true } },
          barHeight: "normal",
          tileSize: "m",
        },
      },
    };
    const wrapper = mountEditor(config);
    await flushPromises();

    await select(wrapper, "date");
    const toggle = wrapper.find('[aria-label="Under the time"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Put Date right after Time");
  });

  it("shows a custom px size with a reset to the nearest step", async () => {
    const config = {
      ...baseConfig(),
      clockBarDesign: {
        version: 1,
        horizontal: {
          zones: { left: ["logo"], center: ["time"], right: ["tiles", "status"] },
          hidden: ["date"],
          parts: { time: { size: 21 } },
          barHeight: "normal",
          tileSize: "m",
        },
      },
    };
    const wrapper = mountEditor(config);
    await flushPromises();

    await select(wrapper, "time");
    expect(wrapper.text()).toContain("Custom (21 px)");
    await wrapper.find("button:not([disabled])").exists();
    expect(wrapper.text()).toContain("Use L");
  });

  it("toggles a plugin tile from the design instead of show_in_statusbar", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    // The hidden tile sits on the shelf and can be shown.
    await select(wrapper, "tile:recipes");
    await wrapper.find('[aria-label="Show Recipes"]').trigger("click");
    await flushPromises();

    const design = latestDesign(wrapper);
    expect(design.horizontal.hidden).not.toContain("tile:recipes");
    expect(design.horizontal.zones.right).toContain("tile:recipes");
  });

  it("resets to the default design and can undo it", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    await select(wrapper, "logo");
    await wrapper.find('[aria-label="Show Calvin logo"]').trigger("click");
    await flushPromises();

    await wrapper.find('[data-test="clock-bar-reset"]').trigger("click");
    await wrapper.find('[data-test="confirm-accept"]').trigger("click");
    await flushPromises();

    expect(latestDesign(wrapper)).toEqual(defaultClockBarDesignWithServices());
    await wrapper.find('[data-test="clock-bar-undo"]').trigger("click");
    await flushPromises();
    expect(latestDesign(wrapper).horizontal.hidden).toContain("logo");
  });

  it("switches to the side bar design", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    const sideButton = wrapper
      .findAll('[role="radio"]')
      .find(button => button.text() === "Side bar");
    await sideButton.trigger("click");
    await flushPromises();

    expect(wrapper.find(".clock-bar-vertical").exists()).toBe(true);
    expect(wrapper.text()).toContain("Top");
    expect(wrapper.text()).toContain("Bottom");
  });

  describe("keyboard moves (items 10 and 13)", () => {
    const chip = (wrapper, id) => wrapper.find(`[data-part-id="${id}"]`);

    it("keeps focus on the chip across two consecutive arrow moves", async () => {
      const wrapper = mountEditor(baseConfig(), { attachTo: document.body });
      await flushPromises();

      chip(wrapper, "logo").element.focus();
      await chip(wrapper, "logo").trigger("keydown.right");
      await flushPromises();
      expect(document.activeElement?.dataset?.partId).toBe("logo");
      expect(latestDesign(wrapper).horizontal.zones.left.slice(0, 2)).toEqual(["room", "logo"]);

      await chip(wrapper, "logo").trigger("keydown.right");
      await flushPromises();
      expect(document.activeElement?.dataset?.partId).toBe("logo");
      expect(latestDesign(wrapper).horizontal.zones.left).toEqual(["room", "pageDots", "logo"]);
      wrapper.unmount();
    });

    it("announces a move to assistive tech", async () => {
      const wrapper = mountEditor();
      await flushPromises();

      await chip(wrapper, "logo").trigger("keydown.right");
      await flushPromises();

      const live = wrapper.find('[data-test="clock-bar-announcer"]');
      expect(live.attributes("aria-live")).toBe("polite");
      expect(live.text()).toBe("Calvin logo moved to Left, 2 of 3.");
    });

    it("cancels a pending drag on pointercancel instead of dropping", async () => {
      const wrapper = mountEditor(baseConfig(), { attachTo: document.body });
      await flushPromises();
      const before = wrapper.emitted("update:config")?.length || 0;
      const target = chip(wrapper, "logo");
      const spot = document.elementFromPoint;
      document.elementFromPoint = () => wrapper.find('[data-drop-zone="right"]').element;

      await target.trigger("pointerdown", { button: 0, clientX: 5, clientY: 5 });
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 80, clientY: 40 }));
      window.dispatchEvent(new Event("pointercancel"));
      await flushPromises();

      document.elementFromPoint = spot;
      expect(wrapper.emitted("update:config")?.length || 0).toBe(before);
      wrapper.unmount();
    });

    it("drops on pointerup", async () => {
      const wrapper = mountEditor(baseConfig(), { attachTo: document.body });
      await flushPromises();
      const spot = document.elementFromPoint;
      document.elementFromPoint = () => wrapper.find('[data-drop-zone="right"]').element;

      await chip(wrapper, "logo").trigger("pointerdown", { button: 0, clientX: 5, clientY: 5 });
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 80, clientY: 40 }));
      window.dispatchEvent(new Event("pointerup"));
      await flushPromises();

      document.elementFromPoint = spot;
      expect(latestDesign(wrapper).horizontal.zones.right).toContain("logo");
      wrapper.unmount();
    });
  });
});
