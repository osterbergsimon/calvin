/**
 * A save still queued when the page closes is flushed with keepalive, so the
 * browser may finish the request after the page is gone (calvin-msa8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import api from "@/services/api";
import { useConfigForm } from "@/composables/useConfigForm";
import { useScreenSetting } from "@/composables/useScreenSetting";
import { useConfigStore } from "@/stores/config";
import { SAVE_DEBOUNCE_MS } from "@/utils/optimisticQueue";
import { KEEPALIVE_REQUEST } from "@/services/api";

vi.mock("@/services/api", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { get: vi.fn(), put: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
  };
});

const mountWith = setup => {
  let result;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    })
  );
  return { wrapper, result };
};

describe.each(["pagehide", "beforeunload"])("saves queued at %s (calvin-msa8)", eventName => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the settings form's queued value with keepalive", async () => {
    api.post.mockResolvedValue({ data: {} });
    const { wrapper, result } = mountWith(() => useConfigForm({}));

    void result.updateConfigValue("weekStartDay", 0);
    expect(api.post).not.toHaveBeenCalled();

    window.dispatchEvent(new Event(eventName));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][2]).toEqual(KEEPALIVE_REQUEST);
    wrapper.unmount();
    // A normal debounce still goes out without keepalive.
  });

  it("sends a kiosk setting's queued value with keepalive", async () => {
    window.sessionStorage.setItem("calvin_kiosk_id", "hallway");
    api.get.mockResolvedValue({ data: { overrides: {} } });
    api.patch.mockResolvedValue({ data: { overrides: {} } });
    useConfigStore().onScreenKeyboard = "auto";
    const { wrapper, result } = mountWith(() =>
      useScreenSetting("onScreenKeyboard", { storageKey: "calvin-osk-mode" })
    );

    void result.set("on");
    window.dispatchEvent(new Event(eventName));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.patch).toHaveBeenCalledWith(
      "/kiosks/hallway/overrides",
      { overrides: { onScreenKeyboard: "on" } },
      KEEPALIVE_REQUEST
    );
    wrapper.unmount();
  });

  it("leaves an ordinary debounced save without keepalive", async () => {
    api.post.mockResolvedValue({ data: {} });
    const { wrapper, result } = mountWith(() => useConfigForm({}));

    void result.updateConfigValue("weekStartDay", 0);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(api.post.mock.calls[0][2]).toBeUndefined();
    wrapper.unmount();
  });

  it("sends a body over the keepalive limit as a normal request instead of failing", async () => {
    api.post.mockResolvedValue({ data: {} });
    const { wrapper, result } = mountWith(() => useConfigForm({}));

    void result.updateConfigValue("notes", "x".repeat(70 * 1024));
    window.dispatchEvent(new Event(eventName));
    await vi.advanceTimersByTimeAsync(0);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][2]).toBeUndefined();
    wrapper.unmount();
  });
});
