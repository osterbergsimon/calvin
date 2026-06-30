import { describe, it, expect } from "vitest";
import { resolveScrollView, pickActiveEyebrow } from "@/utils/settingsSectionSpy";

const pane = ({ scrollHeight, clientHeight, scrollTop = 0, top = 0 }) => ({
  scrollHeight,
  clientHeight,
  scrollTop,
  getBoundingClientRect: () => ({ top }),
});

describe("pickActiveEyebrow", () => {
  it("returns -1 when there are no eyebrows", () => {
    expect(pickActiveEyebrow([], { top: 0, height: 800, atBottom: false })).toBe(-1);
  });

  it("picks the last eyebrow above the viewport midpoint", () => {
    // midpoint = 0 + 800/2 = 400; eyebrows at 100, 350, 600 -> last <=400 is index 1
    expect(pickActiveEyebrow([100, 350, 600], { top: 0, height: 800, atBottom: false })).toBe(1);
  });

  it("falls back to the first eyebrow when none have crossed the midpoint (top of scroll)", () => {
    expect(pickActiveEyebrow([500, 700, 900], { top: 0, height: 800, atBottom: false })).toBe(0);
  });

  it("pins the last eyebrow when at the bottom (so the final short section is reachable)", () => {
    // even though by midpoint it'd pick index 0, atBottom wins
    expect(pickActiveEyebrow([100, 780, 790], { top: 0, height: 800, atBottom: true })).toBe(2);
  });
});

describe("resolveScrollView", () => {
  it("uses the pane geometry when the pane is the scroll container (desktop)", () => {
    const view = resolveScrollView({
      container: pane({ scrollHeight: 2000, clientHeight: 800, scrollTop: 0, top: 120 }),
      win: { innerHeight: 900, scrollY: 0 },
      doc: { scrollHeight: 900 },
    });
    expect(view.top).toBe(120);
    expect(view.height).toBe(800);
    expect(view.atBottom).toBe(false);
  });

  it("reports atBottom only when the pane is genuinely scrolled to the end", () => {
    const view = resolveScrollView({
      container: pane({ scrollHeight: 2000, clientHeight: 800, scrollTop: 1200, top: 0 }),
      win: { innerHeight: 900, scrollY: 0 },
      doc: { scrollHeight: 900 },
    });
    expect(view.atBottom).toBe(true);
  });

  it("does NOT report atBottom for a short category that fits without scrolling (bug calvin-f41)", () => {
    // pane content fits: scrollHeight ~= clientHeight, scrollTop 0 -> must not be 'atBottom',
    // otherwise the indicator would pin to the last section while the user is at the top.
    const view = resolveScrollView({
      container: pane({ scrollHeight: 800, clientHeight: 800, scrollTop: 0, top: 0 }),
      win: { innerHeight: 900, scrollY: 0 },
      doc: { scrollHeight: 900 },
    });
    expect(view.atBottom).toBe(false);
  });

  it("falls back to the window scroller when the pane does not scroll (<=768px breakpoint, bug calvin-8me)", () => {
    // pane is overflow-y:visible (grows to content) so scrollHeight == clientHeight;
    // the window scrolls instead. Geometry must come from the window.
    const view = resolveScrollView({
      container: pane({ scrollHeight: 3000, clientHeight: 3000, scrollTop: 0, top: -500 }),
      win: { innerHeight: 700, scrollY: 500 },
      doc: { scrollHeight: 3200 },
    });
    expect(view.top).toBe(0);
    expect(view.height).toBe(700);
    expect(view.atBottom).toBe(false);
  });

  it("reports atBottom from the window when the page is scrolled to the end", () => {
    const view = resolveScrollView({
      container: pane({ scrollHeight: 3000, clientHeight: 3000 }),
      win: { innerHeight: 700, scrollY: 2500 },
      doc: { scrollHeight: 3200 },
    });
    expect(view.atBottom).toBe(true);
  });

  it("handles a missing pane element by using the window", () => {
    const view = resolveScrollView({
      container: null,
      win: { innerHeight: 600, scrollY: 0 },
      doc: { scrollHeight: 600 },
    });
    expect(view.top).toBe(0);
    expect(view.height).toBe(600);
    expect(view.atBottom).toBe(false);
  });
});
