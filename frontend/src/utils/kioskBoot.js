import { captureKioskIdentity } from "./kioskId";

// Boot the kiosk identity before the router module is evaluated (this module is
// the first import in main.js). Vue Router captures window.location when
// createWebHistory() runs; if the #pair= fragment were still there, its first
// navigation would put the secret back into the address bar. Reading and
// removing it here means the router never sees it (design §6, §14).
const bootPairSecret = captureKioskIdentity();

// Hand the secret over once, then forget it: no module-level binding keeps the
// screen's credential for the rest of the session (review of PR #386, minor 1).
let pendingPairSecret = bootPairSecret;

/**
 * Take the `#pair=` secret captured at boot. The first call returns it; every
 * later call returns null. main.js posts it once and stores it nowhere.
 *
 * @returns {string | null}
 */
export function takeBootPairSecret() {
  const secret = pendingPairSecret;
  pendingPairSecret = null;
  return secret;
}
