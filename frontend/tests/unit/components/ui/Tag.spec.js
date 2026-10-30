import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { mdiAlert } from "@mdi/js";
import Tag from "@/components/ui/Tag.vue";

const SOURCE = readFileSync(resolve(__dirname, "../../../../src/components/ui/Tag.vue"), "utf-8");
const TEMPLATE = SOURCE.slice(SOURCE.indexOf("<template>"), SOURCE.indexOf("</template>"));
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("Tag", () => {
  it("defaults to the neutral tone and renders a span label", () => {
    const w = mount(Tag, { slots: { default: "This screen" } });
    expect(w.element.tagName).toBe("SPAN");
    expect(w.classes()).toEqual(expect.arrayContaining(["tag", "neutral"]));
    expect(w.classes()).not.toContain("count");
    expect(w.text()).toBe("This screen");
  });

  it.each(["neutral", "ok", "warn", "err", "focus"])("renders the %s tone class", tone => {
    const w = mount(Tag, { props: { tone }, slots: { default: "x" } });
    expect(w.classes()).toContain(tone);
  });

  it("keeps a neutral tag on the line token and text tokens", () => {
    expect(STYLE).toMatch(/\.tag\s*\{[^}]*color:\s*var\(--ink-2\)/s);
    expect(STYLE).toMatch(/\.tag\s*\{[^}]*border:\s*1px solid var\(--line\)/s);
  });

  it("count tags are mono, tabular and at least as wide as they are tall", () => {
    const w = mount(Tag, { props: { count: true }, slots: { default: "12" } });
    expect(w.classes()).toContain("count");
    expect(STYLE).toMatch(
      /\.tag\.count\s*\{[^}]*font-family:\s*var\(--font-data\)[^}]*font-variant-numeric:\s*tabular-nums/s
    );
    expect(STYLE).toMatch(/\.tag\.count\s*\{[^}]*min-width:\s*var\(--tag-height\)/s);
    expect(STYLE).toMatch(/\.tag\.count\s*\{[^}]*justify-content:\s*center/s);
  });

  it("renders an icon path before the label", () => {
    const w = mount(Tag, { props: { tone: "err", icon: mdiAlert }, slots: { default: "Host" } });
    const svg = w.find("svg.tag__icon");
    expect(svg.exists()).toBe(true);
    expect(svg.attributes("aria-hidden")).toBe("true");
    expect(svg.find("path").attributes("d")).toBe(mdiAlert);
    expect(w.text()).toBe("Host");
  });

  it("omits the icon when none is given", () => {
    const w = mount(Tag, { slots: { default: "x" } });
    expect(w.find("svg").exists()).toBe(false);
  });

  it("is a label: no uppercase, no letter-spacing", () => {
    expect(STYLE).not.toMatch(/text-transform:\s*uppercase/);
    expect(STYLE).not.toMatch(/letter-spacing/);
    expect(TEMPLATE).not.toContain("uppercase");
  });

  it("uses only tag and colour tokens, no literals", () => {
    expect(STYLE).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(STYLE).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    expect(STYLE).not.toMatch(/\b(white|black)(?!-)/);
    expect(STYLE).not.toMatch(/font-size:\s*[0-9.]+(px|rem)/);
    expect(STYLE).not.toMatch(/font-weight:\s*bold/);
    for (const [, value] of STYLE.matchAll(/var\((--[a-z0-9-]+)/g)) {
      expect(
        value.startsWith("--tag-") ||
          [
            "--line",
            "--ink",
            "--ink-2",
            "--ok",
            "--warn",
            "--err",
            "--focus",
            "--font-ui",
            "--font-data",
            "--space-2xs",
          ].includes(value),
        `unexpected variable ${value}`
      ).toBe(true);
    }
  });
});
