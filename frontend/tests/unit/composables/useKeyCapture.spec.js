import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeyCapture } from "@/composables/useKeyCapture";
import { useKeyboardStore } from "@/stores/keyboard";

describe("useKeyCapture", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("capture() resolves when the store receives a key", async () => {
    const store = useKeyboardStore();
    const { capture, capturing } = useKeyCapture();
    const p = capture();
    expect(capturing.value).toBe(true);
    store.handleCaptureKey("KEY_4");
    await expect(p).resolves.toBe("KEY_4");
    expect(capturing.value).toBe(false);
  });

  it("cancel() aborts an active capture", async () => {
    const { capture, cancel } = useKeyCapture();
    const p = capture();
    cancel();
    await expect(p).resolves.toBeNull();
  });
});
