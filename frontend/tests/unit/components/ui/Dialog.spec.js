import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import DialogScrim from "@/components/ui/DialogScrim.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/Dialog.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

const wrappers = [];

const track = wrapper => {
  wrappers.push(wrapper);
  return wrapper;
};

const mountOpen = (props = {}, slots = {}) =>
  track(
    mount(Dialog, {
      props: { modelValue: true, title: "Edit source", ...props },
      slots: {
        default: "<p>Body text</p>",
        actions: "<button type='button'>Save</button>",
        ...slots,
      },
      attachTo: document.body,
    })
  );

const appWithHost = () => {
  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);
  const content = document.createElement("main");
  content.innerHTML = "<button type='button'>Behind</button>";
  app.appendChild(content);
  const host = document.createElement("div");
  app.appendChild(host);
  return { app, content, host };
};

const mountAt = (host, props = {}, slots = { default: "<p>Body</p>" }) =>
  track(
    mount(Dialog, {
      props: { modelValue: true, title: "Dialog", ...props },
      slots,
      attachTo: host,
    })
  );

// Two dialogs in one app, mounted side by side: the real shape of the admin
// sign-in over the pages editor (no DOM nesting).
const SiblingDialogs = defineComponent({
  setup(_, { expose }) {
    const first = ref(true);
    const second = ref(true);
    const closeFirst = () => {
      first.value = false;
    };
    const closeSecond = () => {
      second.value = false;
    };
    expose({ closeFirst, closeSecond });
    const dialog = (model, title, body) =>
      h(
        Dialog,
        {
          modelValue: model.value,
          "onUpdate:modelValue": value => {
            model.value = value;
          },
          title,
        },
        { default: () => h("p", body) }
      );
    return () =>
      h("div", [
        dialog(first, "Pages & regions", "Editor"),
        dialog(second, "Admin sign in", "Confirm"),
      ]);
  },
});

const keydown = key =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

