/**
 * The shared dashboard region-header control rail (calvin-8nad).
 *
 * Every dashboard region header (calendar, photos, services) wraps its controls
 * in this component so one Dashboard size setting moves them together: the rail
 * height follows regionChromeVars(touchControlSize), a coarse pointer raises it
 * to the touch target, and the ui/ controls read their geometry from the custom
 * properties set here.
 */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RegionHeaderControls from "@/components/dashboard/RegionHeaderControls.vue";
import { useConfigStore } from "@/stores/config";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/dashboard/RegionHeaderControls.vue"),
  "utf8"
);
const STYLE = SOURCE.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];

function mountAt(size) {
  setActivePinia(createPinia());
  useConfigStore().touchControlSize = size;
  return mount(RegionHeaderControls, {
    slots: { default: "<button class='probe'>x</button>" },
  });
}

const styleVar = (w, name) => w.element.style.getPropertyValue(name);

describe("RegionHeaderControls", () => {
  it("follows Dashboard size xsmall vs xlarge", () => {
    const small = mountAt("xsmall");
    const large = mountAt("xlarge");

    expect(styleVar(small, "--region-rail-h")).toBe("22px");
    expect(styleVar(large, "--region-rail-h")).toBe("40px");
    expect(styleVar(small, "--region-glyph-fs")).toBe("0.8rem");
    expect(styleVar(large, "--region-glyph-fs")).toBe("1.25rem");
    // The icon box references the rail, so the coarse-pointer minimum applies.
    expect(styleVar(small, "--icon-size")).toBe("var(--region-control-h)");
  });

  it("maps one height, radius and type size onto every ui control", () => {
    for (const declaration of [
      "--btn-height: var(--region-control-h)",
      "--btn-font: var(--region-control-fs)",
      "--seg-height: var(--region-control-h)",
      "--seg-font: var(--region-control-fs)",
      "--seg-radius: var(--region-control-radius)",
      "--pill-height: var(--region-control-h)",
      "--pill-font: var(--region-control-fs)",
      "--pill-radius: var(--region-control-radius)",
    ]) {
      expect(STYLE).toContain(declaration);
    }
    expect(STYLE).toMatch(/--region-control-h:\s*var\(--region-rail-h, var\(--control-height\)\)/);
  });

  it("wraps into centred rows and raises the rail to the touch target on coarse pointers", () => {
    expect(STYLE).toMatch(/flex-wrap:\s*wrap/);
    expect(STYLE).toMatch(/justify-content:\s*center/);
    expect(STYLE).toMatch(/gap:\s*var\(--gap-1\)/);
    const coarse = STYLE.slice(STYLE.indexOf("@media (any-pointer: coarse)"));
    expect(coarse).toMatch(
      /--region-control-h:\s*max\(var\(--region-rail-h, var\(--control-height\)\), var\(--touch-target\)\)/
    );
  });

  it("renders its slot inside the rail", () => {
    const w = mountAt("medium");
    expect(w.find(".region-header-controls .probe").exists()).toBe(true);
  });
});
