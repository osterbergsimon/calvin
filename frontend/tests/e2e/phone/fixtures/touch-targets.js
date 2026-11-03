/**
 * calvin-ip3l — touch-target audits for the settings pages.
 *
 * cog / WPE WebKit has no touch adjustment, so a control is only tappable where
 * its own hit area reaches. These helpers hit-test the real layout (including a
 * transparent ::before that grows a control's box) instead of trusting
 * getBoundingClientRect, which cannot see pseudo-elements.
 */

export const TOUCH_TARGET = 44;

const INTERACTIVE = '[role="switch"], [role="radio"], [role="button"], button';

/**
 * Every switch/button/radio inside `scopeSelector` must be tappable over a
 * 44x44 box centred on the element. Sampling four cardinal points at the edge
 * of that box proves the hit area reaches it (a pseudo-element can do so while
 * the element's own rect stays small).
 *
 * Returns readable problems; an empty array means the scope passed.
 */
export async function collectTouchTargetProblems(page, scopeSelector, min = TOUCH_TARGET) {
  return page.evaluate(
    ({ scopeSelector, min, interactive }) => {
      const scope = document.querySelector(scopeSelector);
      if (!scope) return [`scope "${scopeSelector}" not found`];

      const problems = [];
      const offset = min / 2 - 1; // 21px: just inside a 44px box
      const nodes = [...scope.querySelectorAll(interactive)];

      for (const el of nodes) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (Number(style.opacity) === 0 || style.pointerEvents === "none") continue;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;

        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const samples = [
          ["centre", cx, cy],
          ["left", cx - offset, cy],
          ["right", cx + offset, cy],
          ["top", cx, cy - offset],
          ["bottom", cx, cy + offset],
        ];

        for (const [name, x, y] of samples) {
          if (x < 1 || y < 1 || x > window.innerWidth - 1 || y > window.innerHeight - 1) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit))) continue;
          const where = hit ? describeElement(hit) : "nothing";
          problems.push(`${describeElement(el)}: ${name} of its 44px box hits ${where}`);
        }
      }

      return problems;

      function describeElement(el) {
        const tag = el.tagName.toLowerCase();
        const label = (el.getAttribute("aria-label") || "").trim();
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        const cls = typeof el.className === "string" ? el.className.split(/\s+/)[0] : "";
        const name = label || text;
        return `${tag}${cls ? `.${cls}` : ""}${name ? ` "${name.slice(0, 40)}"` : ""}`;
      }
    },
    { scopeSelector, min, interactive: INTERACTIVE }
  );
}

/**
 * The switch-specific check: the centre and +/-20px vertically (inside the
 * 44px target) must resolve to the switch itself. Returns the switches tested.
 */
export async function collectSwitchHitProblems(page, scopeSelector) {
  return page.evaluate(
    ({ scopeSelector }) => {
      const scope = document.querySelector(scopeSelector);
      if (!scope) return { checked: 0, problems: [`scope "${scopeSelector}" not found`] };

      const problems = [];
      const switches = [...scope.querySelectorAll('[role="switch"]')];
      let checked = 0;

      for (const el of switches) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (Number(style.opacity) === 0 || style.pointerEvents === "none") continue;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;

        el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        checked += 1;

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        for (const [name, y] of [
          ["centre", cy],
          ["20px above", cy - 20],
          ["20px below", cy + 20],
        ]) {
          if (y < 1 || y > window.innerHeight - 1) continue;
          const hit = document.elementFromPoint(cx, y);
          if (hit === el) continue;
          const label = (el.getAttribute("aria-label") || "").trim();
          const where = hit
            ? `${hit.tagName.toLowerCase()}${typeof hit.className === "string" && hit.className ? `.${hit.className.split(/\s+/)[0]}` : ""}`
            : "nothing";
          problems.push(`${label || "switch"} (${name}) hits ${where}`);
        }
      }

      return { checked, problems };
    },
    { scopeSelector }
  );
}
