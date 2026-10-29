import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import api from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import AdminAccessSection from "@/components/settings/categories/security/AdminAccessSection.vue";

function httpError(status, detail, options = {}) {
  return {
    response: { status, data: { detail }, headers: options.headers || {} },
    config: { url: options.url || "/auth/password" },
  };
}

function mountSection() {
  const auth = useAuthStore();
  auth.applyStatus({ configured: true, authenticated: true });
  return { auth, wrapper: mount(AdminAccessSection) };
}

async function openForm(wrapper) {
  await wrapper.get("[data-test='admin-change-password']").trigger("click");
  await flushPromises();
}

async function fill(wrapper, current, next) {
  await wrapper.get("#admin-current-password").setValue(current);
  await wrapper.get("#admin-new-password").setValue(next);
}

describe("AdminAccessSection", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("renders the signed-in row with the status dot and Sign out", () => {
    const { wrapper } = mountSection();
    expect(wrapper.text()).toContain("Signed in on this device");
    expect(wrapper.find(".setting-row__dot").exists()).toBe(true);
    expect(wrapper.text()).toContain("Sign out");
  });

  it("signs out and shows the lock screen state", async () => {
    const { auth, wrapper } = mountSection();
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    await wrapper.get("[data-test='admin-sign-out']").trigger("click");
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/auth/logout");
    expect(auth.status).toBe("locked");
    expect(auth.authenticated).toBe(false);
  });

  it("validates the change form before any request", async () => {
    const { wrapper } = mountSection();
    await openForm(wrapper);

    await wrapper.get("[data-test='admin-change-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Enter your current password.");
    expect(api.post).not.toHaveBeenCalled();

    await fill(wrapper, "old-password", "short");
    await wrapper.get("[data-test='admin-change-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Use at least 8 characters.");
    expect(api.post).not.toHaveBeenCalled();

    await fill(wrapper, "same-password", "same-password");
    await wrapper.get("[data-test='admin-change-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Choose a password different from the current one.");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows the wrong-current-password error on the Current field", async () => {
    const { wrapper } = mountSection();
    await openForm(wrapper);
    await fill(wrapper, "wrong-password", "new-password-1");
    api.post.mockRejectedValueOnce(httpError(401, { code: "bad_password" }));

    await wrapper.get("[data-test='admin-change-form']").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("That's not the current password.");
  });

  it("collapses the form and keeps the confirmation until the tab is left", async () => {
    const { wrapper } = mountSection();
    await openForm(wrapper);
    await fill(wrapper, "old-password", "new-password-1");
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    await wrapper.get("[data-test='admin-change-form']").trigger("submit");
    await flushPromises();

    expect(wrapper.find("[data-test='admin-change-form']").exists()).toBe(false);
    expect(wrapper.text()).toContain("✓ Password changed. Other devices were signed out.");
    expect(wrapper.find("[role='status']").text()).toContain("Password changed");
  });

  it("disables the fields on 429 and re-enables at 0", async () => {
    vi.useFakeTimers();
    const { wrapper } = mountSection();
    await openForm(wrapper);
    await fill(wrapper, "wrong-password", "new-password-1");
    api.post.mockRejectedValueOnce(
      httpError(429, { code: "rate_limited", retry_after: 2 }, { headers: { "retry-after": "2" } })
    );

    await wrapper.get("[data-test='admin-change-form']").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Too many wrong passwords. Try again in 0:02.");
    expect(wrapper.get("#admin-current-password").attributes("disabled")).toBeDefined();

    vi.advanceTimersByTime(2000);
    await nextTick();

    expect(wrapper.text()).not.toContain("Too many wrong passwords.");
    expect(wrapper.get("#admin-current-password").attributes("disabled")).toBeUndefined();
  });
});
