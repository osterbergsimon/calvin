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

describe("OnScreenKeyboard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    config = useConfigStore();
    config.onScreenKeyboard = "on";
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
      expect(oskRoot().querySelector(".hg-button-space").textContent.trim()).toBe("");
    });
  });
});
