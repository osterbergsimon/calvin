import { captureKioskIdentity } from "./kioskId";

// Boot the kiosk identity before the router module is evaluated (this module is
// the first import in main.js). Vue Router captures window.location when
// createWebHistory() runs; if the #pair= fragment were still there, its first
// navigation would put the secret back into the address bar. Reading and
// removing it here means the router never sees it (design §6, §14).
const pairSecret = captureKioskIdentity();

export const bootPairSecret = pairSecret;
