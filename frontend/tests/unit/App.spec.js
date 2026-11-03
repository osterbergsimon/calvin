/**
 * Regression tests for CLV-18.
 *
 * simple-keyboard ships a CommonJS UMD bundle. Under Vite 8/Rolldown a default
 * import resolved to the module object instead of the constructor, so
 * `new SimpleKeyboard()` threw from OnScreenKeyboard's mounted hook. Because it
 * escaped app.mount(), the mounted hooks queued after it never ran: the
 * connection health check stayed on "Checking…" and the first-run pages never
 * rendered. These tests pin both halves of the fix: the renderer must fail
 * safe, and a working keyboard must still let the phone-setup card through.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { h, nextTick } from "vue";

const { keyboard, initialize, cleanup, loadTheme, syncWithConfig } = vi.hoisted(() => ({
  // Mutable so one test can simulate the broken constructor and another a
  // healthy one without re-mocking the module.
  keyboard: { throws: true },
  initialize: vi.fn(),
  cleanup: vi.fn(),
  loadTheme: vi.fn(),
  syncWithConfig: vi.fn(),
}));

vi.mock("simple-keyboard", () => ({
  // What Vite 8/Rolldown's default-import interop actually hands back for this
  // UMD package: the module object, not the constructor. Keeping it here means
  // this suite also fails if the component regresses to a default import.
  default: { __vite8Interop: true },
  SimpleKeyboard: class {
    constructor() {
      if (keyboard.throws) {
        throw new TypeError("SimpleKeyboard is not a constructor");
      }
    }
    setOptions() {}
    destroy() {}
  },
}));

vi.mock("@/stores/connection", () => ({
  useConnectionStore: () => ({ initialize, cleanup }),
}));

vi.mock("@/composables/usePhotoFrameMode", () => ({
  usePhotoFrameMode: () => ({}),
}));

vi.mock("@/composables/useTheme", () => ({
  useTheme: () => ({ loadTheme }),
}));

vi.mock("@/composables/useUiScale", () => ({
  useUiScale: () => ({ syncWithConfig }),
}));

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: () => Promise.resolve("http://192.0.2.20:8000"),
  settingsLink: (base, id) => `${base}/settings?setting=${id}`,
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") },
}));

// Imported after the mocks so App.vue and OnScreenKeyboard see them.
import App from "@/App.vue";
import EmptyState from "@/components/ui/EmptyState.vue";

const phonePage = {
  setup: () => () =>
    h(EmptyState, {
      message: "No calendars yet",
      help: "Add one in Settings › Content Sources › Calendars.",
      actionLabel: "Add a calendar",
      settingId: "content-calendars",
      phoneHint: true,
    }),
};

const makeRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: phonePage },
      { path: "/settings", component: { template: "<div />" } },
    ],
  });

const mountApp = async () => {
  const router = makeRouter();
  router.push("/");
  await router.isReady();
  const wrapper = mount(App, {
    global: {
      plugins: [createPinia(), router],
      stubs: { KeyboardHandler: true, StatusRail: true, AdminSignInDialog: true },
    },
  });
  await flushPromises();
  return wrapper;
};

/** Focus an editable field, the signal that loads the on-screen keyboard. */
const focusTextField = async () => {
  const input = document.createElement("input");
  input.type = "text";
  document.body.appendChild(input);
  input.focus();
  // The OSK is an async chunk: let the import and the component's mounted
  // hook (which constructs simple-keyboard) settle.
  await nextTick();
  await vi.dynamicImportSettled();
  await flushPromises();
  await nextTick();
  return input;
};

