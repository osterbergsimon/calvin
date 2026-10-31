import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import DialogScrim from "@/components/ui/DialogScrim.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/Dialog.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const mountOpen = (props = {}, slots = {}) =>
  mount(Dialog, {
    props: { modelValue: true, title: "Edit source", ...props },
    slots: {
      default: "<p>Body text</p>",
      actions: "<button type='button'>Save</button>",
      ...slots,
    },
    attachTo: document.body,
  });

const keydown = key =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    const w = mount(Dialog, { props: { modelValue: false, title: "Edit" } });
    expect(w.find("[role='dialog']").exists()).toBe(false);
    expect(w.findComponent(DialogScrim).exists()).toBe(false);
  });

  it("renders the title, body and actions with dialog semantics", () => {
    const w = mountOpen();
    const dialog = w.find("[role='dialog']");
    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(w.find(".dialog__title").text()).toBe("Edit source");
    expect(dialog.attributes("aria-labelledby")).toBe(w.find(".dialog__title").attributes("id"));
    expect(w.find(".dialog__body").text()).toBe("Body text");
    expect(w.find(".dialog__actions button").text()).toBe("Save");
  });

  it("uses the one scrim and the dialog layer", () => {
    const w = mountOpen();
    expect(w.findComponent(DialogScrim).exists()).toBe(true);
    expect(w.find(".dialog-overlay").classes()).toContain("dialog-above-osk");
    expect(STYLE).toMatch(/z-index:\s*var\(--z-dialog\)/);
    expect(STYLE).not.toMatch(/z-index:\s*[0-9]/);
  });

  it("closes on Escape and on a scrim click", async () => {
    const esc = mountOpen();
    keydown("Escape");
    await nextTick();
    expect(esc.emitted("update:modelValue")).toEqual([[false]]);
    expect(esc.emitted("close")).toHaveLength(1);

    const scrim = mountOpen();
    scrim.findComponent(DialogScrim).vm.$emit("dismiss");
    await nextTick();
    expect(scrim.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("closes from the header button", async () => {
    const w = mountOpen();
    await w.find("[aria-label='Close']").trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("does not dismiss a non-dismissible dialog", async () => {
    const w = mountOpen({ dismissible: false });
    expect(w.find("[aria-label='Close']").exists()).toBe(false);
    keydown("Escape");
    await nextTick();
    expect(w.emitted("update:modelValue")).toBeUndefined();
    w.findComponent(DialogScrim).vm.$emit("dismiss");
    await nextTick();
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("moves focus in on open, traps Tab and returns focus on close", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();

    const w = mountOpen(
      { modelValue: false },
      {
        default: "<p>Body</p>",
        actions:
          "<button type='button' class='first'>Cancel</button><button type='button' class='last'>Save</button>",
      }
    );
    await w.setProps({ modelValue: true });
    await nextTick();
    await nextTick();
    const firstAction = w.find(".dialog__actions .first").element;
    const last = w.find(".dialog__actions .last").element;
    const close = w.find("[aria-label='Close']").element;
    // The first focusable content, not the header's close button.
    expect(document.activeElement).toBe(firstAction);

    last.focus();
    keydown("Tab");
    await nextTick();
    expect(document.activeElement).toBe(close);

    close.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })
    );
    await nextTick();
    expect(document.activeElement).toBe(last);

    await w.setProps({ modelValue: false });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(opener);
  });

  it("focuses the dialog itself when it has no focusable content", async () => {
    const w = mountOpen({}, { default: "<p>Just text</p>", actions: "" });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.find("[role='dialog']").element);
  });

  it("labels a titleless dialog from its label prop", () => {
    const w = mountOpen({ title: "", label: "Admin sign in" });
    const dialog = w.find("[role='dialog']");
    expect(dialog.attributes("aria-label")).toBe("Admin sign in");
    expect(dialog.attributes("aria-labelledby")).toBeUndefined();
  });

  it("renders the full-size editor sheet with its header and subtitle", () => {
    const w = mountOpen(
      {
        title: "Pages & regions",
        size: "full",
        scrimBlur: true,
        closeLabel: "Close editor",
      },
      { subtitle: "Design the pages your screens display" }
    );
    const overlay = w.find(".dialog-overlay");
    expect(overlay.classes()).toContain("dialog-overlay--full");
    expect(overlay.classes()).not.toContain("dialog-overlay--bleed");
    const panel = w.find("[role='dialog']");
    expect(panel.classes()).toContain("dialog--full");
    expect(panel.classes()).not.toContain("dialog--bleed");
    expect(w.find(".dialog__subtitle").text()).toBe("Design the pages your screens display");
    expect(w.find("[aria-label='Close editor']").exists()).toBe(true);
    expect(w.findComponent(DialogScrim).props("blur")).toBe(true);
    expect(STYLE).toContain(".dialog--full");
    expect(STYLE).toMatch(/height:\s*min\(820px, 100%\)/);
  });

  it("bleeds the full sheet edge-to-edge without losing Escape or focus return", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();

    const w = mountOpen({ modelValue: false, size: "full", bleed: true });
    await w.setProps({ modelValue: true });
    await nextTick();
    await nextTick();
    const overlay = w.find(".dialog-overlay");
    expect(overlay.classes()).toContain("dialog-overlay--bleed");
    expect(w.find("[role='dialog']").classes()).toContain("dialog--bleed");
    // The OSK layer and focus trap are the same as every other dialog.
    expect(overlay.classes()).toContain("dialog-above-osk");
    expect(document.activeElement).toBe(w.find(".dialog__actions button").element);

    keydown("Escape");
    await nextTick();
    expect(w.emitted("update:modelValue")).toEqual([[false]]);
    await w.setProps({ modelValue: false });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(opener);
  });

  it("uses the panel radius, elevation and motion roles", () => {
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-panel\)/);
    expect(STYLE).toMatch(/box-shadow:\s*var\(--elev-2\)/);
    expect(STYLE).toMatch(/animation:[^;]*var\(--dur\)/);
    expect(STYLE).not.toMatch(/var\(--fs-/);
    expect(STYLE).not.toMatch(/var\(--space-/);
    expect(STYLE).not.toMatch(/var\(--radius-(xs|sm|md|lg|xl|2xl)\)/);
  });
});
