import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProgressBar from "@/components/ui/ProgressBar.vue";

describe("ProgressBar", () => {
  it("is a labelled progressbar with its value", () => {
    const wrapper = mount(ProgressBar, {
      props: { value: 42.4, label: "Upload progress", valueText: "Sending 2 of 5" },
    });
    const bar = wrapper.get("[role='progressbar']");
    expect(bar.attributes("aria-label")).toBe("Upload progress");
    expect(bar.attributes("aria-valuenow")).toBe("42");
    expect(bar.attributes("aria-valuetext")).toBe("Sending 2 of 5");
    expect(wrapper.get(".progress-bar__fill").attributes("style")).toContain("width: 42%");
  });

  it.each([
    [-5, "0"],
    [140, "100"],
  ])("clamps %s to %s", (value, expected) => {
    const wrapper = mount(ProgressBar, { props: { value, label: "x" } });
    expect(wrapper.get("[role='progressbar']").attributes("aria-valuenow")).toBe(expected);
  });

  it("is not a live region (the visible text beside it is the one announcement)", () => {
    const wrapper = mount(ProgressBar, { props: { value: 10, label: "x" } });
    expect(wrapper.find("[aria-live]").exists()).toBe(false);
  });
});
