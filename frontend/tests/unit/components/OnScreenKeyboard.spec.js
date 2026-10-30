/**
 * Unit tests for the touch-kiosk on-screen keyboard
 * (docs/design/2026-10-29-on-screen-keyboard.md §9).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { setActivePinia, createPinia } from "pinia";
import OnScreenKeyboard from "@/components/ui/OnScreenKeyboard.vue";
import { isTrustedKeyInTarget } from "@/composables/useOnScreenKeyboard";
import { useConfigStore } from "@/stores/config";

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

const setHeight = height =>
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });

const setTouchPoints = count =>
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: count });

const oskRoot = () => document.body.querySelector(".osk");
const isShown = () => oskRoot()?.classList.contains("osk--shown") === true;
const vmValue = name => {
  const value = wrapper.vm[name];
  if (value?.__v_isRef) return value.value;
  return value;
};

const key = token => {
  wrapper.vm.handleKeyPress(token);
  return nextTick();
};

const focus = async element => {
  element.focus();
  await nextTick();
  await nextTick();
};

const waitForFrame = () => new Promise(resolve => setTimeout(resolve, 30));

const setNavigatorLanguage = tag =>
  Object.defineProperty(navigator, "language", { configurable: true, value: tag });

// The layout key is a regular function key; the renderer rebuilds its buttons,
// so query again after the extra tick the layout watcher needs.
const pressLayoutKey = async () => {
  await key("{layout}");
  await nextTick();
};

const layoutKeyLabel = () => oskRoot().querySelector(".hg-button-layout")?.textContent.trim();
const spaceLabel = () => oskRoot().querySelector(".hg-button-space")?.textContent.trim();
const keyLabels = () =>
  [...oskRoot().querySelectorAll(".hg-button")].map(button => button.textContent.trim());
// Letter keys only: the layout key and the space-bar label are always present
// now (CLV-21) and are compared separately.
const letterLabels = () =>
  [...oskRoot().querySelectorAll(".hg-button:not(.hg-button-layout):not(.hg-button-space)")].map(
    button => button.textContent.trim()
  );
const spaceLabelButton = () => oskRoot().querySelector(".hg-button-space .osk-space-label");
const picker = () => oskRoot().querySelector(".osk-picker");
const pickerOptions = () => [...(picker()?.querySelectorAll(".osk-picker__option") ?? [])];
const pickerLabels = () =>
  pickerOptions().map(button => button.textContent.trim().replace(/\s+/g, " "));

const tapLayoutKey = async () => {
  const button = oskRoot().querySelector(".hg-button-layout");
  button.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
  window.dispatchEvent(new Event("pointerup", { bubbles: true }));
  await nextTick();
  await nextTick();
};

describe("OnScreenKeyboard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    config = useConfigStore();
    config.onScreenKeyboard = "on";
    config.oskLayout = null;
    config.oskExtraLayouts = [];
    window.localStorage.clear();
    document.documentElement.removeAttribute("lang");
    setNavigatorLanguage("en-US");
    setWidth(1024);
    setHeight(768);
    setTouchPoints(0);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    nodes.forEach(node => node.remove());
    nodes = [];
    setWidth(1024);
    setHeight(768);
    setTouchPoints(0);
    document.documentElement.removeAttribute("lang");
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  describe("show rules", () => {
    it("shows for a focused text input when enabled", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      expect(isShown()).toBe(true);
      expect(vmValue("target")).toBe(input);
    });

    it("ignores time inputs, readonly inputs and data-osk=off areas", async () => {
      mountOsk();
      const time = addInput({ type: "time" });
      const readonly = addInput({ readonly: "" });
      const area = addContainer({ "data-osk": "off" });
      const insideOff = document.createElement("input");
      area.appendChild(insideOff);
      nodes.push(insideOff);

      for (const element of [time, readonly, insideOff]) {
        await focus(element);
        expect(isShown()).toBe(false);
      }
    });

    it("never shows in auto mode without a touch screen", async () => {
      config.onScreenKeyboard = "auto";
      setTouchPoints(0);
      mountOsk();
      const input = addInput();

      await focus(input);

      expect(isShown()).toBe(false);
    });

    it("never shows in auto mode on a viewport under 720px", async () => {
      config.onScreenKeyboard = "auto";
      setTouchPoints(5);
      setWidth(600);
      mountOsk();
      const input = addInput();

      await focus(input);

      expect(isShown()).toBe(false);
    });

    it("shows in auto mode for a touch screen at least 720px wide", async () => {
      config.onScreenKeyboard = "auto";
      setTouchPoints(5);
      setWidth(800);
      mountOsk();
      const input = addInput();

      await focus(input);

      expect(isShown()).toBe(true);
    });

    it("hides an auto-mode keyboard if the viewport shrinks under 720px", async () => {
      config.onScreenKeyboard = "auto";
      setTouchPoints(5);
      setWidth(800);
      mountOsk();
      const input = addInput();
      await focus(input);
      expect(isShown()).toBe(true);

      setWidth(600);
      window.dispatchEvent(new Event("resize"));
      await nextTick();
      await nextTick();

      expect(isShown()).toBe(false);
    });

    it("never shows when the setting is off", async () => {
      config.onScreenKeyboard = "off";
      setTouchPoints(5);
      mountOsk();
      const input = addInput();

      await focus(input);

      expect(isShown()).toBe(false);
    });

    it("shows on a desktop in always mode", async () => {
      config.onScreenKeyboard = "on";
      setTouchPoints(0);
      mountOsk();
      const input = addInput();

      await focus(input);

      expect(isShown()).toBe(true);
    });
  });

  describe("layouts", () => {
    it("gives URL fields the URL layout and number fields the numeric pad", async () => {
      mountOsk();
      const url = addInput({ type: "url" });
      await focus(url);
      expect(vmValue("layout")).toBe("url");
      expect(oskRoot().querySelector(".hg-layout-url")).not.toBeNull();

      const number = addInput({ type: "number" });
      await focus(number);
      expect(vmValue("layout")).toBe("numeric");
      expect(oskRoot().classList.contains("osk--numeric")).toBe(true);
      expect(oskRoot().querySelector(".hg-layout-numeric")).not.toBeNull();
      expect(oskRoot().querySelector(".hg-button-enter").textContent.trim()).toBe("Done");
    });

    it("switches to symbols and back to the field's base layout", async () => {
      mountOsk();
      const url = addInput({ type: "url" });
      await focus(url);

      await key("{numbers}");
      expect(vmValue("layout")).toBe("symbols");
      await key("{abc}");
      expect(vmValue("layout")).toBe("url");
    });
  });

  describe("letter layouts", () => {
    it("puts å ö ä on the letter layer for sv, and Shift capitalises them", async () => {
      config.oskLayout = "sv";
      mountOsk();
      const input = addInput();
      await focus(input);

      const labels = keyLabels();
      expect(labels).toEqual(expect.arrayContaining(["å", "ö", "ä"]));

      await key("{shift}");
      await key("å");

      expect(input.value).toBe("Å");
    });

    it("gives sv and fi the same letters, and de a QWERTZ layer", async () => {
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());
      const sv = letterLabels();

      wrapper.unmount();
      wrapper = null;
      document.body.innerHTML = "";
      config.oskLayout = "fi";
      mountOsk();
      await focus(addInput());
      expect(letterLabels()).toEqual(sv);

      wrapper.unmount();
      wrapper = null;
      document.body.innerHTML = "";
      config.oskLayout = "de";
      mountOsk();
      await focus(addInput());
      const de = keyLabels();
      expect(de.indexOf("z")).toBe(de.indexOf("t") + 1);
      expect(de).toEqual(expect.arrayContaining(["ü", "ö", "ä", "ß"]));
    });

    it("always shows the layout key and the space-bar label, even without extras", async () => {
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());

      expect(layoutKeyLabel()).toBe("SV");
      expect(spaceLabel()).toBe("Svenska");
      const layoutKey = oskRoot().querySelector(".hg-button-layout");
      expect(layoutKey.getAttribute("aria-label")).toBe(
        "Keyboard layout: Svenska. Opens the list."
      );
      expect(layoutKey.getAttribute("aria-haspopup")).toBe("true");
    });

    it("puts the layout key on url and email fields too", async () => {
      config.oskLayout = "de";
      mountOsk();
      await focus(addInput({ type: "url" }));
      expect(layoutKeyLabel()).toBe("DE");

      await focus(addInput({ type: "email" }));
      expect(layoutKeyLabel()).toBe("DE");
    });

    it("cycles main → extras → main and labels the key with the layout code", async () => {
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en", "fi"];
      mountOsk();
      await focus(addInput());

      expect(layoutKeyLabel()).toBe("SV");
      expect(keyLabels()).toContain("å");

      await pressLayoutKey();
      expect(layoutKeyLabel()).toBe("EN");
      expect(keyLabels()).not.toContain("å");

      await pressLayoutKey();
      expect(layoutKeyLabel()).toBe("FI");
      expect(keyLabels()).toContain("å");

      await pressLayoutKey();
      expect(layoutKeyLabel()).toBe("SV");
      expect(vmValue("activeLetterLayout")).toBe("sv");
    });

    it("names the active layout on the space bar and in the layout key's aria-label", async () => {
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en"];
      mountOsk();
      await focus(addInput());

      expect(spaceLabel()).toBe("Svenska");
      expect(oskRoot().querySelector(".hg-button-space .osk-space-name")).not.toBeNull();
      expect(oskRoot().querySelector(".hg-button-layout").getAttribute("aria-label")).toBe(
        "Switch keyboard layout, now Svenska"
      );

      await pressLayoutKey();

      expect(spaceLabel()).toBe("English");
      expect(oskRoot().querySelector(".hg-button-layout").getAttribute("aria-label")).toBe(
        "Switch keyboard layout, now English"
      );
    });

    it("keeps the active layout across hide and show, and remembers it on the device", async () => {
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en"];
      mountOsk();
      const first = addInput();
      await focus(first);

      await pressLayoutKey();
      expect(layoutKeyLabel()).toBe("EN");
      expect(window.localStorage.getItem("calvin-osk-device-layout")).toBe("en");

      await key("{hide}");
      expect(isShown()).toBe(false);

      const second = addInput();
      await focus(second);

      expect(isShown()).toBe(true);
      expect(layoutKeyLabel()).toBe("EN");
      expect(keyLabels()).not.toContain("å");
    });

    it("keeps a device choice even when it leaves Settings (CLV-21 §5)", async () => {
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en"];
      mountOsk();
      await focus(addInput());

      await pressLayoutKey();
      expect(vmValue("activeLetterLayout")).toBe("en");

      config.oskExtraLayouts = [];
      await nextTick();
      await nextTick();

      expect(vmValue("activeLetterLayout")).toBe("en");
      expect(layoutKeyLabel()).toBe("EN");
      expect(keyLabels()).not.toContain("å");
    });

    it("cycles from an off-list device choice to the main layout", async () => {
      window.localStorage.setItem("calvin-osk-device-layout", "de");
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en"];
      mountOsk();
      await focus(addInput());

      expect(vmValue("activeLetterLayout")).toBe("de");
      expect(layoutKeyLabel()).toBe("DE");

      await tapLayoutKey();

      expect(vmValue("activeLetterLayout")).toBe("sv");
      expect(layoutKeyLabel()).toBe("SV");
    });

    it("ignores a stored layout that is no longer valid", async () => {
      window.localStorage.setItem("calvin-osk-device-layout", "xx");
      config.oskLayout = "da";
      mountOsk();
      await focus(addInput());

      expect(vmValue("activeLetterLayout")).toBe("da");
      expect(keyLabels()).toEqual(expect.arrayContaining(["æ", "ø", "å"]));
    });

    it("ignores and removes the legacy auto-written key, so upgrades follow Settings", async () => {
      // r132's immediate watcher wrote this on every device.
      window.localStorage.setItem("calvin-osk-layout", "de");
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());

      expect(vmValue("activeLetterLayout")).toBe("sv");
      expect(keyLabels()).toContain("å");
      expect(vmValue("deviceLayout")).toBeNull();
      expect(window.localStorage.getItem("calvin-osk-layout")).toBeNull();

      await tapLayoutKey();
      expect(pickerOptions()[0].getAttribute("aria-pressed")).toBe("true");
    });

    it("resolves an unset layout once from navigator.language and caches it", async () => {
      setNavigatorLanguage("sv-SE");
      config.oskLayout = null;
      mountOsk();
      await focus(addInput());

      expect(vmValue("activeLetterLayout")).toBe("sv");
      expect(keyLabels()).toContain("å");
      expect(window.localStorage.getItem("calvin-osk-layout-hint")).toBe("sv");
    });

    it("never follows the UI language or <html lang>", async () => {
      // Owner requirement: an English UI with a Swedish keyboard.
      setNavigatorLanguage("en-US");
      document.documentElement.lang = "en";
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en"];
      mountOsk();
      await focus(addInput());

      expect(vmValue("activeLetterLayout")).toBe("sv");
      expect(keyLabels()).toContain("å");

      document.documentElement.lang = "de";
      await nextTick();
      expect(vmValue("activeLetterLayout")).toBe("sv");
      expect(layoutKeyLabel()).toBe("SV");

      await pressLayoutKey();
      expect(vmValue("activeLetterLayout")).toBe("en");

      document.documentElement.setAttribute("lang", "fr");
      await nextTick();
      expect(vmValue("activeLetterLayout")).toBe("en");
      expect(layoutKeyLabel()).toBe("EN");
    });

    it("keeps url and email fields on the active letter layer", async () => {
      config.oskLayout = "de";
      mountOsk();
      await focus(addInput({ type: "url" }));

      expect(vmValue("layout")).toBe("url");
      const labels = keyLabels();
      expect(labels).toEqual(expect.arrayContaining(["z", "ü", "ö", "ä"]));
      expect(oskRoot().querySelector(".hg-button-space").getAttribute("aria-label")).toBe("Space");
    });
  });

  describe("text insertion", () => {
    it("inserts at the caret in the middle of a string and dispatches input", async () => {
      mountOsk();
      const input = addInput();
      input.value = "abcd";
      input.setSelectionRange(2, 2);
      const inputEvent = vi.fn();
      input.addEventListener("input", inputEvent);
      await focus(input);

      await key("X");

      expect(input.value).toBe("abXcd");
      expect(input.selectionStart).toBe(3);
      expect(inputEvent).toHaveBeenCalledTimes(1);
    });

    it("deletes a selected range with Backspace", async () => {
      mountOsk();
      const input = addInput();
      input.value = "hello";
      input.setSelectionRange(1, 4);
      await focus(input);

      await key("{bksp}");

      expect(input.value).toBe("ho");
      expect(input.selectionStart).toBe(1);
    });

    it("deletes a multi-byte code point as one unit", async () => {
      mountOsk();
      const input = addInput();
      input.value = "xå";
      input.setSelectionRange(2, 2);
      await focus(input);

      await key("{bksp}");

      expect(input.value).toBe("x");
    });

    it("respects maxlength", async () => {
      mountOsk();
      const input = addInput({ maxlength: "3" });
      input.value = "ab";
      input.setSelectionRange(2, 2);
      await focus(input);

      await key("c");
      await key("d");

      expect(input.value).toBe("abc");
    });

    it("updates a v-model through the dispatched input event", async () => {
      const Harness = {
        template: '<input v-model="value" />',
        setup() {
          return { value: ref("") };
        },
      };
      const harness = mount(Harness, { attachTo: document.body });
      mountOsk();
      const input = harness.find("input").element;
      await focus(input);

      await key("a");

      expect(harness.vm.value).toBe("a");
      harness.unmount();
    });
  });

  describe("shift", () => {
    it("resets after one capital", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      await key("{shift}");
      await key("a");
      await key("b");

      expect(input.value).toBe("Ab");
    });

    it("does not upper-case multi-character buttons such as .com", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      await key("{shift}");
      await key(".com");

      expect(input.value).toBe(".com");
    });

    it("locks caps when Shift is tapped twice within 400ms", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      await key("{shift}");
      await key("{shift}");
      await key("a");
      await key("b");
      await key("{shift}");
      await key("c");

      expect(input.value).toBe("ABc");
    });
  });

  describe("enter", () => {
    it("submits the form and takes the primary button's label", async () => {
      mountOsk();
      const form = document.createElement("form");
      const input = document.createElement("input");
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Sign in";
      form.append(input, submit);
      document.body.appendChild(form);
      nodes.push(form);
      form.requestSubmit = vi.fn();

      await focus(input);

      expect(oskRoot().querySelector(".hg-button-enter").textContent.trim()).toBe("Sign in");
      await key("{enter}");
      expect(form.requestSubmit).toHaveBeenCalledTimes(1);
    });

    it("runs an existing keyup.enter handler", async () => {
      mountOsk();
      const input = addInput();
      const handler = vi.fn();
      input.addEventListener("keyup", event => {
        if (event.key === "Enter") handler();
      });
      await focus(input);

      await key("{enter}");

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not submit when the Enter keydown was prevented", async () => {
      mountOsk();
      const form = document.createElement("form");
      const input = document.createElement("input");
      form.appendChild(input);
      document.body.appendChild(form);
      nodes.push(form);
      form.requestSubmit = vi.fn();
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") event.preventDefault();
      });
      await focus(input);

      await key("{enter}");

      expect(form.requestSubmit).not.toHaveBeenCalled();
    });
  });

  describe("hiding", () => {
    it("only treats trusted key presses in the target as hardware input", () => {
      const input = addInput();
      const other = addInput();

      expect(isTrustedKeyInTarget({ isTrusted: true, target: input }, input)).toBe(true);
      expect(isTrustedKeyInTarget({ isTrusted: false, target: input }, input)).toBe(false);
      expect(isTrustedKeyInTarget({ isTrusted: true, target: other }, input)).toBe(false);
      expect(isTrustedKeyInTarget(null, input)).toBe(false);
    });

    it("ignores a synthetic (untrusted) keydown", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      await nextTick();

      expect(isShown()).toBe(true);
    });

    it("hides on Escape", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await nextTick();

      expect(isShown()).toBe(false);
    });

    it("hides after focus leaves for the body", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);
      expect(isShown()).toBe(true);

      input.blur();
      await waitForFrame();

      expect(isShown()).toBe(false);
    });

    it("stays visible while focus moves between two fields", async () => {
      mountOsk();
      const first = addInput();
      const second = addInput();
      await focus(first);
      expect(isShown()).toBe(true);

      await focus(second);
      await waitForFrame();

      expect(isShown()).toBe(true);
      expect(vmValue("target")).toBe(second);
    });
  });

  describe("scroll to field", () => {
    it("keeps the focused field fully above the keyboard with a margin", async () => {
      setWidth(1280);
      setHeight(800);
      mountOsk();

      const scroller = addContainer();
      scroller.style.overflowY = "auto";
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 700 });
      const input = document.createElement("input");
      scroller.appendChild(input);
      nodes.push(input);
      input.getBoundingClientRect = () => ({
        top: 700,
        bottom: 740,
        height: 40,
        width: 240,
        left: 0,
        right: 240,
        x: 0,
        y: 700,
        toJSON: () => ({}),
      });

      await focus(input);
      await waitForFrame();

      const keyboardHeight = Math.round(800 * 0.45) > 300 ? 300 : Math.round(800 * 0.45);
      const visibleBottom = 800 - keyboardHeight - 16;
      const fieldBottom = input.getBoundingClientRect().bottom - scroller.scrollTop;

      expect(scroller.scrollTop).toBeGreaterThan(0);
      expect(fieldBottom).toBeLessThanOrEqual(visibleBottom);
    });

    it("does not scroll when the field is already clear of the keyboard", async () => {
      setWidth(1280);
      setHeight(800);
      mountOsk();

      const scroller = addContainer();
      scroller.style.overflowY = "auto";
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 700 });
      const input = document.createElement("input");
      scroller.appendChild(input);
      nodes.push(input);
      input.getBoundingClientRect = () => ({
        top: 100,
        bottom: 140,
        height: 40,
        width: 240,
        left: 0,
        right: 240,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      });

      await focus(input);
      await waitForFrame();

      expect(scroller.scrollTop).toBe(0);
    });
  });

  describe("height variable", () => {
    it("publishes --osk-height on show and resets it to 0px on hide", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      const shownHeight = document.documentElement.style.getPropertyValue("--osk-height");
      expect(parseInt(shownHeight, 10)).toBeGreaterThan(0);

      await key("{hide}");

      expect(document.documentElement.style.getPropertyValue("--osk-height")).toBe("0px");
    });
  });

  describe("accessibility", () => {
    it("renders a labelled group with non-tabbable buttons", async () => {
      mountOsk();
      const input = addInput();
      await focus(input);

      expect(oskRoot().getAttribute("role")).toBe("group");
      expect(oskRoot().getAttribute("aria-label")).toBe("On-screen keyboard");
      const buttons = [...oskRoot().querySelectorAll("button.hg-button")];
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach(button => {
        expect(button.getAttribute("type")).toBe("button");
        expect(button.getAttribute("tabindex")).toBe("-1");
      });
      expect(oskRoot().querySelector(".hg-button-bksp").getAttribute("aria-label")).toBe(
        "Backspace"
      );
      expect(oskRoot().querySelector(".hg-button-shift").getAttribute("aria-label")).toBe("Shift");
      expect(oskRoot().querySelector(".hg-button-hide").getAttribute("aria-label")).toBe(
        "Hide keyboard"
      );
      expect(oskRoot().querySelector(".hg-button-space").textContent.trim()).toBe("English");
      const spaceLabel = spaceLabelButton();
      expect(spaceLabel.getAttribute("role")).toBe("button");
      expect(spaceLabel.getAttribute("aria-label")).toBe("Change keyboard layout");
    });
  });

  describe("layout picker (CLV-21)", () => {
    const openPicker = async () => {
      await tapLayoutKey();
      return picker();
    };
    const chooseOption = async index => {
      pickerOptions()[index].dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await nextTick();
      await nextTick();
    };

    it("opens on a tap of the layout key when no extras are set", async () => {
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());

      await tapLayoutKey();

      expect(picker()).not.toBeNull();
      expect(vmValue("pickerOpen")).toBe(true);
      expect(vmValue("layout")).toBe("default");
    });

    it("cycles on a tap when extras are set, without opening the picker", async () => {
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en"];
      mountOsk();
      await focus(addInput());

      await tapLayoutKey();

      expect(picker()).toBeNull();
      expect(vmValue("activeLetterLayout")).toBe("en");
      expect(layoutKeyLabel()).toBe("EN");
    });

    it("opens on a 500ms long-press, with and without extras", async () => {
      config.oskLayout = "sv";
      config.oskExtraLayouts = ["en"];
      mountOsk();
      await focus(addInput());
      vi.useFakeTimers();
      try {
        const button = oskRoot().querySelector(".hg-button-layout");
        button.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
        vi.advanceTimersByTime(499);
        expect(picker()).toBeNull();
        expect(vmValue("activeLetterLayout")).toBe("sv");

        vi.advanceTimersByTime(1);
        await nextTick();
        expect(picker()).not.toBeNull();
        expect(vmValue("activeLetterLayout")).toBe("sv");
        window.dispatchEvent(new Event("pointerup"));
        await nextTick();
        // The pointerup that ends a long press must not also cycle.
        expect(picker()).not.toBeNull();
        expect(vmValue("activeLetterLayout")).toBe("sv");
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the layout key and the space bar after a short tap", async () => {
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());

      await tapLayoutKey();
      await chooseOption(0);

      expect(picker()).toBeNull();
      expect(layoutKeyLabel()).toBe("SV");
    });

    it("always renders the space-bar label; the label opens the picker, the key types a space", async () => {
      config.oskLayout = "sv";
      mountOsk();
      const input = addInput();
      await focus(input);

      expect(spaceLabel()).toBe("Svenska");
      const label = spaceLabelButton();
      expect(label).not.toBeNull();
      label.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
      await nextTick();
      expect(picker()).not.toBeNull();

      oskRoot().querySelector(".osk-picker__abc").dispatchEvent(new MouseEvent("click"));
      await nextTick();
      expect(picker()).toBeNull();

      const spaceKey = oskRoot().querySelector(".hg-button-space");
      spaceKey.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await nextTick();
      expect(input.value).toBe(" ");
    });

    it("lists Default + the seven layouts in order and marks the active choice", async () => {
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());

      await openPicker();

      expect(pickerLabels()).toEqual([
        "Default (Svenska)",
        "English EN",
        "Svenska SV",
        "Suomi FI",
        "Norsk NO",
        "Dansk DA",
        "Deutsch DE",
        "Français FR",
      ]);
      const options = pickerOptions();
      expect(options[0].getAttribute("aria-pressed")).toBe("true");
      expect(options[2].getAttribute("aria-pressed")).toBe("false");
    });

    it("choosing writes the device key, marks it and returns to the letter layer", async () => {
      config.oskLayout = "sv";
      mountOsk();
      const input = addInput();
      await focus(input);
      expect(document.activeElement).toBe(input);

      await openPicker();
      await chooseOption(2);

      expect(window.localStorage.getItem("calvin-osk-device-layout")).toBe("sv");
      expect(vmValue("pickerOpen")).toBe(false);
      expect(vmValue("layout")).toBe("default");
      expect(document.activeElement).toBe(input);

      await openPicker();
      expect(pickerOptions()[2].getAttribute("aria-pressed")).toBe("true");
      expect(pickerOptions()[0].getAttribute("aria-pressed")).toBe("false");
    });

    it("Default removes the device choice so Settings applies again", async () => {
      window.localStorage.setItem("calvin-osk-device-layout", "de");
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());

      await openPicker();
      expect(pickerOptions()[6].getAttribute("aria-pressed")).toBe("true");

      await chooseOption(0);

      expect(window.localStorage.getItem("calvin-osk-device-layout")).toBeNull();
      expect(vmValue("activeLetterLayout")).toBe("sv");
      expect(vmValue("pickerOpen")).toBe(false);
    });

    it("abc closes the picker without changing the layout", async () => {
      window.localStorage.setItem("calvin-osk-device-layout", "de");
      config.oskLayout = "sv";
      mountOsk();
      await focus(addInput());
      await openPicker();

      oskRoot().querySelector(".osk-picker__abc").dispatchEvent(new MouseEvent("click"));
      await nextTick();

      expect(vmValue("pickerOpen")).toBe(false);
      expect(vmValue("activeLetterLayout")).toBe("de");
      expect(window.localStorage.getItem("calvin-osk-device-layout")).toBe("de");
    });

    it("changes only the device, never server config (works signed out)", async () => {
      config.oskLayout = "sv";
      const updateConfig = vi.spyOn(config, "updateConfig");
      mountOsk();
      await focus(addInput({ type: "password" }));

      await openPicker();
      await chooseOption(1);

      expect(updateConfig).not.toHaveBeenCalled();
      expect(config.oskLayout).toBe("sv");
      expect(window.localStorage.getItem("calvin-osk-device-layout")).toBe("en");
    });

    it("drops the option codes and shortens Default on a short panel", async () => {
      config.oskLayout = "de";
      setWidth(800);
      setHeight(480);
      mountOsk();
      await focus(addInput());
      // Height is measured by ResizeObserver, unavailable in jsdom; set the
      // compact state the same way the renderer would.
      wrapper.vm.setMeasuredHeight(216);
      await nextTick();
      await openPicker();

      expect(oskRoot().classList.contains("osk--compact")).toBe(true);
      expect(pickerLabels()[0]).toBe("Default (DE)");
    });
  });
});