describe("App shell", () => {
  beforeEach(() => {
    keyboard.throws = true;
    initialize.mockClear();
    cleanup.mockClear();
    loadTheme.mockClear();
    syncWithConfig.mockClear();
  });

  it("does not load the on-screen keyboard until an editable field is focused", async () => {
    keyboard.throws = false;
    const wrapper = await mountApp();

    // simple-keyboard and its panel belong to the async OSK chunk: the
    // dashboard's first paint must not pay for them (calvin-0fm6).
    expect(document.body.querySelector(".osk")).toBeNull();

    const input = await focusTextField();
    expect(document.body.querySelector(".osk")).not.toBeNull();
    input.remove();

    wrapper.unmount();
  });

  it("finishes App's mounted setup when simple-keyboard throws", async () => {
    const wrapper = await mountApp();

    // The keys of the reported symptom: App.vue's mounted hook ran, so the
    // connection store started its health check instead of staying on
    // "Checking…", and the other setup calls were not skipped.
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(loadTheme).toHaveBeenCalledTimes(1);
    expect(syncWithConfig).toHaveBeenCalledTimes(1);

    // The failed keyboard renders nothing at all (it teleports to <body>, so
    // query the document rather than the wrapper).
    const input = await focusTextField();
    expect(document.body.querySelector(".osk")).toBeNull();
    input.remove();

    wrapper.unmount();
  });

  it("renders the phone-setup QR once the keyboard works", async () => {
    keyboard.throws = false;
    const wrapper = await mountApp();

    expect(initialize).toHaveBeenCalledTimes(1);
    // A named import of the real constructor is what makes this mount succeed.
    const input = await focusTextField();
    expect(document.body.querySelector(".osk")).not.toBeNull();
    input.remove();
    expect(wrapper.find('[data-test="phone-setup"]').exists()).toBe(true);

    const qr = wrapper.find('[data-test="phone-setup"] img');
    expect(qr.exists()).toBe(true);
    expect(qr.attributes("src")).toBe("data:image/png;base64,QR");
    expect(wrapper.find('[data-test="phone-setup-url"]').text()).toBe(
      "http://192.0.2.20:8000/settings?setting=content-calendars"
    );

    wrapper.unmount();
  });

  it("removes the retired per-screen browser values on start-up", async () => {
    const retired = [
      "calvin-layout-mode",
      "calvin-screen-loadingLight",
      "calvin-screen-photoFrameEnabled",
      "calvin-screen-photoFrameTimeout",
      "calvin-screen-photoFrameSourceIds",
    ];
    const browserOnly = ["calvin-touch-controls", "calvin-osk-mode", "calvin-ui-size"];
    for (const key of retired) window.localStorage.setItem(key, "stale");
    for (const key of browserOnly) window.localStorage.setItem(key, "kept");

    const wrapper = await mountApp();

    for (const key of retired) expect(window.localStorage.getItem(key), key).toBeNull();
    for (const key of browserOnly) expect(window.localStorage.getItem(key), key).toBe("kept");

    wrapper.unmount();
    window.localStorage.clear();
  });

  it("renders only the guest page on a share link, without the dashboard shell", async () => {
    window.history.replaceState({}, "", "/share/abc.TOKEN/");
    try {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: "/share/:token/", component: { template: "<p data-test='guest' />" } }],
      });
      router.push("/share/abc.TOKEN/");
      await router.isReady();
      const wrapper = mount(App, {
        global: {
          plugins: [createPinia(), router],
          stubs: { KeyboardHandler: true, StatusRail: true, AdminSignInDialog: true },
        },
      });
      await flushPromises();

      expect(wrapper.find("[data-test='guest']").exists()).toBe(true);
      // No connection polling, theme or config loading, keyboard or admin sign-in.
      expect(initialize).not.toHaveBeenCalled();
      expect(loadTheme).not.toHaveBeenCalled();
      expect(syncWithConfig).not.toHaveBeenCalled();
      expect(wrapper.findComponent({ name: "KeyboardHandler" }).exists()).toBe(false);
      expect(wrapper.findComponent({ name: "AdminSignInDialog" }).exists()).toBe(false);
      expect(document.body.querySelector(".osk")).toBeNull();
      wrapper.unmount();
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
});
