// Pure, DOM-free core of the Settings section-indicator scroll-spy.
// Settings.vue does the DOM reads (querySelectorAll, getBoundingClientRect) and
// feeds the measured numbers in here so the actual picking logic is unit-testable
// without a layout engine.

/**
 * Resolve the active scroll viewport. On desktop the options pane
 * (.settings-content) scrolls; at the <=768px / short-height breakpoints the
 * pane is overflow-y:visible and the window scrolls instead. Decide by which is
 * actually scrollable rather than assuming the pane.
 *
 * @param {{container: ?{scrollHeight:number,clientHeight:number,scrollTop:number,getBoundingClientRect:Function}, win: {innerHeight:number,scrollY:number}, doc: {scrollHeight:number}}} sources
 * @returns {{top:number, height:number, atBottom:boolean}}
 */
export function resolveScrollView({ container, win, doc }) {
  const paneScrolls = !!container && container.scrollHeight - container.clientHeight > 1;

  if (paneScrolls) {
    return {
      top: container.getBoundingClientRect().top,
      height: container.clientHeight,
      atBottom: container.scrollTop + container.clientHeight >= container.scrollHeight - 4,
    };
  }

  // Window is the scroller — or nothing scrolls at all (content fits the pane).
  const windowScrolls = doc.scrollHeight - win.innerHeight > 1;
  return {
    top: 0,
    height: win.innerHeight,
    atBottom: windowScrolls && win.scrollY + win.innerHeight >= doc.scrollHeight - 4,
  };
}

/**
 * Pick the active section index from eyebrow positions and the viewport.
 *
 * @param {number[]} eyebrowTops viewport-relative top (px) of each eyebrow, in DOM order
 * @param {{top:number, height:number, atBottom:boolean}} view
 * @returns {number} index into eyebrowTops, or -1 when there are no eyebrows
 */
export function pickActiveEyebrow(eyebrowTops, { top, height, atBottom }) {
  if (!eyebrowTops.length) return -1;

  // At the bottom, trailing short sections can't scroll any higher — pin the
  // last so the final section is always reachable. (Only true when the view
  // actually scrolls; resolveScrollView guarantees that, so a category that
  // fits without scrolling never falsely reads as "at bottom".)
  if (atBottom) return eyebrowTops.length - 1;

  // Otherwise the active section is the last eyebrow that has scrolled above the
  // viewport midpoint. Midpoint (not the top) lets short sections that can't
  // reach the very top of a tall pane still get their turn; falls back to the
  // first when nothing has crossed the line yet (scrolled to the very top).
  const refY = top + height * 0.5;
  let active = 0;
  for (let i = 0; i < eyebrowTops.length; i++) {
    if (eyebrowTops[i] <= refY) active = i;
  }
  return active;
}
