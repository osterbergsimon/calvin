import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

const chunk = vi.hoisted(() => ({ fail: true }));

// The keyboard chunk fails to load until `chunk.fail` is cleared.
vi.mock("@/components/ui/OnScreenKeyboard.vue", () => {
  if (chunk.fail) throw new Error("Failed to fetch dynamically imported module");
  return { default: { name: "OnScreenKeyboard", template: '<div class="osk" />' } };
});

import OnScreenKeyboardLoader from "@/components/ui/OnScreenKeyboardLoader.vue";

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  chunk.fail = true;
});

const settle = async () => {
  await nextTick();
  await vi.dynamicImportSettled();
  await flushPromises();
  await nextTick();
};

describe("OnScreenKeyboardLoader when the chunk fails to load (calvin-o8c1)", () => {
  it("shows a retry control instead of leaving the keyboard dead, and retry recovers", async () => {
    setActivePinia(createPinia());
    const errorLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    wrapper = mount(OnScreenKeyboardLoader, { attachTo: document.body });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    await settle();

    const retry = document.body.querySelector("[data-test='osk-retry']");
    expect(retry).not.toBeNull();
    expect(document.body.querySelector(".osk")).toBeNull();

    chunk.fail = false;
    retry.click();
    await settle();

    expect(document.body.querySelector(".osk")).not.toBeNull();
    expect(document.body.querySelector("[data-test='osk-retry']")).toBeNull();
    errorLog.mockRestore();
  });
});
