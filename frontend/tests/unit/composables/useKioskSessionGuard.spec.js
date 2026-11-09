import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";
import {
  useKioskSessionGuard,
  holdKioskSession,
  KIOSK_IDLE_MS,
  TOUCH_EVERY_MS,
  STATUS_EVERY_MS,
} from "@/composables/useKioskSessionGuard";

// calvin-q4o8: on a kiosk the page signs out when the server's idle limit is up,
// keeps the server's clock fed while someone touches the screen (or a display
// check this page started is running), and notices when the server ended the
// session. It follows the SESSION's kind, not a ?kiosk= id: an all-in-one kiosk
// or a kiosk behind a proxy has none.
describe("useKioskSessionGuard", () => {
  let scope;
  let router;

  function start({ kind = "kiosk", idleSeconds = 300, authenticated = true } = {}) {
    const auth = useAuthStore();
    api.get.mockResolvedValue({
      data: {
        configured: true,
        authenticated,
        session: authenticated ? kind : null,
        idleSeconds: authenticated ? idleSeconds : null,
      },
    });
    auth.applyStatus({
      configured: true,
      authenticated,
      session: authenticated ? kind : null,
      idleSeconds: authenticated ? idleSeconds : null,
    });
    scope = effectScope();
    scope.run(() => useKioskSessionGuard({ router }));
    return auth;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    router = { push: vi.fn(), currentRoute: { value: { path: "/settings" } } };
    api.post.mockResolvedValue({
      data: { authenticated: true, session: "kiosk", idleSeconds: 300 },
    });
  });

  afterEach(() => {
    scope?.stop();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("is 5 minutes by default", () => {
    expect(KIOSK_IDLE_MS).toBe(5 * 60 * 1000);
  });

  it("signs out when the idle limit is up, with the reason already set, and returns to the dashboard", async () => {
    let reasonAtLogout = null;
    api.post.mockImplementation(async url => {
      if (url === "/auth/logout") reasonAtLogout = useAuthStore().signedOutReason;
      return { data: {} };
    });
    const auth = start();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1);
    expect(api.post).toHaveBeenCalledWith("/auth/logout");
    expect(reasonAtLogout).toBe("idle");
    expect(auth.authenticated).toBe(false);
    expect(router.push).toHaveBeenCalledWith("/");
    const toasts = useNotificationsStore().items;
    expect(toasts.at(-1).message).toMatch(/signed out after 5 minutes without touch/i);
  });

  it("follows the idle limit the server reports", async () => {
    const auth = start({ idleSeconds: 90 });
    await vi.advanceTimersByTimeAsync(89 * 1000);
    expect(auth.authenticated).toBe(true);
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(auth.authenticated).toBe(false);
  });

  it("works for a kiosk session without any ?kiosk= id (all-in-one, behind a proxy)", async () => {
    sessionStorage.clear();
    const auth = start();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1);
    expect(auth.signedOutReason).toBe("idle");
  });

  it("does nothing for a device session", async () => {
    const auth = start({ kind: "device", idleSeconds: null });
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS * 3);
    expect(api.post).not.toHaveBeenCalled();
    expect(auth.authenticated).toBe(true);
  });

  it("a touch restarts the idle time and tells the server (throttled)", async () => {
    const auth = start();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS - 1000);
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS - 1000 - TOUCH_EVERY_MS - 2);
    expect(auth.authenticated).toBe(true);
    expect(api.post.mock.calls.filter(([url]) => url === "/auth/touch")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(TOUCH_EVERY_MS + 1);
    window.dispatchEvent(new Event("pointerdown"));
    expect(api.post.mock.calls.filter(([url]) => url === "/auth/touch")).toHaveLength(2);
  });

  it("notices when the server ended the session, in words that are true either way", async () => {
    const auth = start();
    api.get.mockResolvedValue({ data: { configured: true, authenticated: false } });
    await vi.advanceTimersByTimeAsync(STATUS_EVERY_MS + 1);
    expect(auth.authenticated).toBe(false);
    expect(auth.signedOutReason).toBe("ended");
    expect(router.push).toHaveBeenCalledWith("/"); // no password form left on the wall
  });

  it("does not start while signed out", async () => {
    start({ authenticated: false });
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS * 2);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("holds the session while a display check this page started is running", async () => {
    const auth = start();
    const release = holdKioskSession();
    // No touch for far longer than the idle limit: still signed in, and kept alive.
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS * 3);
    expect(auth.authenticated).toBe(true);
    const touches = api.post.mock.calls.filter(([url]) => url === "/auth/touch");
    expect(touches.length).toBeGreaterThanOrEqual(
      Math.floor((KIOSK_IDLE_MS * 3) / TOUCH_EVERY_MS) - 1
    );
    // Released: the idle time counts from now.
    release();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1);
    expect(auth.authenticated).toBe(false);
  });

  it("a touch answer that lands after the sign-out cannot bring the session back", async () => {
    const order = [];
    let resolveTouch;
    api.post.mockImplementation(url => {
      if (url === "/auth/touch") {
        return new Promise(resolve => {
          resolveTouch = () => {
            order.push("touch answered");
            resolve({ data: { authenticated: true } });
          };
        });
      }
      order.push(url);
      return Promise.resolve({ data: {} });
    });
    const auth = start();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS - 10);
    window.dispatchEvent(new Event("pointerdown")); // a touch is now in flight
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1); // and the page times out
    expect(order).not.toContain("/auth/logout"); // waits for the touch to settle first
    resolveTouch();
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(["touch answered", "/auth/logout"]);
    expect(auth.authenticated).toBe(false);
  });

  it("an explicit sign-out also waits for a touch in flight", async () => {
    const order = [];
    let resolveTouch;
    api.post.mockImplementation(url => {
      if (url === "/auth/touch") {
        return new Promise(resolve => {
          resolveTouch = () => {
            order.push("touch answered");
            resolve({ data: { authenticated: true } });
          };
        });
      }
      order.push(url);
      return Promise.resolve({ data: {} });
    });
    const auth = start();
    const pending = auth.touch();
    const out = auth.logout();
    await nextTick();
    expect(order).toEqual([]);
    resolveTouch();
    await pending;
    await out;
    expect(order).toEqual(["touch answered", "/auth/logout"]);
  });

  // The page signs in AFTER the guard exists (Settings mounts, then the password is
  // typed), so the guard must pick the kind up from the sign-in itself.
  it("starts for a fresh sign-in through the real login(), with no status check in between", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    scope = effectScope();
    scope.run(() => useKioskSessionGuard({ router }));
    api.post.mockResolvedValue({ data: { ok: true, session: "kiosk", idleSeconds: 300 } });
    api.get.mockResolvedValue({
      data: { configured: true, authenticated: true, session: "kiosk", idleSeconds: 300 },
    });
    await auth.login("pw-123456");
    expect(auth.sessionKind).toBe("kiosk");
    await nextTick();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1);
    expect(api.post).toHaveBeenCalledWith("/auth/logout");
    expect(auth.signedOutReason).toBe("idle");
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("starts after the real setup() too", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: false, authenticated: false });
    scope = effectScope();
    scope.run(() => useKioskSessionGuard({ router }));
    api.post.mockResolvedValue({ data: { ok: true, session: "kiosk", idleSeconds: 300 } });
    api.get.mockResolvedValue({
      data: { configured: true, authenticated: true, session: "kiosk", idleSeconds: 300 },
    });
    await auth.setup("pw-123456", "ABCD-EFGH");
    await nextTick();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1);
    expect(auth.signedOutReason).toBe("idle");
  });

  it("asks the server for the kind when the sign-in answer does not carry it (older server)", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    scope = effectScope();
    scope.run(() => useKioskSessionGuard({ router }));
    api.post.mockResolvedValue({ data: { ok: true } });
    api.get.mockResolvedValue({
      data: { configured: true, authenticated: true, session: "kiosk", idleSeconds: 300 },
    });
    await auth.login("pw-123456");
    expect(api.get).toHaveBeenCalledWith("/auth/status");
    expect(auth.sessionKind).toBe("kiosk");
  });
});
