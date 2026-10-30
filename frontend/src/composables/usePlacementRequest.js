import { ref } from "vue";

/**
 * A one-shot request to open Pages & regions in "place a source here" mode.
 *
 * Content's "Put it on a page" and Plugins' "Used by" links both live in other
 * Settings categories; a module-level ref carries the intent across the
 * category remount without storing anything durable (nothing to go stale).
 */
const placement = ref(null);

export function usePlacementRequest() {
  const requestPlacement = next => {
    placement.value = next;
  };
  const clearPlacement = () => {
    placement.value = null;
  };
  return { placement, requestPlacement, clearPlacement };
}
