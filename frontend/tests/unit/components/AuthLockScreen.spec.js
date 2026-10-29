import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import api from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import AuthLockScreen from "@/components/settings/auth/AuthLockScreen.vue";

function httpError(status, detail, options = {}) {
  return {
    response: { status, data: { detail }, headers: options.headers || {} },
    config: { url: options.url || "/auth/login" },
  };
}

function mountLock() {
  return mount(AuthLockScreen, {
    attachTo: document.body,
    global: { stubs: { PhoneSetupCard: true } },
  });
}

describe("AuthLockScreen", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("renders the setup variant when no password is configured", () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: false, authenticated: false });

    const wrapper = mountLock();

    expect(wrapper.text()).toContain("Choose an admin password");
    expect(wrapper.text()).toContain("Anyone on your network who knows it can change Calvin.");
    expect(wrapper.text()).toContain("Repeat password");
  });

  it("renders the sign-in variant when configured but locked", () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });

    const wrapper = mountLock();

    expect(wrapper.text()).toContain("Sign in to Settings");
    expect(wrapper.text()).not.toContain("Repeat password");
    expect(wrapper.text()).toContain("Forgot the password?");
  });

  it("shows the unreachable state when the status check failed", () => {
    const auth = useAuthStore();
    auth.status = "unreachable";

    const wrapper = mountLock();

    expect(wrapper.text()).toContain("Can't reach Calvin");
    expect(wrapper.find("[data-test='auth-unreachable']").exists()).toBe(true);
  });

  it("validates the setup fields on submit before sending a request", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: false, authenticated: false });
    const wrapper = mountLock();

    await wrapper.get("#auth-setup-password").setValue("short");
    await wrapper.get("#auth-setup-repeat").setValue("short");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Use at least 8 characters.");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("switches setup to sign-in with the warn banner on 409", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: false, authenticated: false });
    api.post.mockRejectedValueOnce(httpError(409, { code: "already_configured" }));
    const wrapper = mountLock();

    await wrapper.get("#auth-setup-password").setValue("correct horse");
    await wrapper.get("#auth-setup-repeat").setValue("correct horse");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Sign in to Settings");
    expect(wrapper.text()).toContain(
      "Someone else set the admin password a moment ago. Sign in with it, or ask them for it."
    );
    expect(auth.status).toBe("locked");
  });

  it("keeps a wrong password, shows the field error and refocuses it", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    api.post.mockRejectedValueOnce(httpError(401, { code: "bad_password" }));
    const wrapper = mountLock();

    await wrapper.get("#auth-signin-password").setValue("hunter22");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("That's not the admin password.");
    expect(wrapper.get("#auth-signin-password").element.value).toBe("hunter22");
    expect(document.activeElement).toBe(wrapper.get("#auth-signin-password").element);
  });

  it("disables the form on 429 and re-enables it when the countdown ends", async () => {
    vi.useFakeTimers();
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    api.post.mockRejectedValueOnce(
      httpError(429, { code: "rate_limited", retry_after: 3 }, { headers: { "retry-after": "3" } })
    );
    const wrapper = mountLock();

    await wrapper.get("#auth-signin-password").setValue("wrong");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Too many wrong passwords. Try again in 0:03.");
    expect(wrapper.get("#auth-signin-password").attributes("disabled")).toBeDefined();

    vi.advanceTimersByTime(3000);
    await nextTick();

    expect(wrapper.text()).not.toContain("Too many wrong passwords.");
    expect(wrapper.get("#auth-signin-password").attributes("disabled")).toBeUndefined();
  });

  it("switches back to setup when login answers setup_required", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    api.post.mockRejectedValueOnce(httpError(401, { code: "setup_required" }));
    const wrapper = mountLock();

    await wrapper.get("#auth-signin-password").setValue("whatever");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Choose an admin password");
    expect(wrapper.text()).toContain("Calvin's admin password was reset. Choose a new one.");
  });

  it("shows the network banner and keeps the typed values", async () => {
    const auth = useAuthStore();
    auth.applyStatus({ configured: true, authenticated: false });
    api.post.mockRejectedValueOnce(new Error("offline"));
    const wrapper = mountLock();

    await wrapper.get("#auth-signin-password").setValue("typed-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Couldn't reach Calvin. Check the connection and try again.");
    expect(wrapper.get("#auth-signin-password").element.value).toBe("typed-password");
  });
});
