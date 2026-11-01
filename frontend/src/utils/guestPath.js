/** A share link's guest page (calvin-mwqo) runs without the dashboard shell. */
export const isGuestPath = pathname => /^\/share\/[^/]+\/?$/.test(pathname || "");

/**
 * Router guard: App.vue decides guest mode once, from the address the page
 * loaded at, so crossing between the guest page and the dashboard in-app
 * would keep the wrong shell. Such a navigation becomes a full page load.
 */
export function createGuestGuard({
  currentPath = () => window.location.pathname,
  load = url => window.location.assign(url),
} = {}) {
  return to => {
    const loadedAsGuest = isGuestPath(currentPath());
    if (Boolean(to.meta?.guest) === loadedAsGuest) return true;
    load(to.fullPath);
    return false;
  };
}
