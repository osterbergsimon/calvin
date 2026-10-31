import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import InlineNote from "@/components/ui/InlineNote.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/InlineNote.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("InlineNote", () => {
  it("renders a neutral one-line note by default", () => {
    const w = mount(InlineNote, { slots: { default: "Saved automatically." } });
    expect(w.element.tagName).toBe("P");
    expect(w.classes()).toContain("inline-note");
    expect(w.classes()).toContain("inline-note--neutral");
    expect(w.text()).toBe("Saved automatically.");
  });

  it.each(["neutral", "warn", "err", "ok"])("renders the %s tone", tone => {
    const w = mount(InlineNote, { props: { tone }, slots: { default: "x" } });
    expect(w.classes()).toContain(`inline-note--${tone}`);
  });

  it("falls back to neutral for an unknown tone", () => {
    const w = mount(InlineNote, { props: { tone: "nope" }, slots: { default: "x" } });
    expect(w.classes()).toContain("inline-note--neutral");
  });

  it("adds the action slot beside the note", () => {
    const w = mount(InlineNote, {
      props: { tone: "warn" },
      slots: {
        default: "Changes need a restart.",
        action: '<button type="button">Restart</button>',
      },
    });
    expect(w.find(".inline-note__action button").text()).toBe("Restart");
  });

  it("has no action wrapper when the slot is empty", () => {
    const w = mount(InlineNote, { slots: { default: "x" } });
    expect(w.find(".inline-note__action").exists()).toBe(false);
  });

  it("uses the meta type role and tone text tokens", () => {
    expect(STYLE).not.toMatch(/var\(--fs-/);
    expect(STYLE).not.toMatch(/var\(--space-/);
    expect(STYLE).toMatch(/font-size:\s*var\(--text-meta\)/);
    expect(STYLE).toMatch(/color:\s*var\(--warn-text\)/);
    expect(STYLE).toMatch(/color:\s*var\(--err-text\)/);
    expect(STYLE).toMatch(/color:\s*var\(--ok-text\)/);
  });
});
