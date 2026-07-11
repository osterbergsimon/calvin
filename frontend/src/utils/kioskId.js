// Per-kiosk identity (calvin-dd9.2). The kiosk's Chromium opens the server URL
// with ?kiosk=<id> (and, once re-provisioned, &khost=<pi-hostname>); the
// frontend reads them here and threads them onto API calls so the server can
// register the kiosk (and, later, serve per-kiosk config).

export function getKioskId() {
  try {
    const id = new URLSearchParams(window.location.search).get("kiosk");
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

// The kiosk's OWN hostname. In Mode B (remote backend) window.location.hostname
// is the SERVER host — identical for every kiosk — so a re-provisioned kiosk
// passes its real hostname via ?khost=. Fall back to window.location.hostname
// only for kiosks that predate the khost param (backward compat).
export function getKioskHost() {
  try {
    const host = new URLSearchParams(window.location.search).get("khost");
    if (host && host.trim()) return host.trim();
  } catch {
    // ignore and fall through to the location-based default
  }
  return window.location.hostname || "";
}

export function withKiosk(url) {
  const id = getKioskId();
  if (!id) return url;
  const sep = url.includes("?") ? "&" : "?";
  const host = encodeURIComponent(getKioskHost());
  return `${url}${sep}kiosk=${encodeURIComponent(id)}&khost=${host}`;
}
