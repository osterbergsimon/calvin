import { defineStore } from "pinia";
import { computed, ref } from "vue";
import api from "@/services/api";
import { logError } from "@/utils/logger";

/**
 * Admin session state and the in-place sign-in dialog (CLV-9).
 *
 * The session itself is an HttpOnly cookie, so there is no token to store:
 * `GET /api/auth/status` is the source of truth and this store only mirrors it.
 */

const REBOOT_ACTION = Object.freeze({
  verb: "reboot",
  gerund: "Rebooting Calvin",
  settingId: "device-reboot",
  title: "Sign in to reboot",
  lead: "Rebooting Calvin needs the admin password.",
  setupLead:
    "Rebooting Calvin needs an admin password, and none has been set. Choose one in Settings first.",
  phoneTitle: "Reboot from your phone",
  phoneHint:
    "Signing in on your phone doesn't unlock this screen. Open this address, sign in, and reboot from there.",
  toast: "Signed in. Reboot again to continue.",
});

const UPDATE_ACTION = Object.freeze({
  verb: "update",
  gerund: "Updating Calvin",
  settingId: "maintenance-updates",
  title: "Sign in to update",
  lead: "Updating Calvin needs the admin password.",
  setupLead:
    "Updating Calvin needs an admin password, and none has been set. Choose one in Settings first.",
  phoneTitle: "Update from your phone",
  phoneHint:
    "Signing in on your phone doesn't unlock this screen. Open this address, sign in, and update from there.",
  toast: "Signed in. Update again to continue.",
});

const CONTINUE_ACTION = Object.freeze({
  verb: "continue",
  gerund: "This change",
  settingId: null,
  title: "Sign in to continue",
  lead: "This change needs the admin password.",
  setupLead:
    "This change needs an admin password, and none has been set. Choose one in Settings first.",
  phoneTitle: "Continue from your phone",
  phoneHint:
    "Signing in on your phone doesn't unlock this screen. Open this address and sign in there.",
  toast: "Signed in. Try again to continue.",
});

/**
 * The single place that turns a request URL into the dialog's copy.
 * Handles both the shared client's relative URL ("/system/reboot") and the
 * default axios instance's "/api/system/reboot".
 */
export function actionForUrl(rawUrl) {
  const path = String(rawUrl || "")
    .split("?")[0]
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api(?=\/|$)/, "");

  if (/^\/system\/reboot(?:\/|$)/.test(path)) return REBOOT_ACTION;
  if (/^\/system\/update(?:\/|$)/.test(path)) return UPDATE_ACTION;
  return CONTINUE_ACTION;
}

export function authErrorCode(error) {
  return error?.response?.data?.detail?.code ?? null;
}

/** Seconds to wait from a 429: Retry-After header, then detail, then 60. */
export function retryAfterSeconds(error) {
  const headers = error?.response?.headers;
  const header = headers?.["retry-after"] ?? headers?.get?.("retry-after");
  const fromHeader = Number(header);
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader);

  const fromBody = Number(error?.response?.data?.detail?.retry_after);
  if (Number.isFinite(fromBody) && fromBody > 0) return Math.ceil(fromBody);

  return 60;
}

const initialDialog = () => ({ open: false, mode: "signin", action: CONTINUE_ACTION });

export const useAuthStore = defineStore("auth", () => {
  // checking | unreachable | setup | locked | authenticated
  const status = ref("checking");
  const configured = ref(false);
  const authenticated = ref(false);
  const dialog = ref(initialDialog());

  const checking = computed(() => status.value === "checking");

  function applyStatus(data) {
    configured.value = Boolean(data?.configured);
    authenticated.value = Boolean(data?.authenticated);
    if (authenticated.value) status.value = "authenticated";
    else if (configured.value) status.value = "locked";
    else status.value = "setup";
  }

  async function fetchStatus() {
    try {
      const { data } = await api.get("/auth/status");
      applyStatus(data);
      return data;
    } catch (err) {
      logError("[auth]", "status check failed", err);
      status.value = "unreachable";
      return null;
    }
  }

  async function setup(password) {
    try {
      await api.post("/auth/setup", { password });
    } catch (err) {
      if (authErrorCode(err) === "already_configured") {
        configured.value = true;
        authenticated.value = false;
        status.value = "locked";
      }
      throw err;
    }
    configured.value = true;
    authenticated.value = true;
    status.value = "authenticated";
  }

  async function login(password) {
    try {
      await api.post("/auth/login", { password });
    } catch (err) {
      if (authErrorCode(err) === "setup_required") {
        configured.value = false;
        authenticated.value = false;
        status.value = "setup";
      }
      throw err;
    }
    configured.value = true;
    authenticated.value = true;
    status.value = "authenticated";
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // The cookie is HttpOnly: the server is the source of truth, so clear the
      // local view anyway and let the next status check settle it.
      logError("[auth]", "logout failed; clearing local session", err);
    } finally {
      authenticated.value = false;
      status.value = configured.value ? "locked" : "setup";
    }
  }

  async function changePassword(current, next) {
    await api.post("/auth/password", { current, new: next });
    authenticated.value = true;
    status.value = "authenticated";
  }

  /** Open the in-place dialog. Only one at a time; later 401s change nothing. */
  function requestSignIn({ action = CONTINUE_ACTION, mode = "signin" } = {}) {
    if (dialog.value.open) return;
    dialog.value = { open: true, mode, action };
  }

  function closeSignIn() {
    dialog.value = initialDialog();
  }

  function setDialogMode(mode) {
    dialog.value = { ...dialog.value, mode };
  }

  /** An admin route answered 401: flag the error and open the dialog in place. */
  function handleUnauthorized(error) {
    const response = error?.response;
    if (response?.status !== 401) return false;

    const code = authErrorCode(error);
    if (code !== "admin_required" && code !== "setup_required") return false;

    const url = String(error?.config?.url || "");
    // /api/auth/* 401s are form errors (setup, login, password) — §2 handles them.
    // API key management (CLV-32) has no form that reads a 401, so it opens the dialog.
    if (/(^|\/)auth\/(?!keys(\/|$|\?))/.test(url)) return false;

    error.adminRequired = true;
    requestSignIn({
      action: actionForUrl(url),
      mode: code === "setup_required" ? "setup" : "signin",
    });
    return true;
  }

  return {
    status,
    configured,
    authenticated,
    checking,
    dialog,
    applyStatus,
    fetchStatus,
    setup,
    login,
    logout,
    changePassword,
    requestSignIn,
    closeSignIn,
    setDialogMode,
    handleUnauthorized,
  };
});
