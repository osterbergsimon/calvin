// Per-kiosk identity (calvin-dd9.2). The kiosk's Chromium opens the server URL
// with ?kiosk=<id>; the frontend reads it here and threads it onto API calls so
// the server can register the kiosk (and, later, serve per-kiosk config).

export function getKioskId() {
  try {
    const id = new URLSearchParams(window.location.search).get("kiosk");
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

export function withKiosk(url) {
  const id = getKioskId();
  if (!id) return url;
  const sep = url.includes("?") ? "&" : "?";
  const host = encodeURIComponent(window.location.hostname || "");
  return `${url}${sep}kiosk=${encodeURIComponent(id)}&khost=${host}`;
}
