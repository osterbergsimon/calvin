import { computed, onScopeDispose, readonly, ref } from "vue";
import { isPhone as isPhoneViewport } from "../styles/breakpoints.js";
import { useTouchCapability } from "./useTouchCapability";

/**
 * "Should this screen show a phone hand-off (QR)?" — CLV-20.
 *
 * Same rule as the CLV-9 lock screen and the admin sign-in dialog: a touch
 * screen that is not a phone (`isPhone`, src/styles/breakpoints.js) has no
 * usable keyboard, so it gets the QR. Phones (narrow, or a short landscape
 * screen that is not a kiosk) and laptops (fine pointer) can type already, so
 * they never see one.
 */
export function usePhoneHandoff() {
  const { isTouch } = useTouchCapability();
  const width = ref(typeof window === "undefined" ? 0 : window.innerWidth);
  const height = ref(typeof window === "undefined" ? 0 : window.innerHeight);

  if (typeof window !== "undefined") {
    const updateSize = () => {
      width.value = window.innerWidth;
      height.value = window.innerHeight;
    };
    window.addEventListener("resize", updateSize);
    onScopeDispose(() => window.removeEventListener("resize", updateSize));
  }

  const isPhone = computed(() => isPhoneViewport(width.value, height.value));
  const isPhoneHandoff = computed(() => isTouch.value && !isPhone.value);

  return { isPhoneHandoff, isPhone, width: readonly(width), height: readonly(height) };
}
