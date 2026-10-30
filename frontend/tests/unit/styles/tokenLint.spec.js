/**
 * Token lint for the components the chips-and-tags refactor touches.
 *
 * See docs/design/2026-10-30-chips-and-tags.md §2.1: these components leave
 * with no hex/rgb/hsl colour literals, no `white`/`black`, no `font-weight:
 * bold`, no raw px/rem font sizes, and radii only from the radius tokens.
 * The lint reads the SFC style block, so it does not depend on jsdom layout.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");

const FILES = [
  "components/ui/Tag.vue",
  "components/EventDetailPanel.vue",
  "components/dashboard/CalendarViewOptions.vue",
  "components/settings/categories/ScreensSettings.vue",
  "components/settings/categories/security/ApiKeysSection.vue",
  "components/settings/shared/ScreenRegionEditor.vue",
  "components/settings/shared/TabNavigation.vue",
  "components/settings/shared/regions/RegionInspector.vue",
  "components/settings/shared/regions/ScreenInspector.vue",
  "components/settings/shell/ScopeChip.vue",
  "components/settings/specialized/OrderingManager.vue",
  "components/settings/specialized/PluginCard.vue",
  "components/settings/specialized/PluginInstaller.vue",
  "components/settings/specialized/PluginInstances.vue",
  "components/settings/specialized/ThemeSelector.vue",
  "components/settings/tabs/layout/keyboard/KeyBindingTile.vue",
];

const styleBlock = file => {
  const source = readFileSync(resolve(SRC, file), "utf-8");
  const start = source.indexOf("<style");
  expect(start, `${file} has a <style> block`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("</style>")).replace(/\/\*[\s\S]*?\*\//g, "");
};

const radii = style => [...style.matchAll(/border-radius:\s*([^;]+);/g)].map(m => m[1].trim());

describe("token lint: touched components", () => {
  it("declares the tag and tab tokens in theme.css", () => {
    const css = readFileSync(resolve(SRC, "styles/theme.css"), "utf-8");
    for (const token of [
      "--tag-height",
      "--tag-pad-x",
      "--tag-gap",
      "--tag-radius",
      "--tag-fs",
      "--tag-weight",
      "--tag-icon",
      "--tag-tint",
      "--tag-edge",
      "--tag-ink",
      "--tab-height",
      "--tab-indicator",
      "--tab-icon",
    ]) {
      expect(css, token).toContain(`${token}:`);
    }
  });

  it.each(FILES)("%s has no colour literals", file => {
    const style = styleBlock(file);
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(style).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    expect(style).not.toMatch(/\b(white|black)(?!-)/);
  });

  it.each(FILES)("%s uses no bold or raw font size", file => {
    const style = styleBlock(file);
    expect(style).not.toMatch(/font-weight:\s*bold/);
    expect(style).not.toMatch(/font-size:\s*[0-9.]+(px|rem)/);
  });

  it.each(FILES)("%s only uses radius tokens", file => {
    for (const value of radii(styleBlock(file))) {
      for (const part of value.split(/\s+/)) {
        expect(
          part === "0" ||
            part === "2px" ||
            part.startsWith("var(--radius-") ||
            part === "var(--tag-radius)",
          `${file}: ${value}`
        ).toBe(true);
      }
    }
  });
});
