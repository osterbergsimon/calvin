import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { h, nextTick } from "vue";
import Popover from "@/components/ui/Popover.vue";

const triggerSlot = ({ attrs }) =>
  h("button", { ...attrs, type: "button", class: "trigger" }, "Open");

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/Popover.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const wrappers = [];

const mountPopover = (props = {}, attachTo = undefined) => {
  const wrapper = mount(Popover, {
    props: { modelValue: false, label: "More actions", ...props },
    slots: {
      trigger: triggerSlot,
      default:
        '<button type="button" class="first">First</button><button type="button" class="last">Last</button>',
    },
    global: { stubs: { teleport: true } },
    attachTo,
  });
  wrappers.push(wrapper);
  return wrapper;
};

const keydown = key =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = "";
});

describe("Popover", () => {
  it("exposes the trigger semantics and opens on click", async () => {
    const w = mountPopover();
    const trigger = w.find(".trigger");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(trigger.attributes("aria-haspopup")).toBe("dialog");
    expect(trigger.attributes("aria-controls")).toBeUndefined();

    await trigger.trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([[true]]);
  });

  it("opens from ArrowDown on the trigger", async () => {
    const w = mountPopover();
    await w.find(".trigger").trigger("keydown", { key: "ArrowDown" });
    expect(w.emitted("update:modelValue")).toEqual([[true]]);
  });

  it("renders the panel with the raised-surface tokens and fixed placement", async () => {
    const w = mountPopover({ modelValue: true });
    await nextTick();
    const panel = w.find(".popover__panel");
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("style")).toContain("position: fixed");
    expect(panel.attributes("style")).toContain("top:");

    expect(STYLE).toMatch(/z-index:\s*var\(--z-popover\)/);
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-card\)/);
    expect(STYLE).toMatch(/box-shadow:\s*var\(--elev-1\)/);
    expect(STYLE).not.toMatch(/z-index:\s*[0-9]/);
    expect(STYLE).not.toMatch(/box-shadow:\s*0/);
  });

  it("flips above the trigger when there is more room there", async () => {
    const w = mountPopover({ modelValue: false });
    w.find(".popover").element.getBoundingClientRect = () => ({
      top: 700,
      bottom: 730,
      left: 100,
      right: 220,
      width: 120,
      height: 30,
    });
    await w.setProps({ modelValue: true });
    await nextTick();
    await nextTick();
    expect(w.find(".popover__panel").attributes("style")).toContain("bottom:");
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const w = mountPopover({ modelValue: false }, document.body);
    const trigger = w.find(".trigger");
    trigger.element.focus();
    await w.setProps({ modelValue: true });
    await nextTick();
    await nextTick();
    // Opening moves focus into the panel.
    expect(document.activeElement).toBe(w.find(".first").element);

    keydown("Escape");
    await nextTick();
    expect(w.emitted("update:modelValue")).toContainEqual([false]);
    expect(w.emitted("close")).toContainEqual(["escape"]);
    // The parent applies v-model, which is when focus returns.
    await w.setProps({ modelValue: false });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(trigger.element);
  });

  it("closes on an outside poke without stealing focus", async () => {
    const w = mountPopover({ modelValue: true }, document.body);
    await nextTick();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.emitted("update:modelValue")).toContainEqual([false]);
    expect(w.emitted("close")).toContainEqual(["outside"]);
    await w.setProps({ modelValue: false });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(outside);
  });

  it("does not close when the panel itself is poked", async () => {
    const w = mountPopover({ modelValue: true }, document.body);
    await nextTick();
    w.find(".first").element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("keeps the panel out of the on-screen keyboard's area", async () => {
    document.documentElement.style.setProperty("--osk-height", "300px");
    const w = mountPopover({ modelValue: false });
    w.find(".popover").element.getBoundingClientRect = () => ({
      top: 400,
      bottom: 430,
      left: 100,
      right: 220,
      width: 120,
      height: 30,
    });
    await w.setProps({ modelValue: true });
    await nextTick();
    await nextTick();
    // 768 - 300 leaves 468px: only 26px below the trigger, so flip above.
    expect(w.find(".popover__panel").attributes("style")).toContain("bottom:");
    document.documentElement.style.removeProperty("--osk-height");
  });
});
