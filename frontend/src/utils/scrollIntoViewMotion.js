/**
 * Scroll motion for scrollIntoView calls.
 *
 * A jump into view is motion too, so it honours the same
 * prefers-reduced-motion query base.css uses for CSS animation: someone who
 * asked for less motion gets the jump, not the scroll.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when this browser asks for less motion; false when matchMedia is missing. */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return Boolean(window.matchMedia(REDUCED_MOTION_QUERY)?.matches);
}

/** The behavior for scrollIntoView: "auto" for reduced motion, "smooth" otherwise. */
export function scrollBehavior() {
  return prefersReducedMotion() ? "auto" : "smooth";
}
