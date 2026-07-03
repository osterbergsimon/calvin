import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useKeyCapture } from "@/composables/useKeyCapture";
import { useKeyboardStore } from "@/stores/keyboard";

// Mount a host component so the composable's onBeforeUnmount has a valid
// component instance (avoids the "no active component instance" Vue warning).
function mountCapture() {
  let api;
  const Host = {
    setup() {
      api = useKeyCapture();
      return () => null;
    },
  };
  const wrapper = mount(Host);
  return { api, wrapper };
}

describe("useKeyCapture", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("capture() resolves when the store receives a key", async () => {
    const store = useKeyboardStore();
    const { api } = mountCapture();
    const p = api.capture();
    expect(api.capturing.value).toBe(true);
    store.handleCaptureKey("KEY_4");
    await expect(p).resolves.toBe("KEY_4");
    expect(api.capturing.value).toBe(false);
  });

  it("cancel() aborts an active capture", async () => {
    const { api } = mountCapture();
    const p = api.capture();
    api.cancel();
    await expect(p).resolves.toBeNull();
  });
});
