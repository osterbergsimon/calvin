import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { isLoopbackPage } from "@/utils/serverUrl";

/**
 * The one-time admin setup code, when this page may see it.
 *
 * `GET /api/auth/setup-code` answers only a loopback caller, so this is empty
 * on a phone, a laptop on the LAN, or a remote kiosk. The dashboard's several
 * empty regions share one request; the code is only used to put `?setup=` in
 * the phone hand-off QR on the server's own screen.
 */
const code = ref("");
let pending = null;

export function useSetupCode() {
  const auth = useAuthStore();

  async function load() {
    // Only the server's own screen may ask for it; a phone/LAN client would
    // only get a 403 (and a console error), so don't ask.
    if (!isLoopbackPage()) return "";
    if (code.value) return code.value;
    if (!pending) {
      pending = auth.fetchSetupCode().then(value => {
        code.value = value || "";
        return code.value;
      });
    }
    return pending;
  }

  return { code, load };
}

/** Test-only: reset the shared cache between specs. */
export function _resetSetupCodeForTests() {
  code.value = "";
  pending = null;
}