afterEach(() => {
  while (wrappers.length) wrappers.pop().unmount();
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

  it("leaves Escape to a nested floating surface", async () => {
    const w = mountOpen(
      {},
      { default: '<div role="listbox"><button type="button" class="inner">Inner</button></div>' }
    );
    await nextTick();
    w.find(".inner").element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
    await nextTick();
    expect(w.emitted("update:modelValue")).toBeUndefined();

    // The same key from the dialog itself still dismisses it.
    keydown("Escape");
    await nextTick();
    expect(w.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("closes only the top of two nested dialogs on Escape", async () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    const host = document.createElement("div");
    app.appendChild(host);

    const outer = track(
      mount(Dialog, {
        props: { modelValue: true, title: "Pages & regions" },
        slots: { default: "<p>Editor</p>" },
        attachTo: host,
      })
    );
    const innerHost = document.createElement("div");
    host.appendChild(innerHost);
    const inner = track(
      mount(Dialog, {
        props: { modelValue: true, title: "Delete page?", size: "sm" },
        slots: { default: "<p>Confirm</p>" },
        attachTo: innerHost,
      })
    );
    await nextTick();
    await nextTick();

    keydown("Escape");
    await nextTick();
    expect(inner.emitted("update:modelValue")).toEqual([[false]]);
    expect(outer.emitted("update:modelValue")).toBeUndefined();

    await inner.setProps({ modelValue: false });
    await nextTick();
    await nextTick();
    keydown("Escape");
    await nextTick();
    expect(outer.emitted("update:modelValue")).toEqual([[false]]);
  });

  it("makes the page behind inert while open and clears it after the last closes", async () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    const content = document.createElement("main");
    content.innerHTML = "<button type='button'>Behind</button>";
    app.appendChild(content);
    const host = document.createElement("div");
    app.appendChild(host);

    const outer = track(
      mount(Dialog, {
        props: { modelValue: true, title: "Pages & regions" },
        slots: { default: "<p>Editor</p>" },
        attachTo: host,
      })
    );
    await nextTick();
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);

    const innerHost = document.createElement("div");
    host.appendChild(innerHost);
    const inner = track(
      mount(Dialog, {
        props: { modelValue: true, title: "Delete page?", size: "sm" },
        slots: { default: "<p>Confirm</p>" },
        attachTo: innerHost,
      })
    );
    await nextTick();
    await nextTick();
    // The outer dialog holds the inner one, so both stay live.
    expect(content.hasAttribute("inert")).toBe(true);
    expect(host.hasAttribute("inert")).toBe(false);

    await inner.setProps({ modelValue: false });
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);

    await outer.setProps({ modelValue: false });
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(false);
  });

  it("clears inert when a dialog unmounts", async () => {
    const app = document.createElement("div");
    app.id = "app";
    document.body.appendChild(app);
    const content = document.createElement("main");
    app.appendChild(content);
    const host = document.createElement("div");
    app.appendChild(host);

    const w = track(
      mount(Dialog, {
        props: { modelValue: true, title: "Edit" },
        slots: { default: "<p>Body</p>" },
        attachTo: host,
      })
    );
    await nextTick();
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);

    w.unmount();
    wrappers.splice(wrappers.indexOf(w), 1);
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(false);
  });

  it("makes an older sibling dialog inert, and frees it when the newer one closes", async () => {
    const { content, host } = appWithHost();
    const wrapper = track(mount(SiblingDialogs, { attachTo: host }));
    await nextTick();
    await nextTick();

    const [olderOverlay, newerOverlay] = wrapper.findAll(".dialog-overlay");
    expect(olderOverlay.element.hasAttribute("inert")).toBe(true);
    expect(newerOverlay.element.hasAttribute("inert")).toBe(false);
    expect(content.hasAttribute("inert")).toBe(true);

    wrapper.vm.closeSecond();
    await nextTick();
    await nextTick();
    expect(olderOverlay.element.hasAttribute("inert")).toBe(false);
    expect(content.hasAttribute("inert")).toBe(true);
  });

  it("keeps the top dialog live when a dialog below it closes", async () => {
    const { content, host } = appWithHost();
    const wrapper = track(mount(SiblingDialogs, { attachTo: host }));
    await nextTick();
    await nextTick();

    const [, newerOverlay] = wrapper.findAll(".dialog-overlay");
    wrapper.vm.closeFirst();
    await nextTick();
    await nextTick();
    expect(newerOverlay.element.hasAttribute("inert")).toBe(false);
    expect(content.hasAttribute("inert")).toBe(true);

    wrapper.vm.closeSecond();
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(false);
  });

  it("leaves a node that was already inert alone", async () => {
    const { content, host } = appWithHost();
    content.setAttribute("inert", "");
    const w = mountAt(host);
    await nextTick();
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);

    await w.setProps({ modelValue: false });
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);
  });

  it("keeps data-dialog-live layers out of the inert set", async () => {
    const { app, content, host } = appWithHost();
    const live = document.createElement("section");
    live.setAttribute("data-dialog-live", "");
    app.appendChild(live);
    const wrapper = document.createElement("div");
    const nested = document.createElement("span");
    nested.setAttribute("data-dialog-live", "");
    wrapper.appendChild(nested);
    app.appendChild(wrapper);

    mountAt(host);
    await nextTick();
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);
    expect(live.hasAttribute("inert")).toBe(false);
    expect(wrapper.hasAttribute("inert")).toBe(false);
    expect(nested.hasAttribute("inert")).toBe(false);
  });

  it("keeps only the live path inside a nested container", async () => {
    const { app, content, host } = appWithHost();
    const container = document.createElement("section");
    const other = document.createElement("p");
    const middle = document.createElement("div");
    const live = document.createElement("span");
    live.setAttribute("data-dialog-live", "");
    middle.appendChild(live);
    container.appendChild(other);
    container.appendChild(middle);
    app.appendChild(container);

    mountAt(host);
    await nextTick();
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);
    expect(container.hasAttribute("inert")).toBe(false);
    expect(middle.hasAttribute("inert")).toBe(false);
    expect(live.hasAttribute("inert")).toBe(false);
    expect(other.hasAttribute("inert")).toBe(true);

    // A child added to the watched container later follows the same split.
    const late = document.createElement("b");
    middle.appendChild(late);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(late.hasAttribute("inert")).toBe(true);
  });

  it("leaves inert that another owner set after the dialog opened", async () => {
    const { content, host } = appWithHost();
    const w = mountAt(host);
    await nextTick();
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);

    // The screen stack takes ownership of the same node while the dialog is up.
    content.setAttribute("inert", "");
    await nextTick();
    await w.setProps({ modelValue: false });
    await nextTick();
    expect(content.hasAttribute("inert")).toBe(true);
  });

  it("stacks two dialogs opened in the same tick", async () => {
    const { host } = appWithHost();
    const wrapper = track(mount(SiblingDialogs, { attachTo: host }));
    await nextTick();
    await nextTick();
    expect(wrapper.findAllComponents(Dialog)).toHaveLength(2);

    keydown("Escape");
    await nextTick();
    await nextTick();
    expect(wrapper.findAll("[role='dialog']")).toHaveLength(1);
    expect(wrapper.find(".dialog__title").text()).toBe("Pages & regions");
  });

  it("inerts a sibling added while the dialog is open", async () => {
    const { app, host } = appWithHost();
    mountAt(host);
    await nextTick();
    await nextTick();

    const late = document.createElement("aside");
    app.appendChild(late);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(late.hasAttribute("inert")).toBe(true);
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
    // The sheet opts into the blur; DialogScrim only draws it under Full.
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
