/**
 * Narrow-layout regressions (CLV-91 / CLV-93).
 *
 * jsdom cannot evaluate media queries or lay out flex rows, so these tests pin
 * the rules that do the work: the phone clock bar drops its screen dots, a
 * narrow calendar header wraps so the month title survives and every control
 * stays visible, and the phone Settings top bar shows only the save dot.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

vi.mock("vue-router", () => ({
  useRoute: () => ({ path: "/" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction: vi.fn() }),
}));
const touch = { isTouch: ref(false), hasPointer: ref(true) };
vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => touch,
}));

import CalendarView from "@/components/CalendarView.vue";
import { useCalendarStore } from "@/stores/calendar";

const SRC = resolve(__dirname, "../../../src");
const read = path => readFileSync(resolve(SRC, path), "utf8");

const styleOf = file => {
  const match = read(file).match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return match ? match[1].replace(/\/\*[\s\S]*?\*\//g, "") : "";
};

/** Every declaration body for a rule whose selector is exactly `selector`. */
const rules = (css, selector) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1].trim() === selector)
    .map(match => match[2]);

/** The declarations of a single rule (all matching rules joined), or "". */
const rule = (css, selector) => rules(css, selector).join("\n");

/** The body of one @media block, or "" when it does not exist. */
const mediaBlock = (css, query) => {
  const start = css.indexOf(`@media ${query}`);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
};

describe("clock bar at phone width", () => {
  const css = styleOf("components/ClockBarHorizontal.vue");
  const phone = mediaBlock(css, "(--bp-phone)");

  it("uses the doctrine's phone breakpoint", () => {
    expect(phone).not.toBe("");
  });

  it("never lets the side groups squeeze the centred clock", () => {
    expect(rule(css, ".clock-bar-content")).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it("hides the screen dots so they cannot run under the time", () => {
    expect(rule(phone, ".clock-bar-horizontal .screen-dots")).toMatch(/display:\s*none/);
  });
});

describe("calendar header in a narrow region", () => {
  const css = styleOf("components/CalendarView.vue");

  it("wraps the header instead of clipping the controls at the right edge", () => {
    const header = rule(css, ".calendar-header");
    expect(header).toMatch(/flex-wrap:\s*wrap/);
  });

  it("grows the header to the height of its wrapped rows instead of clipping them", () => {
    const header = rule(css, ".calendar-header");
    expect(header).toMatch(/height:\s*auto/);
    expect(header).toMatch(/overflow:\s*visible/);
  });

  it("keeps the month title on the first line and truncates it", () => {
    const label = rule(css, ".calendar-header__label");
    expect(label).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(label).toMatch(/min-width:\s*0/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
  });

  it("wraps the controls and right-aligns them when they move to their own row", () => {
    const controls = rule(css, ".calendar-header__controls");
    expect(controls).toMatch(/flex-wrap:\s*wrap/);
    expect(controls).toMatch(/margin-left:\s*auto/);
  });

  it("lets the controls shrink onto their own row instead of overflowing it", () => {
    const controls = rule(css, ".calendar-header__controls");
    // A max-content row that refuses to shrink is what pushed the last button
    // past the region edge, where the panel's overflow:hidden hid it.
    expect(controls).not.toMatch(/flex-shrink:\s*0/);
    expect(controls).toMatch(/flex:\s*0\s+1\s+auto/);
  });

  describe("at 390px", () => {
    let wrapper;

    afterEach(() => {
      wrapper?.unmount();
      wrapper = null;
      document.body.innerHTML = "";
    });

    it("renders every header control, none hidden", () => {
      setActivePinia(createPinia());
      const cal = useCalendarStore();
      cal.fetchSources = vi.fn().mockResolvedValue();
      cal.fetchEvents = vi.fn().mockResolvedValue();
      // Move off the current period so the conditional "Today" jump shows too.
      cal.currentDate = new Date(2027, 0, 15);
      touch.hasPointer.value = true;

      const host = document.createElement("div");
      host.style.width = "390px";
      document.body.appendChild(host);

      wrapper = mount(CalendarView, {
        attachTo: host,
        props: { view: { mode: "month" }, regionId: "r1", focused: true },
        global: {
          stubs: {
            DashboardPanel: {
              name: "DashboardPanel",
              props: ["title", "focused", "dim", "headerVisible", "showTitle"],
              template: "<section><slot name='actions' /><slot /></section>",
            },
            EventDetailPanel: true,
            DialogScrim: true,
            CalendarEventItem: true,
            CalendarViewOptions: {
              name: "CalendarViewOptions",
              template:
                "<button class='region-view-options__trigger' aria-label='Calendar view options' />",
            },
          },
        },
      });

      expect(wrapper.get(".calendar-header__label").text()).not.toBe("");

      const controls = {
        Today: ".calendar-header__today",
        Previous: '.calendar-header__controls [aria-label="Previous"]',
        "view switch": ".calendar-header__view-switch",
        Next: '.calendar-header__controls [aria-label="Next"]',
        options: '.calendar-header__controls [aria-label="Calendar view options"]',
        fullscreen: ".calendar-header__fullscreen",
      };

      for (const [name, selector] of Object.entries(controls)) {
        const control = wrapper.find(selector);
        expect(control.exists(), `${name} control should be rendered`).toBe(true);
        expect(control.isVisible(), `${name} control should be visible`).toBe(true);
        const accessible =
          control.attributes("aria-label") || control.attributes("title") || control.text();
        expect(accessible, `${name} control needs an accessible name`).toBeTruthy();
      }
    });
  });
});

describe("settings top bar at phone width", () => {
  const css = styleOf("components/settings/shell/SettingsTopBar.vue");
  const phone = mediaBlock(css, "(--bp-phone)");

  it("uses the doctrine's phone breakpoint", () => {
    expect(phone).not.toBe("");
  });

  it("shows the save state as the dot only", () => {
    expect(rule(phone, ".settings-topbar__pill-label")).toMatch(/display:\s*none/);
  });
});
