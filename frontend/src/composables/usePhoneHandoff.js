import { computed, onScopeDispose, readonly, ref } from "vue";
import { isPhoneWidth } from "../styles/breakpoints.js";
import { useTouchCapability } from "./useTouchCapability";

/**
 * "Should this screen show a phone hand-off (QR)?" — CLV-20.
 *
 * Same rule as the CLV-9 lock screen and the admin sign-in dialog: a touch
 * screen wider than a phone (src/styles/breakpoints.js) has no usable keyboard, so it gets the
 * QR. Phones (narrow) and laptops (fine pointer) can type already, so they
 * never see one.
 */
export function usePhoneHandoff() {
  const { isTouch } = useTouchCapability();
  const width = ref(typeof window === "undefined" ? 0 : window.innerWidth);

  if (typeof window !== "undefined") {
    const updateWidth = () => {
      width.value = window.innerWidth;
    };
    window.addEventListener("resize", updateWidth);
    onScopeDispose(() => window.removeEventListener("resize", updateWidth));
  }

  const isPhoneHandoff = computed(() => isTouch.value && !isPhoneWidth(width.value));

  return { isPhoneHandoff, width: readonly(width) };
}
