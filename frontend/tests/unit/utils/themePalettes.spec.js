import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CALVIN_PALETTE,
  cssColourToHex,
  eventSwatches,
  nextEventColour,
} from "@/utils/themePalettes";

const CSS = readFileSync(resolve(__dirname, "../../../src/styles/theme.css"), "utf-8");

const parseBlock = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  const vars = {};
  for (const [, name, value] of block[1].matchAll(/^\s*--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/gm)) {
    vars[name] = value;
  }
  return vars;
};

describe("calvinPalette mirror", () => {
  it("matches theme.css in both modes", () => {
    // Previews read the mirror (a ?raw CSS import is empty under vitest); this
    // test is what keeps the mirror honest.
    expect(CALVIN_PALETTE.light).toEqual(parseBlock(":root"));
    expect(CALVIN_PALETTE.dark).toEqual(parseBlock(".dark"));
  });
});

describe("calendar colour helpers", () => {
  beforeEach(() => {
    const styles = document.documentElement.style;
    for (let i = 1; i <= 8; i += 1) {
      styles.setProperty(`--event-${i}`, i === 1 ? "#863427" : `#00000${i}`);
    }
  });

  afterEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("resolves the event tokens to hex swatches", () => {
    const swatches = eventSwatches();
    expect(swatches).toHaveLength(8);
    expect(swatches[0]).toEqual({ token: "--event-1", number: 1, hex: "#863427" });
  });

  it("picks the next unused calendar colour", () => {
    expect(nextEventColour([])).toBe("#863427");
    expect(nextEventColour(["#863427"])).toBe("#000002");
    // Only hex values count as used; a named legacy colour is ignored.
    expect(nextEventColour(["green"])).toBe("#863427");
  });

  it("converts computed rgb() colours", () => {
    expect(cssColourToHex("rgb(134, 52, 39)")).toBe("#863427");
    expect(cssColourToHex("rgba(255, 0, 0, 0.5)")).toBe("#ff0000");
    expect(cssColourToHex("#abc")).toBe("#aabbcc");
    expect(cssColourToHex("")).toBeNull();
  });
});
