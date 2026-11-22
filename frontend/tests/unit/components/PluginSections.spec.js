/** The plugin upload row speaks plain words and keeps its status line mounted. */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PluginSections from "@/components/PluginSections.vue";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";

const SECTIONS = [{ id: "photos", type: "upload", title: "Photos", multiple: true }];

const mountUpload = (props = {}) =>
  mount(PluginSections, { props: { sections: SECTIONS, ...props } });

describe("PluginSections upload", () => {
  it("chooses photos through the shared Button, and says it is uploading", () => {
    const idle = mountUpload();
    const button = idle.findComponent(Button);
    expect(button.text()).toBe("Choose photos");
    expect(button.props("loading")).toBe(false);

    const busy = mountUpload({ uploading: true });
    expect(busy.findComponent(Button).props("loading")).toBe(true);
    expect(busy.findComponent(Button).props("loadingLabel")).toBe("Uploading…");
    expect(busy.findComponent(Button).text()).toBe("Uploading…");
  });

  it("keeps the error line mounted and polite, and says the error in plain words", async () => {
    const w = mountUpload();
    const note = w.findComponent(InlineNote);
    expect(note.exists()).toBe(true);
    expect(note.attributes("role")).toBe("status");
    expect(note.text()).toBe("");
    // Nothing to say: neither an icon nor a tone.
    expect(note.find(".inline-note__icon").exists()).toBe(false);

    await w.setProps({ uploadError: "Something went wrong on the Calvin server." });
    expect(note.text()).toBe("Something went wrong on the Calvin server.");
    expect(note.props("tone")).toBe("err");
    expect(note.find(".inline-note__icon").exists()).toBe(true);
  });

  it("shows the success line it is given", () => {
    const w = mountUpload({ uploadSuccess: "Uploaded 3 photos." });
    expect(w.find(".success-message").text()).toBe("Uploaded 3 photos.");
  });
});
