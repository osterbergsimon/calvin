/**
 * Phone-layout audits for the CLV-66 end-to-end suite.
 *
 * Each audit answers one question the brief cares about:
 *  - does anything stick out horizontally (document.scrollWidth > innerWidth)?
 *  - is a visible control covered, zero-sized or outside the viewport for good?
 *  - is a label's text cut off instead of wrapping?
 *  - did the browser log a console error or throw?
 */

import { test as base } from "@playwright/test";

const IGNORED_CONSOLE = [
  // The dev server answers these itself; they are not app errors.
  /favicon\.ico/i,
  /\[vite\]/i,
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i,
];

const isIgnoredConsole = (text, location = "") =>
  IGNORED_CONSOLE.some(pattern => pattern.test(text) || pattern.test(location));

export const test = base.extend({
  /** Console errors and uncaught exceptions collected for the whole test. */
  consoleErrors: async ({ page }, use) => {
    const errors = [];
    page.on("console", message => {
      if (message.type() !== "error") return;
      const location = message.location()?.url || "";
      if (isIgnoredConsole(message.text(), location)) return;
      errors.push(`${message.text()}${location ? ` (${location})` : ""}`);
    });
    page.on("pageerror", error => {
      if (isIgnoredConsole(error.message || "")) return;
      errors.push(`pageerror: ${error.message}`);
    });
    await use(errors);
  },
});

/** Selectors whose text is a label a person reads and must not be cut off. */
const TEXT_SELECTORS = [
  "label",
  "button",
  "[role='button']",
  "[role='tab']",
  "h1",
  "h2",
  "h3",
  "h4",
  ".settings-topbar__wordmark",
  ".settings-topbar__location",
  ".settings-topbar__pill-label",
  ".category-rail__label",
  ".category-rail__subtitle",
  ".setting-row__label",
  ".pp-name",
  ".pp-desc",
  ".list-row__name",
  ".list-row__meta",
  ".screen-card__name",
  ".screen-card__meta",
  ".screen-card__summary",
  ".screen-page__name",
  ".sre-tab-name",
  ".sre-preview-label",
  ".auth-card__title",
  ".auth-card__lead",
  ".empty-state__title",
].join(",");

const INTERACTIVE_SELECTORS = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='tab']",
  "[role='radio']",
  "[role='menuitem']",
  "[role='switch']",
].join(",");

