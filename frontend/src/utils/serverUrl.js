// The URL another device (a phone, a new kiosk) should use to reach this
// server — the first-run "set it up from your phone" hand-off (F2/F6).
//
// window.location.origin is right whenever this page was opened over the LAN,
// but an all-in-one Pi kiosk loads http://localhost:8000, which means nothing
// on a phone. So: the server's PUBLIC_URL setting wins, then a non-loopback
// origin, then the LAN address the server detected for itself.

import axios from "axios";
import { logError } from "./logger";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function isLoopbackHost(hostname) {
  const host = (hostname || "").toLowerCase();
  return LOOPBACK_HOSTS.has(host) || host.startsWith("127.") || host.endsWith(".localhost");
}

/** Is this page loaded from the server's own loopback address? */
export function isLoopbackPage() {
  return typeof window !== "undefined" && isLoopbackHost(window.location.hostname);
}

export function pickServerUrl(network, location = window.location) {
  if (network?.public_url) return network.public_url.replace(/\/+$/, "");
  if (location?.origin && !isLoopbackHost(location.hostname)) return location.origin;
  if (network?.lan_urls?.length) return network.lan_urls[0];
  return location?.origin || "";
}

let pending = null;

// Resolved once per page load; the answer doesn't change while the app runs.
export function resolveServerUrl() {
  if (!pending) {
    pending = axios
      .get("/api/system/network")
      .then(response => pickServerUrl(response?.data))
      .catch(err => {
        logError("[serverUrl]", "Failed to load network info:", err);
        return pickServerUrl(null);
      });
  }
  return pending;
}

export function _resetServerUrlForTests() {
  pending = null;
}

// "/settings?setting=content-calendars" on the server, ready for a QR code.
// `setupCode` is only ever passed on the server's own (loopback) screen: the
// phone that scans it gets the one-time code without typing it.
export function settingsLink(serverUrl, settingId, setupCode) {
  const base = (serverUrl || "").replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (settingId) params.set("setting", settingId);
  if (setupCode) params.set("setup", setupCode);
  const query = params.toString();
  return `${base}/settings${query ? `?${query}` : ""}`;
}
