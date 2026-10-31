import { describe, it, expect } from "vitest";
import builtinThemes from "../../../../backend/data/themes/builtin.json";
import { GALLERY_MODE_OPTIONS, GALLERY_THEME_OPTIONS, galleryTheme } from "@/dev/galleryThemes.js";

describe("gallery themes", () => {
  it("offers Calvin, Ocean, Forest and Sunset in light and dark", () => {
    expect(GALLERY_THEME_OPTIONS.map(option => option.label)).toEqual([
      "Calvin",
      "Ocean",
      "Forest",
      "Sunset",
    ]);
    expect(GALLERY_MODE_OPTIONS.map(option => option.value)).toEqual(["light", "dark"]);
  });

  it("leaves Calvin to theme.css", () => {
    expect(galleryTheme("calvin", "light")).toEqual({ dark: false, vars: {} });
    expect(galleryTheme("calvin", "dark")).toEqual({ dark: true, vars: {} });
  });

  it.each(["ocean", "forest", "sunset"])("maps %s light and dark palettes", name => {
    const light = galleryTheme(name, "light");
    const dark = galleryTheme(name, "dark");
    const theme = builtinThemes[name];

    expect(light.dark).toBe(false);
    expect(dark.dark).toBe(true);
    expect(light.vars["--bg-0"]).toBe(theme.variables["bg-0"]);
    expect(dark.vars["--bg-0"]).toBe(theme.dark_mode["bg-0"]);
    expect(light.vars["--ink"]).toBe(theme.variables.ink);
    expect(dark.vars["--ink"]).toBe(theme.dark_mode.ink);
  });

  it("derives the tokens a palette on a descendant would otherwise miss", () => {
    const { vars } = galleryTheme("ocean", "light");
    expect(vars["--focus-glow"]).toBe("color-mix(in srgb, #027cbe 36%, transparent)");
    expect(vars["--focus-edge"]).toBe("color-mix(in srgb, #027cbe 75%, transparent)");
    expect(vars["--elev-1"]).toBe("0 6px 18px -8px rgba(18, 49, 63, 0.18)");
    expect(vars["--switch-track-off"]).toBe("color-mix(in srgb, #12313f 28%, #e8f4f8)");
  });

  it("falls back to Calvin for an unknown theme", () => {
    expect(galleryTheme("neon", "dark")).toEqual({ dark: true, vars: {} });
  });
});
