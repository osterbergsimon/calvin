import { onScopeDispose, ref, unref } from "vue";
import { useSecurityStore } from "../stores/security";

// A frame the page's CSP blocks (frame-src) does not fire `error`: the browser
// reports a securitypolicyviolation on the document, then fires `load` on the
// blank frame. blockedURI carries the ORIGIN only, so the match is on origin.
// (X-Frame-Options refusals leave no such event and stay undetectable.)
//
// The listener is registered during setup, before the iframe exists, so it is in
// place when the frame's src takes effect. `blocked` stays true through the
// later `load`; call reset() when the url changes or the frame is retried.
function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function useFrameBlockDetection(url, onBlocked) {
  const blocked = ref(false);
  // Only read once a block happened, and only if the viewer can: adding to the
  // allowed list does nothing while sealed mode is on, so the copy differs.
  const sealed = ref(false);
  async function lookUpSealed() {
    try {
      sealed.value = Boolean(await useSecurityStore().fetchSealedMode());
    } catch {
      sealed.value = false;
    }
  }

  function onViolation(event) {
    const directive = event.effectiveDirective || event.violatedDirective || "";
    if (!directive.startsWith("frame-src")) return;
    const frameOrigin = originOf(unref(url));
    if (!frameOrigin || originOf(event.blockedURI) !== frameOrigin) return;
    blocked.value = true;
    onBlocked?.();
    lookUpSealed();
  }

  document.addEventListener("securitypolicyviolation", onViolation);
  onScopeDispose(() => document.removeEventListener("securitypolicyviolation", onViolation));

  return { blocked, sealed, reset: () => (blocked.value = false) };
}
