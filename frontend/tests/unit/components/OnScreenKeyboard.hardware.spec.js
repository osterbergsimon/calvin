/**
 * CLV-27: on-screen keyboard Off/On/Auto and the hardware-keyboard Auto mode
 * (docs/design/2026-10-30-osk-hardware-keyboard.md §8).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import OnScreenKeyboard from "@/components/ui/OnScreenKeyboard.vue";
import AdminSignInDialog from "@/components/auth/AdminSignInDialog.vue";
import {
  forgetOskHardware,
  isPhysicalTyping,
  useOskHardwareSeen,
} from "@/composables/useOnScreenKeyboard";
import { useConfigStore } from "@/stores/config";
import { useAuthStore, actionForUrl } from "@/stores/auth";

vi.mock("vue-router", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useRoute: () => ({ path: "/", query: {} }),
  };
});

let wrapper;
let config;
let nodes = [];

const mountOsk = () => {
  wrapper = mount(OnScreenKeyboard, { attachTo: document.body });
  return wrapper;
};

const addInput = (attributes = {}) => {
  const input = document.createElement("input");
  Object.entries(attributes).forEach(([name, value]) => input.setAttribute(name, value));
  document.body.appendChild(input);
  nodes.push(input);
  return input;
};

const addContainer = (attributes = {}) => {
  const container = document.createElement("div");
  Object.entries(attributes).forEach(([name, value]) => container.setAttribute(name, value));
  document.body.appendChild(container);
  nodes.push(container);
  return container;
};

const setWidth = width =>
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });

const setTouchPoints = count =>
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: count });

const oskRoot = () => document.body.querySelector(".osk");
const isShown = () => oskRoot()?.classList.contains("osk--shown") === true;
const openButton = () => document.body.querySelector(".osk-open");
const shown = () => isShown();

const focus = async element => {
  element.focus();
  await nextTick();
  await nextTick();
};

const blurAndWait = async element => {
  element.blur();
  await new Promise(resolve => setTimeout(resolve, 30));
  await nextTick();
};

// A trusted physical keydown, as the browser would deliver it.
const physicalKey = (input, key = "a", extra = {}) => ({
  isTrusted: true,
  key,
  target: input,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...extra,
});

const typePhysically = async (input, key = "a", extra = {}) => {
  wrapper.vm.onKeyDown(physicalKey(input, key, extra));
  await nextTick();
  await nextTick();
};

const tapOpenButton = async () => {
  const button = openButton();
  const pointerdown = new Event("pointerdown", { bubbles: true, cancelable: true });
  button.dispatchEvent(pointerdown);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextTick();
  await nextTick();
  return pointerdown;
};

describe("isPhysicalTyping", () => {
  let input;

  beforeEach(() => {
    document.body.innerHTML = "";
    input = document.createElement("input");
    document.body.appendChild(input);
  });

  it("accepts a trusted printable key in a text field", () => {
    expect(isPhysicalTyping(physicalKey(input, "a"), input)).toBe(true);
    expect(isPhysicalTyping(physicalKey(input, "å"), input)).toBe(true);
  });

  it("ignores synthetic events, which is how the OSK types", () => {
    expect(isPhysicalTyping(physicalKey(input, "a", { isTrusted: false }), input)).toBe(false);
  });

  it.each(["ArrowLeft", "ArrowRight", "Enter", "Escape", "F5", " "])(
    "ignores the non-typing key %s",
    key => {
      expect(isPhysicalTyping(physicalKey(input, key), input)).toBe(false);
    }
  );

  it.each([{ ctrlKey: true }, { altKey: true }, { metaKey: true }])(
    "ignores modifiers %o",
    extra => {
      expect(isPhysicalTyping(physicalKey(input, "a", extra), input)).toBe(false);
    }
  );

  it("ignores a key on a field the keyboard never serves", () => {
    const time = document.createElement("input");
    time.type = "time";
    document.body.appendChild(time);

    expect(isPhysicalTyping(physicalKey(time, "a"), time)).toBe(false);
  });

  it("ignores a key delivered to another element", () => {
    const other = document.createElement("input");
    document.body.appendChild(other);

    expect(isPhysicalTyping(physicalKey(other, "a"), input)).toBe(false);
  });
});

describe("OnScreenKeyboard — hardware keyboard modes", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    config = useConfigStore();
    config.onScreenKeyboard = "auto";
    config.oskLayout = null;
    config.oskExtraLayouts = [];
    window.localStorage.clear();
    forgetOskHardware();
    setWidth(1024);
    setTouchPoints(5);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    nodes.forEach(node => node.remove());
    nodes = [];
    setWidth(1024);
    setTouchPoints(0);
    window.localStorage.clear();
    forgetOskHardware();
    document.body.innerHTML = "";
  });

  describe("Auto", () => {
    it("shows on focus, then hides and learns when someone types", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);
      expect(shown()).toBe(true);

      const event = physicalKey(input, "a");
      wrapper.vm.onKeyDown(event);
      await nextTick();

      expect(shown()).toBe(false);
      expect(event.defaultPrevented).toBeUndefined(); // the character still lands
      expect(window.localStorage.getItem("calvin-osk-hardware-seen")).toBe("1");
    });

    it("does not show on the next focus once it has learned", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);
      await typePhysically(input);

      await blurAndWait(input);
      await focus(input);

      expect(shown()).toBe(false);
    });

    it("shows the Keyboard button while hidden, and a tap opens it and forgets", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);
      await typePhysically(input);

      expect(openButton()).not.toBeNull();
      expect(openButton().getAttribute("aria-label")).toBe("Show on-screen keyboard");
      expect(openButton().textContent.trim()).toBe("Keyboard");

      const pointerdown = await tapOpenButton();

      expect(pointerdown.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(shown()).toBe(true);
      expect(window.localStorage.getItem("calvin-osk-hardware-seen")).toBeNull();
    });
  });

  describe("On", () => {
    beforeEach(() => {
      config.onScreenKeyboard = "on";
    });

    it("hides for this field only on typing, without learning", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);
      expect(shown()).toBe(true);

      await typePhysically(input);

      expect(shown()).toBe(false);
      expect(window.localStorage.getItem("calvin-osk-hardware-seen")).toBeNull();

      await blurAndWait(input);
      await focus(input);

      expect(shown()).toBe(true);
    });

    it("shows the Keyboard button after typing hid it", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);
      await typePhysically(input);

      expect(openButton()).not.toBeNull();
    });
  });

  describe("Off", () => {
    beforeEach(() => {
      config.onScreenKeyboard = "off";
    });

    it("never opens by itself but always offers the button on a touchscreen", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      expect(shown()).toBe(false);
      expect(openButton()).not.toBeNull();
    });

    it("opens for this field from the button and stays Off", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      await tapOpenButton();

      expect(shown()).toBe(true);
      expect(config.onScreenKeyboard).toBe("off");
      expect(openButton()).toBeNull();
    });
  });

  describe("non-touch screens", () => {
    it("Auto never shows and no mode shows the button", async () => {
      setTouchPoints(0);
      config.onScreenKeyboard = "auto";
      mountOsk();
      const input = addInput();
      await focus(input);

      expect(shown()).toBe(false);
      expect(openButton()).toBeNull();

      for (const mode of ["on", "off"]) {
        config.onScreenKeyboard = mode;
        await nextTick();
        await blurAndWait(input);
        await focus(input);
        expect(openButton()).toBeNull();
      }
    });

    it("Auto on a narrow touch screen shows neither the keyboard nor the button", async () => {
      setTouchPoints(5);
      setWidth(600);
      config.onScreenKeyboard = "auto";
      mountOsk();
      const input = addInput();
      await focus(input);

      expect(shown()).toBe(false);
      expect(openButton()).toBeNull();
    });

    it("Off still offers the button on a narrow touch screen", async () => {
      setTouchPoints(5);
      setWidth(600);
      config.onScreenKeyboard = "off";
      mountOsk();
      const input = addInput();
      await focus(input);

      expect(openButton()).not.toBeNull();
    });
  });

  describe("Keyboard button rules", () => {
    it("hides on blur and while the keyboard is visible", async () => {
      config.onScreenKeyboard = "off";
      mountOsk();
      const input = addInput();
      await focus(input);
      expect(openButton()).not.toBeNull();

      await blurAndWait(input);
      expect(openButton()).toBeNull();

      await focus(input);
      await tapOpenButton();
      expect(shown()).toBe(true);
      expect(openButton()).toBeNull();

      wrapper.vm.handleKeyPress("{hide}");
      await nextTick();
      expect(openButton()).not.toBeNull();
    });

    it("is absent for fields inside data-osk=off", async () => {
      config.onScreenKeyboard = "off";
      mountOsk();
      const area = addContainer({ "data-osk": "off" });
      const input = document.createElement("input");
      area.appendChild(input);
      nodes.push(input);

      await focus(input);

      expect(openButton()).toBeNull();
    });

    it("stays available while the sign-in dialog is open", async () => {
      config.onScreenKeyboard = "off";
      const auth = useAuthStore();
      auth.requestSignIn({ action: actionForUrl("/api/system/reboot") });
      const dialog = mount(AdminSignInDialog, {
        attachTo: document.body,
        global: { stubs: { PhoneSetupCard: true } },
      });
      mountOsk();
      await flushPromises();

      const password = document.body.querySelector("#admin-signin-dialog-password");
      await focus(password);

      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
      expect(openButton()).not.toBeNull();
      // The button lives outside the dialog, so its own layer controls stacking.
      expect(document.body.querySelector('[role="dialog"] .osk-open')).toBeNull();

      await tapOpenButton();
      expect(shown()).toBe(true);
      expect(oskRoot().querySelector(".hg-button-layout")).not.toBeNull();

      dialog.unmount();
    });

    it("a lock-screen password field gets the button, then the OSK with the layout key", async () => {
      config.onScreenKeyboard = "auto";
      window.localStorage.setItem("calvin-osk-hardware-seen", "1");
      mountOsk();

      const form = document.createElement("form");
      const password = document.createElement("input");
      password.type = "password";
      form.appendChild(password);
      document.body.appendChild(form);
      nodes.push(form);
      nodes.push(password);

      await focus(password);

      expect(shown()).toBe(false);
      expect(openButton()).not.toBeNull();

      await tapOpenButton();

      expect(shown()).toBe(true);
      expect(oskRoot().querySelector(".hg-button-layout")).not.toBeNull();
      expect(window.localStorage.getItem("calvin-osk-hardware-seen")).toBeNull();
    });
  });

  describe("storage failure", () => {
    it("keeps the learned flag for the page load when localStorage throws", async () => {
      const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      mountOsk();
      const input = addInput();
      await focus(input);
      expect(shown()).toBe(true);

      await typePhysically(input);

      expect(shown()).toBe(false);
      expect(useOskHardwareSeen().seen.value).toBe(true);
      await blurAndWait(input);
      await focus(input);
      expect(shown()).toBe(false);

      getItem.mockRestore();
      setItem.mockRestore();
    });
  });
});
