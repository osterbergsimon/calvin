/**
 * The live bar (not the editor) after the clock bar design landed
 * (calvin-d7cl review): the part markup must keep its styling, single pinned
 * tiles must render, services must load at bar mount and the side bar's
 * compact date must keep its look.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextTick, ref } from "vue";
import ClockBarHorizontal from "@/components/ClockBarHorizontal.vue";
import ClockBarVertical from "@/components/ClockBarVertical.vue";
import { useConfigStore } from "@/stores/config";
import { useWebServicesStore } from "@/stores/webServices";
import { resolveClockBarDesign } from "@/utils/clockBarDesign";

vi.mock("@/composables/useSchemaData", () => ({
  useSchemaData: () => ({ data: ref(null) }),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

const src = name => readFileSync(resolve(__dirname, "../../../src/components", name), "utf8");
const styleOf = text => text.slice(text.indexOf("<style"));

const tile = (id, extra = {}) => ({
  id,
  name: id,
  statusbar_schema: { kind: "status" },
  config: {},
  ...extra,
});

const settle = async () => {
  await nextTick();
  await vi.dynamicImportSettled();
  await flushPromises();
  await nextTick();
};

const barProps = { showInNonKiosk: true, showInKiosk: false, enabled: true };
const stubs = { BarActionCluster: true };

describe("live bar part styling (item 1)", () => {
  it("keeps the time, date, room and stacked-digit faces in ClockBarPart", () => {
    const part = styleOf(src("ClockBarPart.vue"));
    for (const selector of [
      ".clock-time",
      ".clock-date",
      ".clock-bar-room",
      ".compact-time",
      ".compact-period",
      ".compact-date-stacked",
      ".compact-date-year",
    ]) {
      expect(part, selector).toContain(`${selector} {`);
    }
  });

  it("leaves no orphaned part faces in the bar components", () => {
    for (const file of ["ClockBarHorizontal.vue", "ClockBarVertical.vue"]) {
      const style = styleOf(src(file));
      expect(style, file).not.toMatch(/^\.clock-time \{/m);
      expect(style, file).not.toMatch(/^\.clock-date \{/m);
      expect(style, file).not.toMatch(/^\.clock-bar-room \{/m);
      expect(style, file).not.toMatch(/^\.compact-/m);
    }
  });
});

describe("live bar tiles and services", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useConfigStore().showUI = true;
  });

  it("renders a single pinned tile chip with its instance id (item 2)", async () => {
    const services = useWebServicesStore();
    services.services = [tile("a"), tile("b")];
    vi.spyOn(services, "fetchServices").mockResolvedValue();
    const design = resolveClockBarDesign(
      {
        clockBarDesign: {
          version: 1,
          horizontal: {
            zones: { left: ["tile:a"], center: ["time"], right: ["tile:b", "status"] },
            hidden: [],
          },
        },
      },
      services.services
    ).horizontal;
    const wrapper = mount(ClockBarHorizontal, {
      props: { position: "top", ...barProps, design, sample: true, editable: true },
      global: { stubs },
    });
    await settle();
    for (const id of ["tile:a", "tile:b"]) {
      const chip = wrapper.find(`[data-part-id="${id}"]`);
      expect(chip.find(".schema-renderer__body").exists(), id).toBe(true);
    }
    wrapper.unmount();
  });

  it.each([
    ["horizontal", ClockBarHorizontal, "top"],
    ["vertical", ClockBarVertical, "left"],
  ])("fetches services once at %s bar mount and shows the tile (item 3)", async (_n, C, pos) => {
    const services = useWebServicesStore();
    const fetchServices = vi.spyOn(services, "fetchServices").mockImplementation(async () => {
      services.services = [tile("weather")];
    });
    const wrapper = mount(C, { props: { position: pos, ...barProps }, global: { stubs } });
    await settle();
    expect(fetchServices).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".plugin-statusbar-items").exists()).toBe(true);
    wrapper.unmount();
  });

  it("does not refetch when services are already loaded", async () => {
    const services = useWebServicesStore();
    services.services = [tile("weather")];
    const fetchServices = vi.spyOn(services, "fetchServices").mockResolvedValue();
    const wrapper = mount(ClockBarHorizontal, {
      props: { position: "top", ...barProps },
      global: { stubs },
    });
    await settle();
    expect(fetchServices).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("side bar compact date (item 5)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useConfigStore().showUI = true;
  });

  it("draws a non-stacked date under a stacked time with the compact-date look", () => {
    const config = useConfigStore();
    config.clockShowDate = true;
    config.clockBarVerticalLayout = "compact-time";
    const wrapper = mount(ClockBarVertical, {
      props: { position: "left", ...barProps },
      global: { stubs },
    });
    const date = wrapper.find(".clock-date");
    expect(date.classes()).toContain("compact-date");
    expect(date.classes()).not.toContain("compact-date-stacked");
  });

  it("marks the stacked date with both classes, as before", () => {
    const config = useConfigStore();
    config.clockShowDate = true;
    config.clockBarVerticalLayout = "compact-time-date";
    const wrapper = mount(ClockBarVertical, {
      props: { position: "left", ...barProps },
      global: { stubs },
    });
    const date = wrapper.find(".clock-date");
    expect(date.classes()).toEqual(
      expect.arrayContaining(["compact-date", "compact-date-stacked"])
    );
  });

  it("leaves a date under an upright time unmarked", () => {
    const config = useConfigStore();
    config.clockShowDate = true;
    const wrapper = mount(ClockBarVertical, {
      props: { position: "left", ...barProps },
      global: { stubs },
    });
    expect(wrapper.find(".clock-date").classes()).not.toContain("compact-date");
  });
});