async function collectProblems(page, scope) {
  return page.evaluate(
    ({ textSelectors, interactiveSelectors, scopeSelector }) => {
      const problems = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const clippedAway = (el, rect) => {
        for (
          let node = el.parentElement;
          node && node !== document.body;
          node = node.parentElement
        ) {
          const s = getComputedStyle(node);
          if (s.overflowX === "visible" && s.overflowY === "visible") continue;
          const nr = node.getBoundingClientRect();
          if (
            rect.bottom <= nr.top + 1 ||
            rect.top >= nr.bottom - 1 ||
            rect.right <= nr.left + 1 ||
            rect.left >= nr.right - 1
          ) {
            return true;
          }
        }
        return false;
      };

      const isVisible = el => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        // Clipped away by a scrolling/collapsing ancestor (a collapsed sheet,
        // the category rail): it cannot be seen or tapped.
        return !clippedAway(el, rect);
      };

      const dialogs = [
        ...document.querySelectorAll('[aria-modal="true"], [role="dialog"], .pill__panel'),
      ].filter(isVisible);
      const scopeEl = scopeSelector
        ? document.querySelector(scopeSelector)
        : dialogs.length
          ? dialogs[dialogs.length - 1]
          : document.body;
      if (!scopeEl) return [`audit scope "${scopeSelector}" not found`];

      // ── Horizontal overflow ────────────────────────────────────────────────
      const root = document.documentElement;
      if (root.scrollWidth > vw + 1) {
        problems.push(`document horizontal overflow: scrollWidth ${root.scrollWidth} > ${vw}`);
      }
      if (document.body.scrollWidth > vw + 1) {
        problems.push(`body horizontal overflow: scrollWidth ${document.body.scrollWidth} > ${vw}`);
      }

      const inHorizontalScroller = el => {
        for (
          let node = el.parentElement;
          node && node !== document.body;
          node = node.parentElement
        ) {
          const overflow = getComputedStyle(node).overflowX;
          if (overflow === "auto" || overflow === "scroll") return true;
        }
        return false;
      };

      const isAriaHidden = el => el.closest('[aria-hidden="true"]') !== null;

      for (const el of scopeEl.querySelectorAll("*")) {
        if (el.closest("svg") || isAriaHidden(el) || !isVisible(el)) continue;
        if (inHorizontalScroller(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 1) {
          problems.push(
            `${el.tagName.toLowerCase()}${el.getAttribute("data-test") ? `[data-test="${el.getAttribute("data-test")}"]` : ""} sticks out ${Math.round(rect.right - vw)}px past the right edge`
          );
          continue;
        }
        if (rect.left < -1) {
          problems.push(
            `${el.tagName.toLowerCase()}${el.getAttribute("data-test") ? `[data-test="${el.getAttribute("data-test")}"]` : ""} starts ${Math.round(-rect.left)}px left of the viewport`
          );
        }
      }

      // ── Text clipping ─────────────────────────────────────────────────────
      for (const el of scopeEl.querySelectorAll(textSelectors)) {
        if (!isVisible(el) || isAriaHidden(el) || el.closest("svg")) continue;
        const text = (el.textContent || "").trim();
        if (!text) continue;
        const style = getComputedStyle(el);
        // An ellipsis is deliberate truncation with a visible marker; the audit
        // is after text that is silently cut off or spilling.
        if (style.textOverflow === "ellipsis") continue;
        const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
        const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
        if (clipsX && el.scrollWidth > el.clientWidth + 1) {
          problems.push(
            `text clipped horizontally: "${text.replace(/\s+/g, " ").slice(0, 60)}" (${el.scrollWidth}px in ${el.clientWidth}px)`
          );
        } else if (clipsY && el.scrollHeight > el.clientHeight + 1) {
          problems.push(
            `text clipped vertically: "${text.replace(/\s+/g, " ").slice(0, 60)}" (${el.scrollHeight}px in ${el.clientHeight}px)`
          );
        }
      }

      // ── Reachability ──────────────────────────────────────────────────────
      const controls = [...scopeEl.querySelectorAll(interactiveSelectors)];
      for (const el of controls) {
        if (!isVisible(el) || isAriaHidden(el)) continue;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
        const style = getComputedStyle(el);
        if (style.pointerEvents === "none") {
          problems.push(`control ignores pointer events: ${describeElement(el)}`);
          continue;
        }

        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        const rect = el.getBoundingClientRect();
        // Scrolling may have pulled a clipped control into a collapsed
        // container (the pages editor's 64px sheet peek): it is not reachable,
        // but that is the container's resting state, not a layout bug.
        if (clippedAway(el, rect)) continue;
        if (rect.right <= 1 || rect.left >= vw - 1 || rect.bottom <= 1 || rect.top >= vh - 1) {
          problems.push(`control offscreen after scrolling to it: ${describeElement(el)}`);
          continue;
        }

        const x = Math.min(Math.max(rect.left + rect.width / 2, 1), vw - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 1), vh - 1);
        const hit = document.elementFromPoint(x, y);
        if (!hit) {
          problems.push(`control has nothing at its centre: ${describeElement(el)}`);
          continue;
        }
        const labelWrap = el.closest("label");
        const reachable =
          hit === el ||
          el.contains(hit) ||
          hit.contains(el) ||
          (labelWrap && (labelWrap === hit || labelWrap.contains(hit)));
        if (!reachable) {
          problems.push(`control covered by ${describeElement(hit)}: ${describeElement(el)}`);
        }
      }

      function describeElement(el) {
        const tag = el.tagName.toLowerCase();
        const dataTest = el.getAttribute("data-test");
        if (dataTest) return `${tag}[data-test="${dataTest}"]`;
        const label = (el.getAttribute("aria-label") || "").trim();
        if (label) return `${tag}[aria-label="${label.slice(0, 60)}"]`;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (text) return `${tag} "${text.slice(0, 60)}"`;
        return tag;
      }

      return problems;
    },
    {
      textSelectors: TEXT_SELECTORS,
      interactiveSelectors: INTERACTIVE_SELECTORS,
      scopeSelector: scope,
    }
  );
}

/**
 * Audit the current screen. Pass `scope` to limit the hit-test to an open
 * dialog/popover; by default the topmost dialog is used, else the page body.
 *
 * Throws with every problem in one message so a failure names the screen and
 * the exact element.
 */
export async function expectPhoneLayout(page, label, options = {}) {
  // Layout settles over a transition or two (the pages editor animates its
  // device preview from a 560px stand-in to the measured stage). Judge the
  // resting layout, not the first frame after opening a dialog.
  const deadline = Date.now() + (options.settleMs ?? 1200);
  let problems = await collectProblems(page, options.scope);
  while (problems.length > 0 && Date.now() < deadline) {
    await page.waitForTimeout(150);
    problems = await collectProblems(page, options.scope);
  }
  if (problems.length > 0) {
    throw new Error(`${label}:\n- ${problems.join("\n- ")}`);
  }
  return problems;
}
