/** BarLogo (L15): the wordmark is one labelled image, not loose letters. */

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BarLogo from "@/components/BarLogo.vue";

describe("BarLogo", () => {
  it("exposes the wordmark as a labelled image", () => {
    const wrapper = mount(BarLogo);

    const logo = wrapper.get(".bar-logo");
    expect(logo.attributes("role")).toBe("img");
    expect(logo.attributes("aria-label")).toBe("Calvin");
  });

  it("keeps the same role in the vertical side bar", () => {
    const wrapper = mount(BarLogo, { props: { vertical: true } });

    expect(wrapper.get(".bar-logo").attributes("role")).toBe("img");
  });
});
