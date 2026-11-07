import { onUnmounted, readonly, ref } from "vue";
import { EFFECTS_LEVEL_ATTRIBUTE } from "@/utils/effectsLevel";

/**
 * The resolved effects level on <html> (calvin-uudb), for the rare visual that
 * must choose a different source rather than just a different CSS rule.
 *
 * Most effects gate in CSS with `[data-effects="full"]`; the photo backdrop
 * instead picks the small upscaled copy under Standard and the photo itself
 * under Full. Reading the attribute keeps that choice on the same contract.
 * A missing attribute (SSR, a unit test) is Standard: the cheap, safe default.
 */
export function useEffectsAttribute(
  root = typeof document === "undefined" ? null : document.documentElement
) {
  const read = () => (root?.getAttribute(EFFECTS_LEVEL_ATTRIBUTE) === "full" ? "full" : "standard");
  const level = ref(read());

  let observer = null;
  if (root && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      level.value = read();
    });
    observer.observe(root, { attributes: true, attributeFilter: [EFFECTS_LEVEL_ATTRIBUTE] });
  }
  onUnmounted(() => observer?.disconnect());

  return readonly(level);
}
