import { ref } from "vue";
import { isHttpUrl } from "../utils/safeUrl";

// Region overrides may disable a link; a plugin hint never does.
const REGION_ACTIONS = ["handoff", "embed", "off"];
const ITEM_ACTIONS = ["handoff", "embed"];

/**
 * Effective link action: region override > item hint > "handoff".
 * Invalid/absent values fall through to the next source.
 */
export function resolveLinkAction(regionAction, itemAction) {
  const region = REGION_ACTIONS.includes(regionAction) ? regionAction : null;
  const item = ITEM_ACTIONS.includes(itemAction) ? itemAction : null;
  return region || item || "handoff";
}

/**
 * Owns overlay state for a link-emitting renderer. `getRegionAction` is a
 * getter so the per-region override stays reactive to the renderer's prop.
 * overlay: null | { kind: "handoff" | "embed", url }.
 */
export function useLinkOpen(getRegionAction) {
  const overlay = ref(null);

  const isClickable = (url, itemAction) =>
    isHttpUrl(url) && resolveLinkAction(getRegionAction(), itemAction) !== "off";

  const openLink = (url, itemAction) => {
    if (!isHttpUrl(url)) return;
    const action = resolveLinkAction(getRegionAction(), itemAction);
    if (action === "off") return;
    overlay.value = { kind: action, url };
  };

  const closeOverlay = () => {
    overlay.value = null;
  };

  // The site refused embedding: back to the QR handoff, flagged so a kiosk does
  // not offer Open again (it would only loop back into the refused embed).
  const fallbackToHandoff = () => {
    if (overlay.value?.kind === "embed") {
      overlay.value = { kind: "handoff", url: overlay.value.url, embedRefused: true };
    }
  };

  // Kiosk Open: show the page inside Calvin instead of leaving it.
  const openEmbedded = () => {
    if (overlay.value?.kind === "handoff") {
      overlay.value = { kind: "embed", url: overlay.value.url };
    }
  };

  return { overlay, isClickable, openLink, closeOverlay, fallbackToHandoff, openEmbedded };
}
