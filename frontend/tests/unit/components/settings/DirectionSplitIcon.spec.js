import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DirectionSplitIcon from "@/components/settings/shared/DirectionSplitIcon.vue";

describe("DirectionSplitIcon", () => {
  it("renders an svg with two split rects for the row direction", () => {
    const wrapper = mount(DirectionSplitIcon, { props: { direction: "row" } });
    expect(wrapper.find("svg").exists()).toBe(true);
    expect(wrapper.findAll("rect")).toHaveLength(2);
  });

  it("renders two rects for the column direction", () => {
    const wrapper = mount(DirectionSplitIcon, { props: { direction: "column" } });
    expect(wrapper.findAll("rect")).toHaveLength(2);
  });

  it("renders visually distinct glyphs for row vs column", () => {
    const row = mount(DirectionSplitIcon, { props: { direction: "row" } });
    const column = mount(DirectionSplitIcon, { props: { direction: "column" } });
    // Same rect count, different geometry — the two states must not look identical.
    expect(row.html()).not.toBe(column.html());
  });
});
