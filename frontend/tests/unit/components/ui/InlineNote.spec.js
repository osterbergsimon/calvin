import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { mdiAlert, mdiCheck, mdiCloseCircle } from "@mdi/js";
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

  it("leaves a neutral note iconless", () => {
    const w = mount(InlineNote, { slots: { default: "Synced just now." } });
    expect(w.find(".inline-note__icon").exists()).toBe(false);
  });

  it.each([
    ["ok", mdiCheck],
    ["warn", mdiAlert],
    ["err", mdiCloseCircle],
  ])("gives the %s tone a decorative icon before the text", (tone, path) => {
    const w = mount(InlineNote, { props: { tone }, slots: { default: "Something happened." } });
    const icon = w.find(".inline-note__icon");
    expect(icon.exists()).toBe(true);
    expect(icon.attributes("aria-hidden")).toBe("true");
    expect(icon.find("svg path").attributes("d")).toBe(path);
    // The icon is first; the word still carries the meaning.
    expect(w.element.firstElementChild).toBe(icon.element);
    expect(w.find(".inline-note__text").text()).toBe("Something happened.");
  });

  it("sizes the status icon at 14px", () => {
    expect(STYLE).toMatch(/\.inline-note__glyph\s*\{[^}]*width:\s*0\.875rem/s);
    expect(STYLE).toMatch(/\.inline-note__glyph\s*\{[^}]*height:\s*0\.875rem/s);
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

  // calvin-cdva: a long note used to wrap its text onto a new flex line, leaving
  // the icon alone above it. The text and its action now share a body beside
  // the icon; only the body wraps.
  it("keeps the icon beside a body that holds the text and the action", () => {
    const w = mount(InlineNote, {
      props: { tone: "warn" },
      slots: {
        default: "Couldn't get a one-time code. This command still works.",
        action: '<button type="button">Try again</button>',
      },
    });
    const children = [...w.element.children].map(child => child.className);
    expect(children).toEqual(["inline-note__icon", "inline-note__body"]);
    const body = w.find(".inline-note__body");
    expect(body.find(".inline-note__text").text()).toBe(
      "Couldn't get a one-time code. This command still works."
    );
    expect(body.find(".inline-note__action button").text()).toBe("Try again");
  });

  it("wraps inside the body, never between the icon and the text", () => {
    const note = STYLE.match(/\.inline-note\s*\{[^}]*\}/s)[0];
    expect(note).not.toMatch(/flex-wrap:\s*wrap/);
    const body = STYLE.match(/\.inline-note__body\s*\{[^}]*\}/s)[0];
    expect(body).toMatch(/flex-wrap:\s*wrap/);
    expect(body).toMatch(/min-width:\s*0/);
    // It shrinks to the room beside the icon but does not grow, so a short or
    // centred note keeps its own width.
    expect(body).toMatch(/flex:\s*0 1 auto/);
  });
});
