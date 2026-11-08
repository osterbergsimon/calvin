import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import api from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import {
  useKioskSessionGuard,
  KIOSK_IDLE_MS,
  TOUCH_EVERY_MS,
  STATUS_EVERY_MS,
} from "@/composables/useKioskSessionGuard";

// calvin-q4o8: on a kiosk the page signs out after 5 minutes without touch and
// notices when the server ended the session (the screen went to sleep).
describe("useKioskSessionGuard", () => {
  let scope;

  function start(kiosk = "hall-1") {
    if (kiosk) sessionStorage.setItem("calvin_kiosk_id", kiosk);
    else sessionStorage.removeItem("calvin_kiosk_id");
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: true });
    scope = effectScope();
    scope.run(() => useKioskSessionGuard());
    return auth;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    api.post.mockResolvedValue({ data: { authenticated: true } });
    api.get.mockResolvedValue({ data: { configured: true, authenticated: true } });
  });

  afterEach(() => {
    scope?.stop();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("is 5 minutes", () => {
    expect(KIOSK_IDLE_MS).toBe(5 * 60 * 1000);
  });

  it("signs out after 5 minutes without a touch and says why", async () => {
    const auth = start();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1);
    expect(api.post).toHaveBeenCalledWith("/auth/logout");
    expect(auth.authenticated).toBe(false);
    expect(auth.signedOutReason).toBe("idle");
  });

  it("a touch restarts the 5 minutes and tells the server (throttled)", async () => {
    const auth = start();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS - 1000);
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS - 1000 - TOUCH_EVERY_MS - 2);
    expect(auth.authenticated).toBe(true);
    const touches = api.post.mock.calls.filter(([url]) => url === "/auth/touch");
    expect(touches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(TOUCH_EVERY_MS + 1);
    window.dispatchEvent(new Event("pointerdown"));
    expect(auth.authenticated).toBe(true);
    expect(api.post.mock.calls.filter(([url]) => url === "/auth/touch")).toHaveLength(2);
  });

  it("notices when the server ended the session (the screen slept)", async () => {
    const auth = start();
    api.get.mockResolvedValue({ data: { configured: true, authenticated: false } });
    await vi.advanceTimersByTimeAsync(STATUS_EVERY_MS + 1);
    expect(auth.authenticated).toBe(false);
    expect(auth.signedOutReason).toBe("ended");
  });

  it("does nothing on a phone or desktop (no kiosk id)", async () => {
    const auth = start(null);
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS * 2);
    expect(api.post).not.toHaveBeenCalled();
    expect(auth.authenticated).toBe(true);
  });

  it("does nothing while signed out, and starts when signing in", async () => {
    sessionStorage.setItem("calvin_kiosk_id", "hall-1");
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    scope = effectScope();
    scope.run(() => useKioskSessionGuard());
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS * 2);
    expect(api.get).not.toHaveBeenCalled();
    auth.applyStatus({ configured: true, authenticated: true });
    await nextTick();
    await vi.advanceTimersByTimeAsync(KIOSK_IDLE_MS + 1);
    expect(auth.signedOutReason).toBe("idle");
  });
});
