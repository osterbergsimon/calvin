import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChangedHereLine from "@/components/settings/shared/ChangedHereLine.vue";

describe("ChangedHereLine wrapping", () => {
  it("keeps each name whole and leaves a breakable space between names", () => {
    const wrapper = mount(ChangedHereLine, {
      props: {
        items: [
          { key: "brightnessRampEnabled", label: "Ramp brightness at sleep and wake" },
          { key: "brightness", label: "Brightness" },
          { key: "brightnessLimit", label: "Brightness limit" },
        ],
      },
    });
    const links = wrapper.findAll("a");
    expect(links.map(link => link.text())).toEqual([
      "Ramp brightness at sleep and wake",
      "Brightness",
      "Brightness limit",
    ]);
    expect(wrapper.text().replace(/\s+/g, " ")).toBe(
      "Changed here: Ramp brightness at sleep and wake, Brightness, Brightness limit"
    );
  });
});
