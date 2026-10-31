/**
 * Both sides of the horizontal clock bar are rows of touching items: wordmark,
 * room name and screen dots on the left, plugin tiles and actions on the right.
 * The row gap belongs to the shared side rule so neither side can lose it —
 * without it the room name ran into the wordmark ("CAL·VINDemo Room", CLV-72).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "../../../src");
const read = path => readFileSync(resolve(SRC, path), "utf8");

const style = read("components/ClockBarHorizontal.vue").split("<style")[1] || "";

/** The declarations of a single class rule, or "" when it does not exist. */
const rule = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = style.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : "";
};

describe("clock bar side spacing", () => {
  it("declares the inline spacing token", () => {
    expect(read("styles/theme.css")).toMatch(/--gap-inline:/);
  });

  it("gives the shared clock-bar side rule the inline gap", () => {
    expect(rule(".clock-bar-side")).toMatch(/gap:\s*var\(--gap-inline\)/);
  });

  it("does not override the left side without a gap", () => {
    expect(rule(".clock-bar-left")).not.toMatch(/gap:/);
  });
});
