/**
 * Regression test for CLV-18, deliberately without mocking simple-keyboard.
 *
 * simple-keyboard ships a CommonJS UMD bundle whose module.exports is
 * `{ SimpleKeyboard, default }`. Vite 8/Rolldown's default-import interop
 * resolves that to the module object, so `import SimpleKeyboard from
 * "simple-keyboard"` throws "SimpleKeyboard is not a constructor". Vitest
 * reproduces the production shape here because vite.config.js sets
 * test.deps.interopDefault = false.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as simpleKeyboard from "simple-keyboard";
import { SimpleKeyboard } from "simple-keyboard";
import OnScreenKeyboard from "@/components/ui/OnScreenKeyboard.vue";
import { useConfigStore } from "@/stores/config";

describe("simple-keyboard interop (CLV-18)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const config = useConfigStore();
    config.onScreenKeyboard = "on";
    config.oskLayout = null;
    config.oskExtraLayouts = [];
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("exposes the class as a named export, not as the default import", () => {
    // This is the shape that broke the default import: the module's default is
    // the exports object, while SimpleKeyboard is the constructor.
    expect(typeof simpleKeyboard.SimpleKeyboard).toBe("function");
    expect(typeof simpleKeyboard.default).toBe("object");
  });

  it("constructs the real keyboard on a jsdom element", () => {
    const host = document.createElement("div");
    host.className = "interop-test-keyboard";
    document.body.appendChild(host);

    const keyboard = new SimpleKeyboard(host, { theme: "calvin-osk" });

    expect(host.querySelectorAll(".hg-button").length).toBeGreaterThan(0);
    keyboard.destroy();
  });

  it("mounts OnScreenKeyboard with the real module and builds its keys", async () => {
    const wrapper = mount(OnScreenKeyboard, { attachTo: document.body });
    await flushPromises();

    expect(document.body.querySelectorAll(".osk .hg-button").length).toBeGreaterThan(0);

    wrapper.unmount();
  });
});
