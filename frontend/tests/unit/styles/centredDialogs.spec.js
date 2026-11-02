/**
 * Contract tests for the fixed-dialog positioning shared by every dialog that
 * has to sit above the on-screen keyboard (`.dialog-above-osk`).
 *
 * jsdom cannot lay out `position: fixed` boxes, so these assert the CSS
 * contract itself: a centred panel must not inherit the full-screen overlay's
 * `bottom` offset, or it stretches from mid-screen to the bottom of the
 * viewport no matter how little content it has.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../../../src/styles/main.css"), "utf-8");

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("dialogs above the on-screen keyboard", () => {
  it("pins full-screen overlay variants to the top of the keyboard", () => {
    const body = ruleBody("#app .dialog-above-osk");
    expect(body).toContain("bottom: var(--osk-height, 0px)");
  });

  it("lets centred dialogs hug their content instead of stretching", () => {
    const body = ruleBody("#app .dialog-above-osk--center");
    expect(body).toContain("bottom: auto");
    expect(body).toContain("top: calc((100dvh - var(--osk-height, 0px)) / 2)");
  });
});
