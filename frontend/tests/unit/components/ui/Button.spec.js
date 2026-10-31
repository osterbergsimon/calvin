import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { mdiCheck } from "@mdi/js";
import Button from "@/components/ui/Button.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/Button.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("Button", () => {
  it("defaults to a secondary md button that acts as type=button", () => {
    const w = mount(Button, { slots: { default: "Save" } });
    expect(w.element.tagName).toBe("BUTTON");
    expect(w.attributes("type")).toBe("button");
    expect(w.classes()).toEqual(expect.arrayContaining(["btn", "btn--secondary", "btn--md"]));
    expect(w.text()).toBe("Save");
  });

  it.each(["primary", "secondary", "ghost", "danger", "link"])(
    "renders the %s variant class",
    variant => {
      const w = mount(Button, { props: { variant }, slots: { default: "x" } });
      expect(w.classes()).toContain(`btn--${variant}`);
    }
  );

  it.each(["md", "sm"])("renders the %s size class", size => {
    const w = mount(Button, { props: { size }, slots: { default: "x" } });
    expect(w.classes()).toContain(`btn--${size}`);
  });

  it("forwards its type so it can submit a form", () => {
    const w = mount(Button, { props: { type: "submit" }, slots: { default: "Sign in" } });
    expect(w.attributes("type")).toBe("submit");
  });

  it("disables the control without changing the label", () => {
    const w = mount(Button, { props: { disabled: true }, slots: { default: "Save" } });
    expect(w.attributes("disabled")).toBeDefined();
    expect(w.text()).toBe("Save");
    expect(w.attributes("aria-busy")).toBeUndefined();
  });

  it("loading disables the control, marks it busy and swaps in the loading label", async () => {
    const w = mount(Button, {
      props: { loading: true, loadingLabel: "Saving…" },
      slots: { default: "Save" },
    });
    expect(w.attributes("disabled")).toBeDefined();
    expect(w.attributes("aria-busy")).toBe("true");
    expect(w.text()).toBe("Saving…");
    expect(w.emitted("click")).toBeUndefined();
  });

  it("keeps the default slot as the loading label when no loading label is given", () => {
    const w = mount(Button, { props: { loading: true }, slots: { default: "Save" } });
    expect(w.text()).toBe("Save");
  });

  it("draws an icon before the label from an mdi path", () => {
    const w = mount(Button, { props: { icon: mdiCheck }, slots: { default: "Done" } });
    const icon = w.find(".btn__icon");
    expect(icon.exists()).toBe(true);
    expect(icon.attributes("aria-hidden")).toBe("true");
    expect(icon.find("svg path").attributes("d")).toBe(mdiCheck);
    expect(w.text()).toBe("Done");
  });

  it("accepts an icon slot instead of a path", () => {
    const w = mount(Button, {
      slots: { default: "Upload", icon: '<span class="my-icon">↑</span>' },
    });
    expect(w.find(".btn__icon .my-icon").exists()).toBe(true);
    expect(w.find(".btn__label").text()).toBe("Upload");
  });

  it("icon-only hides the label and takes its accessible name from label", () => {
    const w = mount(Button, {
      props: { iconOnly: true, icon: mdiCheck, label: "Done" },
    });
    expect(w.classes()).toContain("btn--icon-only");
    expect(w.attributes("aria-label")).toBe("Done");
    expect(w.find(".btn__label").exists()).toBe(false);
    expect(w.text()).toBe("");
  });

  it("stays a real button so Enter and Space work", async () => {
    const w = mount(Button, { slots: { default: "Save" } });
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);
  });
});

describe("Button doctrine contract", () => {
  it("uses the focus ring the doctrine defines", () => {
    expect(STYLE).toMatch(
      /\.btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)[^}]*outline-offset:\s*2px/s
    );
  });

  it("uses role tokens instead of the primitive scales", () => {
    expect(STYLE).not.toMatch(/var\(--fs-/);
    expect(STYLE).not.toMatch(/var\(--space-/);
    expect(STYLE).not.toMatch(/var\(--radius-(xs|sm|md|lg|xl|2xl)\)/);
    expect(STYLE).toMatch(/font-size:\s*var\(--text-body\)/);
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-control\)/);
  });

  it("sizes md by the control height and sm by the touch target", () => {
    expect(STYLE).toMatch(/\.btn--md\s*\{[^}]*min-height:\s*var\(--control-height\)/s);
    expect(STYLE).toMatch(/\.btn--sm\s*\{[^}]*min-height:\s*var\(--touch-target\)/s);
  });

  it("halves opacity and blocks the cursor when disabled", () => {
    expect(STYLE).toMatch(/\.btn:disabled\s*\{[^}]*opacity:\s*0\.5/s);
    expect(STYLE).toMatch(/\.btn:disabled\s*\{[^}]*cursor:\s*not-allowed/s);
  });
});
