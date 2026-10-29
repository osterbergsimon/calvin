import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import axios from "axios";
import api, { handleUnauthorized } from "@/services/api";
import { useAuthStore } from "@/stores/auth";

// Capture the interceptors at module load, before beforeEach clears mock calls.
const apiOnRejected = api.interceptors.response.use.mock.calls[0][1];
const axiosOnRejected = axios.interceptors.response.use.mock.calls.at(-1)[1];

function adminError(status, code, url) {
  return {
    response: { status, data: { detail: { code } }, headers: {} },
    config: { url },
  };
}

describe("401 interceptor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("opens the dialog for admin_required and flags the original error", async () => {
    const auth = useAuthStore();
    const error = adminError(401, "admin_required", "/api/system/reboot");

    await expect(apiOnRejected(error)).rejects.toBe(error);

    expect(error.adminRequired).toBe(true);
    expect(auth.dialog.open).toBe(true);
    expect(auth.dialog.mode).toBe("signin");
    expect(auth.dialog.action.settingId).toBe("device-reboot");
  });

  it("opens the no-password variant for setup_required", () => {
    const auth = useAuthStore();

    handleUnauthorized(adminError(401, "setup_required", "/system/update"));

    expect(auth.dialog.open).toBe(true);
    expect(auth.dialog.mode).toBe("setup");
    expect(auth.dialog.action.settingId).toBe("maintenance-updates");
  });

  it("ignores a 401 from /api/auth/login", async () => {
    const auth = useAuthStore();
    const error = adminError(401, "bad_password", "/api/auth/login");

    await expect(apiOnRejected(error)).rejects.toBe(error);

    expect(auth.dialog.open).toBe(false);
    expect(error.adminRequired).toBeUndefined();
  });

  it("also catches 401s on the default axios instance", async () => {
    const auth = useAuthStore();
    const error = adminError(401, "admin_required", "/api/system/reboot");

    await axiosOnRejected(error).catch(() => {});

    expect(auth.dialog.open).toBe(true);
  });

  it("leaves other 401s alone", () => {
    const auth = useAuthStore();

    handleUnauthorized(adminError(401, "bad_password", "/api/system/reboot"));

    expect(auth.dialog.open).toBe(false);
  });
});
