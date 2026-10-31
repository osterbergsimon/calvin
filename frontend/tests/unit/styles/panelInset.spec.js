/**
 * Settings panels add no padding of their own (SettingsSection.vue), so every
 * direct child insets itself. They must all use the same inset token, or text
 * ends up at different distances from the card edge (or on it).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");
const read = path => readFileSync(resolve(SRC, path), "utf8");

const PANEL_CHILDREN = [
  "components/settings/shell/SettingRow.vue",
  "components/settings/specialized/SourceList.vue",
  "components/settings/specialized/WhereItShows.vue",
];

describe("settings panel inset", () => {
  it("defines the panel inset tokens", () => {
    const theme = read("styles/theme.css");
    expect(theme).toMatch(/--panel-pad-x:/);
    expect(theme).toMatch(/--panel-pad-y:/);
  });

  it.each(PANEL_CHILDREN)("%s insets with --panel-pad-x", file => {
    const style = read(file).split("<style")[1] || "";
    expect(style).toContain("var(--panel-pad-x)");
  });
});
