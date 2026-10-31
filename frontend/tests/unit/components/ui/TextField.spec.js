import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import TextField from "@/components/ui/TextField.vue";
import InlineNote from "@/components/ui/InlineNote.vue";

const SOURCE = readFileSync(
  resolve(__dirname, "../../../../src/components/ui/TextField.vue"),
  "utf-8"
);
const STYLE = SOURCE.slice(SOURCE.indexOf("<style"), SOURCE.indexOf("</style>"));

describe("TextField", () => {
  it("renders a labelled text input wired to its label", () => {
    const w = mount(TextField, { props: { label: "Display name", modelValue: "Kitchen" } });
    const input = w.find("input");
    expect(input.exists()).toBe(true);
    expect(input.attributes("type")).toBe("text");
    expect(input.element.value).toBe("Kitchen");
    expect(w.find("label").text()).toBe("Display name");
    expect(w.find("label").attributes("for")).toBe(input.attributes("id"));
  });

  it("can hide the label visually but keep it as the input's name", () => {
    const w = mount(TextField, { props: { label: "Colour value", hideLabel: true } });
    const label = w.find("label");
    expect(label.classes()).toContain("text-field__label--hidden");
    expect(label.text()).toBe("Colour value");
    expect(label.attributes("for")).toBe(w.find("input").attributes("id"));
  });

  it("emits the typed value", async () => {
    const w = mount(TextField, { props: { label: "Name" } });
    await w.find("input").setValue("Hall");
    expect(w.emitted("update:modelValue")).toEqual([["Hall"]]);
  });

  it("accepts the text-like input types and refuses the rest", () => {
    for (const type of ["text", "email", "url", "search", "tel"]) {
      const w = mount(TextField, { props: { label: "x", type } });
      expect(w.find("input").attributes("type")).toBe(type);
    }
    expect(TextField.props.type.validator("password")).toBe(false);
    expect(TextField.props.type.validator("number")).toBe(false);
  });

  it("forwards autocomplete, placeholder and disabled", () => {
    const w = mount(TextField, {
      props: {
        label: "Address",
        placeholder: "http://…",
        autocomplete: "url",
        disabled: true,
      },
    });
    const input = w.find("input");
    expect(input.attributes("placeholder")).toBe("http://…");
    expect(input.attributes("autocomplete")).toBe("url");
    expect(input.attributes("disabled")).toBeDefined();
  });

  it("shows a hint through the shared InlineNote", () => {
    const w = mount(TextField, { props: { label: "Name", hint: "Only letters." } });
    const note = w.findComponent(InlineNote);
    expect(note.exists()).toBe(true);
    expect(note.props("tone")).toBe("neutral");
    expect(note.text()).toBe("Only letters.");
    expect(w.find("input").attributes("aria-describedby")).toBe(note.attributes("id"));
  });

  it("shows an error instead of the hint and marks the field invalid", () => {
    const w = mount(TextField, {
      props: { label: "Name", hint: "Only letters.", error: "Enter a name." },
    });
    const notes = w.findAllComponents(InlineNote);
    expect(notes).toHaveLength(1);
    expect(notes[0].props("tone")).toBe("err");
    expect(notes[0].text()).toBe("Enter a name.");
    expect(w.find("input").attributes("aria-invalid")).toBe("true");
    expect(w.find("input").attributes("aria-describedby")).toBe(notes[0].attributes("id"));
  });

  it("accepts a hint slot", () => {
    const w = mount(TextField, {
      props: { label: "Name" },
      slots: { hint: "<b>Use the room name.</b>" },
    });
    expect(w.find("b").text()).toBe("Use the room name.");
  });

  it("exposes focus and select for dialogs and forms", () => {
    const w = mount(TextField, {
      props: { label: "Name", modelValue: "abc" },
      attachTo: document.body,
    });
    w.vm.focus();
    expect(document.activeElement).toBe(w.find("input").element);
    w.vm.select();
    expect(w.find("input").element.selectionStart).toBe(0);
    w.unmount();
  });

  it("uses role tokens and the control radius", () => {
    expect(STYLE).not.toMatch(/var\(--fs-/);
    expect(STYLE).not.toMatch(/var\(--space-/);
    expect(STYLE).not.toMatch(/var\(--radius-(xs|sm|md|lg|xl|2xl)\)/);
    expect(STYLE).toMatch(/font-size:\s*var\(--text-body\)/);
    expect(STYLE).toMatch(/border-radius:\s*var\(--radius-control\)/);
  });
});
