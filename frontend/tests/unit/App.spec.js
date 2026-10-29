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
import { h } from "vue";

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
  resolveServerUrl: () => Promise.resolve("http://192.168.1.20:8000"),
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

describe("App shell", () => {
  beforeEach(() => {
    keyboard.throws = true;
    initialize.mockClear();
    cleanup.mockClear();
    loadTheme.mockClear();
    syncWithConfig.mockClear();
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
    expect(document.body.querySelector(".osk")).toBeNull();

    wrapper.unmount();
  });

  it("renders the phone-setup QR once the keyboard works", async () => {
    keyboard.throws = false;
    const wrapper = await mountApp();

    expect(initialize).toHaveBeenCalledTimes(1);
    // A named import of the real constructor is what makes this mount succeed.
    expect(document.body.querySelector(".osk")).not.toBeNull();
    expect(wrapper.find('[data-test="phone-setup"]').exists()).toBe(true);

    const qr = wrapper.find('[data-test="phone-setup"] img');
    expect(qr.exists()).toBe(true);
    expect(qr.attributes("src")).toBe("data:image/png;base64,QR");
    expect(wrapper.find('[data-test="phone-setup-url"]').text()).toBe(
      "http://192.168.1.20:8000/settings?setting=content-calendars"
    );

    wrapper.unmount();
  });
});
