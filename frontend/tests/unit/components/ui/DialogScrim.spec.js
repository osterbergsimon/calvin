import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import DialogScrim from "@/components/ui/DialogScrim.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/DialogScrim.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("DialogScrim", () => {
  it("emits dismiss on click", async () => {
    const w = mount(DialogScrim);
    await w.find(".dialog-scrim").trigger("click");
    expect(w.emitted("dismiss")).toHaveLength(1);
  });

  it("never blurs what is behind it (kiosk GPU)", () => {
    const w = mount(DialogScrim);
    expect(w.find(".dialog-scrim").classes()).not.toContain("is-blurred");
    expect(STYLE).not.toMatch(/backdrop-filter/);
    expect(STYLE).not.toMatch(/filter\s*:[^;]*blur/);
  });

  it("keeps the dim colour-mix background, a touch stronger than before", () => {
    expect(STYLE).toMatch(/background:\s*color-mix\(in srgb, var\(--bg-0\) 78%, transparent\)/);
  });

  it("keeps the cheap opacity fade-in", () => {
    expect(STYLE).toMatch(/animation:\s*scrim-in/);
    expect(STYLE).toMatch(/@keyframes scrim-in/);
    // The animation only touches opacity.
    const keyframes = STYLE.slice(STYLE.indexOf("@keyframes scrim-in"));
    expect(keyframes).not.toMatch(/(?:filter|transform|width|height|top|left)\s*:/);
  });
});
