import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ThemeSelector from "@/components/settings/specialized/ThemeSelector.vue";

const THEMES = [
  { id: "calvin", name: "Calvin", is_builtin: true, selectable: true },
  {
    id: "ocean",
    name: "Ocean",
    is_builtin: true,
    selectable: true,
    variables: { "bg-0": "#d9ecf3", "bg-1": "#e8f4f8", "bg-2": "#f5fbfd", line: "#b8d9e5" },
    dark_mode: { "bg-0": "#07171f", "bg-1": "#0b1f29", "bg-2": "#102b38", line: "#235064" },
  },
  {
    id: "midnight",
    name: "Midnight",
    selectable: false,
    validation_errors: ["missing bg-2 in dark mode"],
    variables: { "bg-0": "#111" },
  },
  {
    id: "huey",
    name: "Huey",
    selectable: true,
    validation_warnings: ["Status colours may be hard to tell apart in this theme."],
    variables: { "bg-0": "#222" },
  },
];

const mountSelector = (props = {}) => mount(ThemeSelector, { props: { themes: THEMES, ...props } });

describe("ThemeSelector", () => {
  it("lists Calvin plus every installed theme, with a Light and dark caption", () => {
    const w = mountSelector();
    const names = w.findAll(".theme-selection-info strong").map(node => node.text());
    expect(names).toEqual(["Calvin", "Ocean", "Midnight", "Huey"]);
    expect(w.findAll(".theme-selection-mode").every(node => node.text() === "Light and dark")).toBe(
      true
    );
  });

  it("shows the preview in the mode the picker passed", () => {
    const light = mountSelector({ dark: false });
    const dark = mountSelector({ dark: true });

    // row 0 is Calvin; row 1 is Ocean.
    expect(light.findAll(".theme-preview-mini")[0].element.style.backgroundColor).toBe(
      "rgb(238, 241, 244)"
    );
    expect(dark.findAll(".theme-preview-mini")[0].element.style.backgroundColor).toBe(
      "rgb(14, 19, 22)"
    );
    expect(light.findAll(".theme-preview-mini")[1].element.style.backgroundColor).toBe(
      "rgb(217, 236, 243)"
    );
    expect(dark.findAll(".theme-preview-mini")[1].element.style.backgroundColor).toBe(
      "rgb(7, 23, 31)"
    );
  });

  it("renders page, panel, button and tag in the preview", () => {
    const w = mountSelector();
    const row = w.findAll(".theme-selection-item")[1];
    expect(row.find(".mini-panel").exists()).toBe(true);
    expect(row.find(".mini-primary").exists()).toBe(true);
    expect(row.find(".mini-tag").exists()).toBe(true);
  });

  it("disables a theme that needs an update and does not emit it", async () => {
    const w = mountSelector();
    const broken = w.findAll(".theme-selection-item")[2];
    expect(broken.classes()).toContain("disabled");
    expect(broken.text()).toContain("Needs an update to work with this Calvin.");
    await broken.trigger("click");
    expect(w.emitted("select")).toBeUndefined();
  });

  it("shows the hue warning but still allows selecting", async () => {
    const w = mountSelector();
    const huey = w.findAll(".theme-selection-item")[3];
    expect(huey.text()).toContain("Status colours may be hard to tell apart in this theme.");
    await huey.trigger("click");
    expect(w.emitted("select")[0]).toEqual(["huey"]);
  });

  it("selects the active row only", () => {
    const w = mountSelector({ selectedThemeId: "ocean" });
    expect(w.findAll(".theme-selection-item")[1].classes()).toContain("active");
  });
});
