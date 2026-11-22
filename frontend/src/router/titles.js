/**
 * Page titles (M9): the browser tab and history say where you are. A route's
 * `meta.title` is its own name, appended to the product name with an en dash;
 * a route without one (the dashboard) keeps the product name alone.
 */
export function titleFor(to) {
  return to.meta?.title ? `${to.meta.title} – Calvin` : "Calvin";
}

export function applyRouteTitle(to) {
  document.title = titleFor(to);
}
