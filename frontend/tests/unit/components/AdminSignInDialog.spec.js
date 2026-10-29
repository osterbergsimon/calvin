import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { useAuthStore, actionForUrl } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";
import api from "@/services/api";
import AdminSignInDialog from "@/components/auth/AdminSignInDialog.vue";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ path: "/", query: {} }),
}));

function mountDialog() {
  return mount(AdminSignInDialog, {
    global: { stubs: { PhoneSetupCard: true } },
  });
}

describe("AdminSignInDialog", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("renders nothing until the store opens it", () => {
    const wrapper = mountDialog();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it("uses the action map for the title and lead", () => {
    const auth = useAuthStore();
    auth.requestSignIn({ action: actionForUrl("/api/system/reboot") });

    const wrapper = mountDialog();

    expect(wrapper.text()).toContain("Sign in to reboot");
    expect(wrapper.text()).toContain("Rebooting Calvin needs the admin password.");
  });

  it("signs in once, closes, and never replays the failed request", async () => {
    const auth = useAuthStore();
    const notifications = useNotificationsStore();
    auth.requestSignIn({ action: actionForUrl("/api/system/reboot") });
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    const wrapper = mountDialog();
    await wrapper.get("#admin-signin-dialog-password").setValue("correct horse");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/auth/login", { password: "correct horse" });
    expect(auth.dialog.open).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(notifications.items.map(item => item.message)).toContain(
      "Signed in. Reboot again to continue."
    );
  });

  it("shows the generic toast for a non-reboot action", async () => {
    const auth = useAuthStore();
    const notifications = useNotificationsStore();
    auth.requestSignIn({ action: actionForUrl("/config") });
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    const wrapper = mountDialog();
    await wrapper.get("#admin-signin-dialog-password").setValue("correct horse");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(notifications.items.map(item => item.message)).toContain(
      "Signed in. Try again to continue."
    );
  });

  it("shows the wrong-password error and keeps the value", async () => {
    const auth = useAuthStore();
    auth.requestSignIn({ action: actionForUrl("/api/system/update") });
    api.post.mockRejectedValueOnce({
      response: { status: 401, data: { detail: { code: "bad_password" } }, headers: {} },
      config: { url: "/auth/login" },
    });

    const wrapper = mountDialog();
    await wrapper.get("#admin-signin-dialog-password").setValue("nope");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("That's not the admin password.");
    expect(wrapper.get("#admin-signin-dialog-password").element.value).toBe("nope");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it("renders the no-password variant on setup_required", async () => {
    const auth = useAuthStore();
    auth.requestSignIn({ mode: "setup", action: actionForUrl("/api/system/reboot") });

    const wrapper = mountDialog();

    expect(wrapper.text()).toContain("No admin password yet");
    expect(wrapper.text()).toContain(
      "Rebooting Calvin needs an admin password, and none has been set. Choose one in Settings first."
    );
    expect(wrapper.find("#admin-signin-dialog-password").exists()).toBe(false);
    expect(wrapper.text()).toContain("Open Settings");
  });

  it("counts down a 429 and disables sign-in", async () => {
    vi.useFakeTimers();
    const auth = useAuthStore();
    auth.requestSignIn({ action: actionForUrl("/api/system/reboot") });
    api.post.mockRejectedValueOnce({
      response: {
        status: 429,
        data: { detail: { code: "rate_limited", retry_after: 2 } },
        headers: { "retry-after": "2" },
      },
      config: { url: "/auth/login" },
    });

    const wrapper = mountDialog();
    await wrapper.get("#admin-signin-dialog-password").setValue("nope");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Too many wrong passwords. Try again in 0:02.");
    expect(wrapper.get("#admin-signin-dialog-password").attributes("disabled")).toBeDefined();

    vi.advanceTimersByTime(2000);
    await flushPromises();

    expect(wrapper.text()).not.toContain("Too many wrong passwords.");
    expect(wrapper.get("#admin-signin-dialog-password").attributes("disabled")).toBeUndefined();
  });

  it("closes on Escape and drops the typed password", async () => {
    const auth = useAuthStore();
    auth.requestSignIn({ action: actionForUrl("/api/system/reboot") });
    const wrapper = mountDialog();

    await wrapper.get("#admin-signin-dialog-password").setValue("typed");
    await wrapper.get('[role="dialog"]').trigger("keydown", { key: "Escape" });

    expect(auth.dialog.open).toBe(false);
  });
});
