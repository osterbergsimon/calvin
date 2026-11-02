import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import api from "@/services/api";
import { useNotificationsStore } from "@/stores/notifications";
import { useConfigStore } from "@/stores/config";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { path: "/" } } }),
  useRoute: () => ({ path: "/", query: {} }),
}));

import KeyboardHandler from "@/components/KeyboardHandler.vue";

function press(code, repeat = false) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, repeat }));
}

function release(code) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code }));
}

function stubComboConfig(duration = 1000) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rebootComboKey1: "KEY_1",
        rebootComboKey2: "KEY_7",
        rebootComboDuration: duration,
      }),
    })
  );
}

async function mountCombo(duration = 1000) {
  vi.useFakeTimers();
  stubComboConfig(duration);
  const wrapper = mount(KeyboardHandler, {
    global: { stubs: { NotificationSystem: true } },
  });
  await flushPromises();
  return wrapper;
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

  it("arms one timeout only while both keys are held and cancels on release", async () => {
    vi.useFakeTimers();
    api.post.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rebootComboKey1: "KEY_1",
          rebootComboKey2: "KEY_7",
          rebootComboDuration: 1000,
        }),
      })
    );
    const intervalSpy = vi.spyOn(globalThis, "setInterval");

    const wrapper = mount(KeyboardHandler, {
      global: { stubs: { NotificationSystem: true } },
    });
    await flushPromises();
    expect(intervalSpy.mock.calls.map(call => call[1])).not.toContain(100);

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(999);
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();

    release("Digit1");
    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);

    release("Digit1");
    release("Digit7");
    intervalSpy.mockRestore();
    wrapper.unmount();
  });

  it("fires exactly once when repeats keep arriving after the hold", async () => {
    const wrapper = await mountCombo(1000);
    api.post.mockClear();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);

    // Keep both keys "held" with repeat keydowns over 3x the duration. Repeats
    // are ignored and the fired latch prevents another arm.
    for (let elapsed = 0; elapsed < 3000; elapsed += 250) {
      press("Digit1", true);
      press("Digit7", true);
      vi.advanceTimersByTime(250);
      await flushPromises();
    }
    expect(api.post).toHaveBeenCalledTimes(1);

    // Releasing both clears the latch; a fresh full hold fires again.
    release("Digit1");
    release("Digit7");
    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(2);

    release("Digit1");
    release("Digit7");
    wrapper.unmount();
  });

  it("does not fire when one key is released before the duration", async () => {
    const wrapper = await mountCombo(1000);
    api.post.mockClear();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(900);
    release("Digit7");
    vi.advanceTimersByTime(5000);
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
    release("Digit1");
    wrapper.unmount();
  });

  it("a repeat event alone never arms the combo", async () => {
    const wrapper = await mountCombo(1000);
    api.post.mockClear();

    press("Digit1", true);
    press("Digit7", true);
    vi.advanceTimersByTime(5000);
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("cancels a held combo on window blur", async () => {
    const wrapper = await mountCombo(1000);
    api.post.mockClear();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(5000);
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("cancels a held combo when the document becomes hidden", async () => {
    const original = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    try {
      const wrapper = await mountCombo(1000);
      api.post.mockClear();

      press("Digit1");
      press("Digit7");
      vi.advanceTimersByTime(500);
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(5000);
      await flushPromises();

      expect(api.post).not.toHaveBeenCalled();
      wrapper.unmount();
    } finally {
      if (original) Object.defineProperty(document, "visibilityState", original);
      else delete document.visibilityState;
    }
  });

  it("cancels a held combo on pagehide", async () => {
    const wrapper = await mountCombo(1000);
    api.post.mockClear();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(5000);
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("cancels an armed combo when the hold duration changes", async () => {
    vi.useFakeTimers();
    const configStore = useConfigStore();
    configStore.configPollInterval = 1; // poll every 1 s under fake timers
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rebootComboKey1: "KEY_1",
          rebootComboKey2: "KEY_7",
          rebootComboDuration: 10000,
        }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          rebootComboKey1: "KEY_1",
          rebootComboKey2: "KEY_7",
          rebootComboDuration: 5000,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(KeyboardHandler, {
      global: { stubs: { NotificationSystem: true } },
    });
    await flushPromises();
    api.post.mockClear();

    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(1000); // poll applies the new duration, cancelling
    await flushPromises();
    vi.advanceTimersByTime(10000);
    await flushPromises();
    expect(api.post).not.toHaveBeenCalled();

    release("Digit1");
    release("Digit7");
    press("Digit1");
    press("Digit7");
    vi.advanceTimersByTime(5000);
    await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1);

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
