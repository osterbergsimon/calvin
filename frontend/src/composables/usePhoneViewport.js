import { onMounted, onUnmounted, ref } from "vue";
import { isPhone } from "@/styles/breakpoints";

// Reactive "is this a phone layout" for components that change structure, not
// only CSS, on a phone. Uses the same rule as (--bp-phone): breakpoints.js
// reads the kiosk and layout-override classes on <html>, so a kiosk or a
// browser forced to the desktop layout is never treated as a phone.
const detect = () =>
  typeof window !== "undefined" &&
  typeof window.innerWidth === "number" &&
  isPhone(window.innerWidth, window.innerHeight);

export function usePhoneViewport() {
  const phone = ref(detect());
  const refresh = () => {
    phone.value = detect();
  };
  onMounted(() => {
    refresh();
    window.addEventListener("resize", refresh, { passive: true });
  });
  onUnmounted(() => window.removeEventListener("resize", refresh));
  return phone;
}
