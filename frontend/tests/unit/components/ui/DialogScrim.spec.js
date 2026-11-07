import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import DialogScrim from "@/components/ui/DialogScrim.vue";
import { styleRules } from "../../styles/lint-helpers.js";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/DialogScrim.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const isFull = rule => rule.selector.includes('[data-effects="full"]');

describe("DialogScrim", () => {
  it("emits dismiss on click", async () => {
    const w = mount(DialogScrim);
    await w.find(".dialog-scrim").trigger("click");
    expect(w.emitted("dismiss")).toHaveLength(1);
  });

  it("applies the blur class only when the caller opts in", () => {
    const plain = mount(DialogScrim);
    expect(plain.find(".dialog-scrim").classes()).not.toContain("is-blurred");
    const blurred = mount(DialogScrim, { props: { blur: true } });
    expect(blurred.find(".dialog-scrim").classes()).toContain("is-blurred");
  });

  it('blurs the dashboard only under [data-effects="full"]', () => {
    const rules = styleRules("components/ui/DialogScrim.vue");
    const blurRules = rules.filter(rule =>
      rule.declarations.some(declaration => declaration.prop === "backdrop-filter")
    );
    expect(blurRules.length).toBeGreaterThan(0);
    expect(blurRules.every(isFull)).toBe(true);
    // Standard never pays for a full-screen blur, even if a caller opts in.
    expect(
      rules
        .filter(rule => !isFull(rule))
        .some(rule => rule.declarations.some(declaration => /filter/.test(declaration.prop)))
    ).toBe(false);
  });

  it("keeps the stronger Standard dim and restores the original Full dim", () => {
    const rules = styleRules("components/ui/DialogScrim.vue");
    const backgrounds = rules.filter(rule =>
      rule.declarations.some(declaration => declaration.prop === "background")
    );
    const valueOf = rule => rule.declarations.find(d => d.prop === "background").value;

    const standard = backgrounds.filter(rule => !isFull(rule));
    const full = backgrounds.filter(isFull);
    expect(standard.map(valueOf).join(" ")).toContain("var(--bg-0) 78%");
    expect(full.map(valueOf).join(" ")).toContain("var(--bg-0) 72%");
  });

  it("keeps the cheap opacity fade-in", () => {
    expect(STYLE).toMatch(/animation:\s*scrim-in/);
    expect(STYLE).toMatch(/@keyframes scrim-in/);
    // The animation only touches opacity.
    const keyframes = STYLE.slice(STYLE.indexOf("@keyframes scrim-in"));
    expect(keyframes).not.toMatch(/(?:filter|transform|width|height|top|left)\s*:/);
  });
});
