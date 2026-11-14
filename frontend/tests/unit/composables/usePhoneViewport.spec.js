import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { usePhoneViewport } from "@/composables/usePhoneViewport";
import { LAYOUT_DESKTOP_CLASS, LAYOUT_PHONE_CLASS } from "@/styles/breakpoints";

const mountProbe = () => {
  let phone;
  const wrapper = mount(
    defineComponent({
      setup() {
        phone = usePhoneViewport();
        return () => h("div");
      },
    })
  );
  return { wrapper, phone: () => phone.value };
};

const setViewport = (width, height) => {
  window.innerWidth = width;
  window.innerHeight = height;
};

describe("usePhoneViewport", () => {
  const original = { w: window.innerWidth, h: window.innerHeight };
  afterEach(() => {
    document.documentElement.classList.remove(LAYOUT_DESKTOP_CLASS, LAYOUT_PHONE_CLASS);
    setViewport(original.w, original.h);
  });

  it("follows a resize", async () => {
    setViewport(390, 844);
    const { wrapper, phone } = mountProbe();
    expect(phone()).toBe(true);
    setViewport(1280, 800);
    window.dispatchEvent(new Event("resize"));
    expect(phone()).toBe(false);
    wrapper.unmount();
  });

  it("follows Layout: Desktop chosen on a phone, without a resize", async () => {
    setViewport(390, 844);
    const { wrapper, phone } = mountProbe();
    expect(phone()).toBe(true);
    document.documentElement.classList.add(LAYOUT_DESKTOP_CLASS);
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    expect(phone()).toBe(false);
    wrapper.unmount();
  });

  it("follows Layout: Phone forced on a desktop width, without a resize", async () => {
    setViewport(1280, 800);
    const { wrapper, phone } = mountProbe();
    expect(phone()).toBe(false);
    document.documentElement.classList.add(LAYOUT_PHONE_CLASS);
    await new Promise(r => setTimeout(r, 0));
    expect(phone()).toBe(true);
    wrapper.unmount();
  });
});
