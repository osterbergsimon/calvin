// Per-kiosk identity (calvin-dd9.2). The kiosk's Chromium opens the server URL
// with ?kiosk=<id> (and, once re-provisioned, &khost=<pi-hostname>); the
// frontend reads them here and threads them onto API calls so the server can
// register the kiosk (and, later, serve per-kiosk config).
//
// The query string only survives until the first in-app navigation (Settings →
// Done pushes "/" without it), so the values are captured into sessionStorage
// the first time they are seen and read back from there afterwards. A new
// ?kiosk= in the URL always wins over the stored value.

import { KIOSK_ROOT_CLASS } from "../styles/breakpoints.js";

const KIOSK_ID_KEY = "calvin_kiosk_id";
const KIOSK_HOST_KEY = "calvin_kiosk_host";

function readParam(name) {
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function readStored(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode etc.) — the URL param still works for this load.
  }
}

// Read a URL param, persisting it for later navigations; fall back to the stored copy.
function captured(param, key) {
  const fromUrl = readParam(param);
  if (fromUrl) {
    store(key, fromUrl);
    return fromUrl;
  }
  return readStored(key);
}

// Call once at boot (main.js) so the identity is stored before any route change.
// A kiosk also gets the KIOSK_ROOT_CLASS on <html>: the breakpoints read it so
// the short 800x480 wall panel is never classed as a landscape phone.
export function captureKioskIdentity() {
  const id = captured("kiosk", KIOSK_ID_KEY);
  captured("khost", KIOSK_HOST_KEY);
  try {
    document.documentElement.classList.toggle(KIOSK_ROOT_CLASS, Boolean(id));
  } catch {
    // No DOM (SSR/tests without jsdom): nothing to mark.
  }
}

export function getKioskId() {
  // khost travels with the id, so capture it whenever the id is read too.
  captured("khost", KIOSK_HOST_KEY);
  return captured("kiosk", KIOSK_ID_KEY);
}

// The kiosk's OWN hostname. In Mode B (remote backend) window.location.hostname
// is the SERVER host — identical for every kiosk — so a re-provisioned kiosk
// passes its real hostname via ?khost=. Fall back to window.location.hostname
// only for kiosks that predate the khost param (backward compat).
export function getKioskHost() {
  return captured("khost", KIOSK_HOST_KEY) || window.location.hostname || "";
}

// Config path relative to the API base (for the shared `services/api.js` client).
export function configPath() {
  const id = getKioskId();
  if (!id) return "/config";
  const khost = encodeURIComponent(getKioskHost());
  return `/kiosks/${encodeURIComponent(id)}/config?khost=${khost}`;
}

export function configUrl() {
  return `/api${configPath()}`;
}

// Attach the kiosk's CSS viewport to its config fetch, so the server can record
// the real screen shape for the layout editor's preview (CLV-36). Only kiosks
// report; a plain browser has no screen entry. Returns the path unchanged when
// the viewport is unavailable.
export function withViewport(path) {
  if (!getKioskId()) return path;
  const w = Math.round(window.innerWidth);
  const h = Math.round(window.innerHeight);
  if (!(w > 0 && h > 0)) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}vw=${w}&vh=${h}`;
}
