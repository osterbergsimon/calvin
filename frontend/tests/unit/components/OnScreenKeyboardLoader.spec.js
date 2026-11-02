import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import OnScreenKeyboardLoader from "@/components/ui/OnScreenKeyboardLoader.vue";
import { useConfigStore } from "@/stores/config";

let wrapper;

const addInput = (attributes = {}) => {
  const input = document.createElement("input");
  Object.entries(attributes).forEach(([name, value]) => input.setAttribute(name, value));
  document.body.appendChild(input);
  return input;
};

const oskRoot = () => document.body.querySelector(".osk");

const settle = async () => {
  await nextTick();
  await vi.dynamicImportSettled();
  await flushPromises();
  await nextTick();
};

const mountLoader = () => {
  wrapper = mount(OnScreenKeyboardLoader, { attachTo: document.body });
  return wrapper;
};

describe("OnScreenKeyboardLoader", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const config = useConfigStore();
    config.onScreenKeyboard = "on";
    config.oskLayout = null;
    config.oskExtraLayouts = [];
    window.localStorage.clear();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("does not load the keyboard until a text field is focused", async () => {
    mountLoader();
    await flushPromises();

    expect(oskRoot()).toBeNull();

    const input = addInput();
    input.focus();
    await settle();

    expect(oskRoot()).not.toBeNull();
    expect(oskRoot().classList.contains("osk--shown")).toBe(true);
  });

  it("ignores fields the on-screen keyboard does not serve", async () => {
    mountLoader();
    await flushPromises();

    const checkbox = addInput({ type: "checkbox" });
    checkbox.focus();
    await settle();

    expect(oskRoot()).toBeNull();

    const excluded = addInput({ "data-osk": "off" });
    excluded.focus();
    await settle();

    expect(oskRoot()).toBeNull();
  });
});
