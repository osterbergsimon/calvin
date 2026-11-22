// The sandbox a kiosk puts on every frame it shows. Without allow-popups a framed
// page cannot open a window (target=_blank, window.open); without
// allow-top-navigation it cannot replace Calvin (target=_top, top.location). A
// kiosk has no tabs or back button, so either one strands the wall. Scripts,
// same-origin storage and forms stay so ordinary service dashboards keep working.
export const KIOSK_SANDBOX = "allow-scripts allow-same-origin allow-forms";

// A frame from Calvin's own origin must not keep allow-same-origin: with scripts
// it could reach `parent` and call parent.window.open, which opens a popup the
// sandbox would have blocked. Without it the frame gets an opaque origin and
// cannot touch the parent. A foreign origin already cannot reach the parent, so
// it keeps same-origin storage (service dashboards need their cookies).
export const KIOSK_SANDBOX_OPAQUE = "allow-scripts allow-forms";

export function kioskSandboxFor(url, origin = globalThis.window?.location?.origin) {
  try {
    return new URL(url, origin).origin === origin ? KIOSK_SANDBOX_OPAQUE : KIOSK_SANDBOX;
  } catch {
    return KIOSK_SANDBOX_OPAQUE;
  }
}

// Off the kiosk a person can close a tab or go back, so a popup is harmless there;
// it still never gets top navigation. The escape flag lets a popup behave like a
// normal page instead of inheriting this sandbox.
const POPUPS = "allow-popups allow-popups-to-escape-sandbox";

// The one sandbox for every framed page, on any client. The origin of the frame
// decides what it may keep (see above); the client decides only about popups.
export function frameSandboxFor(url, { kiosk = false, origin } = {}) {
  const base = kioskSandboxFor(url, origin);
  return kiosk ? base : `${base} ${POPUPS}`;
}
