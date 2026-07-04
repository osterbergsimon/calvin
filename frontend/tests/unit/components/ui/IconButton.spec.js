import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import IconButton from "@/components/ui/IconButton.vue";

describe("IconButton", () => {
  it("renders a <button type=button> with the label as aria-label", () => {
    const w = mount(IconButton, { props: { label: "Close" } });
    expect(w.element.tagName).toBe("BUTTON");
    expect(w.attributes("type")).toBe("button");
    expect(w.attributes("aria-label")).toBe("Close");
  });

  it("applies default variant/size/shape classes", () => {
    const w = mount(IconButton, { props: { label: "x" } });
    expect(w.classes()).toEqual(
      expect.arrayContaining(["icon-btn", "icon-btn--default", "icon-btn--sm", "icon-btn--square"])
    );
    expect(w.classes()).not.toContain("icon-btn--active");
  });

  it("applies requested variant/size/shape and the active modifier", () => {
    const w = mount(IconButton, {
      props: { label: "Fullscreen", variant: "primary", size: "lg", shape: "circle", active: true },
    });
    expect(w.classes()).toEqual(
      expect.arrayContaining([
        "icon-btn--primary",
        "icon-btn--lg",
        "icon-btn--circle",
        "icon-btn--active",
      ])
    );
  });

  it("forwards native click", async () => {
    const onClick = vi.fn();
    const w = mount(IconButton, { props: { label: "x" }, attrs: { onClick } });
    await w.trigger("click");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reflects disabled on the native button", () => {
    const w = mount(IconButton, { props: { label: "x", disabled: true } });
    expect(w.attributes("disabled")).toBeDefined();
  });

  it("renders default-slot content", () => {
    const w = mount(IconButton, {
      props: { label: "Close" },
      slots: { default: "<svg data-test='glyph'></svg>" },
    });
    expect(w.find("[data-test='glyph']").exists()).toBe(true);
  });

  it("passes aria-* through to the button", () => {
    const w = mount(IconButton, {
      props: { label: "More" },
      attrs: { "aria-expanded": "true", "aria-haspopup": "menu" },
    });
    expect(w.attributes("aria-expanded")).toBe("true");
    expect(w.attributes("aria-haspopup")).toBe("menu");
  });
});
