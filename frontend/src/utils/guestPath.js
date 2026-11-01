/** A share link's guest page (calvin-mwqo) runs without the dashboard shell. */
export const isGuestPath = pathname => /^\/share\/[^/]+\/?$/.test(pathname || "");
