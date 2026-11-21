/**
 * The pairing strip (Task 13, calvin-0xns; design spec §2).
 *
 * It is dashboard chrome, in the flow at the bottom edge. These tests pin the
 * parts jsdom can see: what it renders, the exact copy, the spelled-out code
 * for screen readers, no live region, and the --pairing-strip-h it publishes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";

import api from "@/services/api";
import PairingStrip from "@/components/PairingStrip.vue";
import { captureKioskIdentity } from "@/utils/kioskId";
import { usePairingStore } from "@/stores/kioskPairing";

vi.mock("@/services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const TITLE = "Pair this screen";
const TEXT =
  "On your phone or computer, open Settings › Screens in Calvin and type this code under Pair a screen.";

class FakeResizeObserver {
  static last = null;
  constructor(callback) {
    this.callback = callback;
    FakeResizeObserver.last = this;
  }
  observe() {
    this.callback([{ contentRect: { height: 88 } }]);
  }
  disconnect() {}
}

function setLocation({ search = "?kiosk=kitchen", hash = "" } = {}) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { search, hash, pathname: "/", hostname: "pi-kitchen" },
  });
}

let replaceState;
let wrapper;
let store;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  sessionStorage.clear();
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
    window.location.hash = "";
  });
  setLocation();
  captureKioskIdentity();
  api.get.mockResolvedValue({ data: { state: "none" } });
  globalThis.ResizeObserver = FakeResizeObserver;
  store = usePairingStore();
  document.documentElement.style.removeProperty("--pairing-strip-h");
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  replaceState.mockRestore();
  delete globalThis.ResizeObserver;
  document.documentElement.style.removeProperty("--pairing-strip-h");
});

const settle = async () => {
  await nextTick();
  await nextTick();
};

describe("PairingStrip", () => {
  it("renders nothing without a pending code", async () => {
    wrapper = mount(PairingStrip);

    expect(wrapper.find(".pairing-strip").exists()).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--pairing-strip-h")).toBe("0px");
  });

  it("renders the spec's copy and code, and publishes its height", async () => {
    store.state = "pending";
    store.code = "K7Q-4MD";
    wrapper = mount(PairingStrip, { attachTo: document.body });
    await settle();

    const strip = wrapper.find(".pairing-strip");
    expect(strip.exists()).toBe(true);
    expect(strip.element.tagName).toBe("ASIDE");
    expect(strip.text()).toContain(TITLE);
    expect(strip.text()).toContain(TEXT);
    expect(wrapper.find(".pairing-strip__code").text()).toBe("K7Q-4MD");
    expect(document.documentElement.style.getPropertyValue("--pairing-strip-h")).toBe("88px");
  });

  it("names the strip and spells the code out for screen readers", async () => {
    store.state = "pending";
    store.code = "K7Q-4MD";
    wrapper = mount(PairingStrip);
    await settle();

    const strip = wrapper.find(".pairing-strip");
    const title = wrapper.find(`#${strip.attributes("aria-labelledby")}`);
    expect(title.text()).toBe(TITLE);
    // A paragraph role cannot be named: `role="img"` is what makes the label
    // the code's accessible name (design-lead F2).
    expect(wrapper.find(".pairing-strip__code").attributes("role")).toBe("img");
    expect(wrapper.find(".pairing-strip__code").attributes("aria-label")).toBe(
      "Code: K 7 Q, 4 M D"
    );
    expect(strip.attributes("aria-live")).toBeUndefined();
    expect(wrapper.element.querySelector("button, a, [tabindex], input")).toBeNull();
  });

  it("takes the space back when the screen is paired", async () => {
    store.state = "pending";
    store.code = "K7Q-4MD";
    wrapper = mount(PairingStrip, { attachTo: document.body });
    await settle();
    expect(document.documentElement.style.getPropertyValue("--pairing-strip-h")).toBe("88px");

    store.state = "paired";
    store.code = null;
    await settle();

    expect(wrapper.find(".pairing-strip").exists()).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--pairing-strip-h")).toBe("0px");
  });
});
