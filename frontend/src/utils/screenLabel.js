// How a screen (kiosk) is labelled across Settings: its Name, then its
// hostname, then its install id. Used by the Screens list cards, the
// per-screen header, the page editor and the default-screen notes so they
// never disagree (CLV-103).

// What the screen is called when no Name is set: hostname, then id.
export function screenLabelFallback(kiosk) {
  return kiosk?.hostname || kiosk?.id || "";
}

export function screenLabel(kiosk) {
  return kiosk?.overrides?.displayName || screenLabelFallback(kiosk);
}
