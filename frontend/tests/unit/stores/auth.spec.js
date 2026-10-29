import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import {
  actionForUrl,
  authErrorCode,
  retryAfterSeconds,
  useAuthStore,
} from "@/stores/auth";

function httpError(status, detail, options = {}) {
  return {
    response: {
      status,
      data: { detail },
      headers: options.headers || {},
    },
    config: { url: options.url || "/system/reboot" },
  };
}

describe("auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("starts in checking and applies the status payload", async () => {
    const auth = useAuthStore();
    expect(auth.status).toBe("checking");

    api.get.mockResolvedValueOnce({ data: { configured: true, authenticated: false } });
    await auth.fetchStatus();

    expect(api.get).toHaveBeenCalledWith("/auth/status");
    expect(auth.configured).toBe(true);
    expect(auth.authenticated).toBe(false);
    expect(auth.status).toBe("locked");
  });

  it("maps status to setup, locked, authenticated and unreachable", async () => {
    const auth = useAuthStore();

    api.get.mockResolvedValueOnce({ data: { configured: false, authenticated: false } });
    await auth.fetchStatus();
    expect(auth.status).toBe("setup");

    auth.applyStatus({ configured: true, authenticated: true });
    expect(auth.status).toBe("authenticated");

    api.get.mockRejectedValueOnce(new Error("network"));
    await auth.fetchStatus();
    expect(auth.status).toBe("unreachable");
  });

  it("sets up the first password and becomes authenticated", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: false, authenticated: false });
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    await auth.setup("correct horse");

    expect(api.post).toHaveBeenCalledWith("/auth/setup", { password: "correct horse" });
    expect(auth.status).toBe("authenticated");
    expect(auth.configured).toBe(true);
  });

  it("turns a 409 setup into the sign-in variant", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: false, authenticated: false });
    api.post.mockRejectedValueOnce(httpError(409, { code: "already_configured" }));

    const error = await auth.setup("correct horse").catch(e => e);

    expect(auth.status).toBe("locked");
    expect(auth.configured).toBe(true);
    expect(authErrorCode(error)).toBe("already_configured");
  });

  it("signs in and marks the session authenticated", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    await auth.login("correct horse");

    expect(api.post).toHaveBeenCalledWith("/auth/login", { password: "correct horse" });
    expect(auth.status).toBe("authenticated");
  });

  it("switches to setup when login answers setup_required", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    api.post.mockRejectedValueOnce(httpError(401, { code: "setup_required" }));

    await auth.login("whatever").catch(() => {});

    expect(auth.status).toBe("setup");
    expect(auth.configured).toBe(false);
  });

  it("clears local state even when logout fails on the network", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: true });
    api.post.mockRejectedValueOnce(new Error("offline"));

    await auth.logout();

    expect(auth.status).toBe("locked");
    expect(auth.authenticated).toBe(false);
  });

  it("changes the password and keeps this session signed in", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: true });
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    await auth.changePassword("old-password", "new-password");

    expect(api.post).toHaveBeenCalledWith("/auth/password", {
      current: "old-password",
      new: "new-password",
    });
    expect(auth.authenticated).toBe(true);
  });

  describe("in-place sign-in dialog", () => {
    it("opens once and ignores further 401s while open", () => {
      const auth = useAuthStore();

      auth.requestSignIn({ action: actionForUrl("/api/system/reboot") });
      auth.requestSignIn({ action: actionForUrl("/api/system/update") });

      expect(auth.dialog.open).toBe(true);
      expect(auth.dialog.action.verb).toBe("reboot");
    });

    it("flags the original error and opens the dialog on admin_required", () => {
      const auth = useAuthStore();
      const error = httpError(401, { code: "admin_required" }, { url: "/system/reboot" });

      expect(auth.handleUnauthorized(error)).toBe(true);
      expect(error.adminRequired).toBe(true);
      expect(auth.dialog.open).toBe(true);
      expect(auth.dialog.mode).toBe("signin");
      expect(auth.dialog.action.settingId).toBe("device-reboot");
    });

    it("opens the no-password variant on setup_required", () => {
      const auth = useAuthStore();
      const error = httpError(401, { code: "setup_required" }, { url: "/system/reboot" });

      auth.handleUnauthorized(error);

      expect(auth.dialog.mode).toBe("setup");
    });

    it("ignores 401s from /api/auth/* and non-admin codes", () => {
      const auth = useAuthStore();

      expect(
        auth.handleUnauthorized(httpError(401, { code: "bad_password" }, { url: "/auth/login" }))
      ).toBe(false);
      expect(auth.handleUnauthorized(httpError(401, { code: "bad_password" }))).toBe(false);
      expect(auth.dialog.open).toBe(false);
    });

    it("closes without replaying anything", () => {
      const auth = useAuthStore();
      auth.requestSignIn({ action: actionForUrl("/api/system/reboot") });

      auth.closeSignIn();

      expect(auth.dialog.open).toBe(false);
    });
  });

  describe("action map", () => {
    it("picks reboot copy and the reboot setting", () => {
      const action = actionForUrl("/api/system/reboot");
      expect(action.verb).toBe("reboot");
      expect(action.gerund).toBe("Rebooting Calvin");
      expect(action.settingId).toBe("device-reboot");
      expect(action.title).toBe("Sign in to reboot");
      expect(action.toast).toBe("Signed in. Reboot again to continue.");
    });

    it("picks update copy for update routes", () => {
      const action = actionForUrl("/system/update/status");
      expect(action.verb).toBe("update");
      expect(action.settingId).toBe("maintenance-updates");
    });

    it("falls back to the generic continue copy", () => {
      const action = actionForUrl("/config");
      expect(action.verb).toBe("continue");
      expect(action.title).toBe("Sign in to continue");
      expect(action.toast).toBe("Signed in. Try again to continue.");
      expect(action.settingId).toBe(null);
    });
  });

  it("reads Retry-After from the header, then the body, then falls back to 60", () => {
    expect(retryAfterSeconds(httpError(429, { retry_after: 12 }, { headers: { "retry-after": "47" } }))).toBe(47);
    expect(retryAfterSeconds(httpError(429, { retry_after: 12 }))).toBe(12);
    expect(retryAfterSeconds(httpError(429, {}))).toBe(60);
  });
});
