import { ref } from "vue";

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
    Boolean(url) && resolveLinkAction(getRegionAction(), itemAction) !== "off";

  const openLink = (url, itemAction) => {
    if (!url) return;
    const action = resolveLinkAction(getRegionAction(), itemAction);
    if (action === "off") return;
    overlay.value = { kind: action, url };
  };

  const closeOverlay = () => {
    overlay.value = null;
  };

  const fallbackToHandoff = () => {
    if (overlay.value?.kind === "embed") {
      overlay.value = { kind: "handoff", url: overlay.value.url };
    }
  };

  return { overlay, isClickable, openLink, closeOverlay, fallbackToHandoff };
}
