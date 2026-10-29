import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import api from "@/services/api";
import { useNotificationsStore } from "@/stores/notifications";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { path: "/" } } }),
  useRoute: () => ({ path: "/", query: {} }),
}));

import KeyboardHandler from "@/components/KeyboardHandler.vue";

function press(code) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code }));
}

function release(code) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code }));
}

describe("KeyboardHandler reboot combo (CLV-9 §7)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("posts the reboot through the shared api client so a 401 reaches the interceptor", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rebootComboKey1: "KEY_1",
          rebootComboKey2: "KEY_7",
          rebootComboDuration: 1,
        }),
      })
    );

    const wrapper = mount(KeyboardHandler, {
      global: { stubs: { NotificationSystem: true } },
    });
    await flushPromises();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith("/system/reboot");

    release("Digit1");
    release("Digit7");
    wrapper.unmount();
  });

  it("does not announce a reboot when the 401 opened the sign-in dialog", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rebootComboKey1: "KEY_1",
          rebootComboKey2: "KEY_7",
          rebootComboDuration: 1,
        }),
      })
    );
    const rejected = Object.assign(new Error("unauthorized"), { adminRequired: true });
    api.post.mockRejectedValueOnce(rejected);

    const notifications = useNotificationsStore();
    const wrapper = mount(KeyboardHandler, {
      global: { stubs: { NotificationSystem: true } },
    });
    await flushPromises();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(notifications.items.some(item => item.message.includes("rebooting"))).toBe(false);

    release("Digit1");
    release("Digit7");
    wrapper.unmount();
  });

  it("surfaces the server's reason when the host refuses the reboot", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rebootComboKey1: "KEY_1",
          rebootComboKey2: "KEY_7",
          rebootComboDuration: 1,
        }),
      })
    );
    const message = "Calvin does not own this machine.";
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { detail: { code: "host_control_disabled", message } },
      },
      config: { url: "/system/reboot" },
    });

    const notifications = useNotificationsStore();
    const wrapper = mount(KeyboardHandler, {
      global: { stubs: { NotificationSystem: true } },
    });
    await flushPromises();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(notifications.items.map(item => item.message)).toContain(message);
    expect(notifications.items.some(item => item.message.includes("rebooting"))).toBe(false);

    release("Digit1");
    release("Digit7");
    wrapper.unmount();
  });
});
