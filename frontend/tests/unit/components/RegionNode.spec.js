import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RegionNode from "../../../src/components/settings/shared/regions/RegionNode.vue";

const split3 = {
  id: "r1", kind: "calendar", size: 100,
  split: { direction: "column", regions: [
    { id: "r1-a", kind: "photos", size: 50 },
    { id: "r1-b", kind: "service", size: 50,
      split: { direction: "row", regions: [
        { id: "r1-b-a", kind: "photos", size: 50 },
        { id: "r1-b-b", kind: "calendar", size: 50 },
      ] } },
  ] },
};

describe("RegionNode", () => {
  it("renders nested RegionNodes and emits select with the clicked id", async () => {
    const wrapper = mount(RegionNode, {
      props: { region: split3, path: [0], parentDirection: "row", selectedId: null, layoutDir: "row" },
    });
    // findAllComponents finds descendants only (excludes the root wrapper itself).
    // The tree has 5 total RegionNode instances; 4 are descendants of the root.
    expect(wrapper.findAllComponents(RegionNode).length).toBe(4); // 4 descendants (root wrapper excluded): r1-a, r1-b, r1-b-a, r1-b-b
    await wrapper.find("[data-region-id='r1-b-a']").trigger("click");
    // The deepest node re-emits up to the root; assert the root saw a select for r1-b-a.
    expect(wrapper.emitted("select").flat()).toContain("r1-b-a");
  });
});
