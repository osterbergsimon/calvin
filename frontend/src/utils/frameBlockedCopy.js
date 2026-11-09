// Copy for a frame Calvin's own policy (CSP frame-src) blocked, shared by every
// component that shows it. The site is not refusing: Calvin's allowed list is.
export const FRAME_BLOCKED_TITLE = "This site is blocked";

export const FRAME_BLOCKED_BODY =
  "Calvin only shows sites on its allowed list. Add this one under Settings › Security › Allowed sites, or open it separately.";

// Adding to the list does nothing while sealed mode is on.
export const FRAME_BLOCKED_BODY_SEALED =
  "Sealed mode blocks outside sites. Turn it off under Settings › Security, or open it separately.";

export const FRAME_BLOCKED_HANDOFF_NOTE = "This site can't be shown inside Calvin.";

export const frameBlockedBody = sealed => (sealed ? FRAME_BLOCKED_BODY_SEALED : FRAME_BLOCKED_BODY);
