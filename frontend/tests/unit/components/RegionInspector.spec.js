import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RegionInspector from "@/components/settings/shared/regions/RegionInspector.vue";

const mountWith = (region, context, screenRegions) =>
  mount(RegionInspector, {
    props: {
      region,
      screen: { name: "Home", layout: { regions: screenRegions ?? [region] } },
      layoutDir: "row",
      componentOptions: [],
      sourceOptions: [],
      context,
    },
    global: {
      stubs: {
        SegmentedControl: true,
        ToggleSwitch: true,
        NumberStepper: true,
      },
    },
  });

const toggleText = w =>
  w
    .findAll("button")
    .map(b => b.text())
    .filter(t => t.includes("Split") || t.includes("Unsplit"));

describe("RegionInspector split toggle", () => {
  it("shows Unsplit for a split region even when context.canSplit is false", () => {
    const region = {
      id: "r1",
      kind: "calendar",
      size: 100,
      split: {
        direction: null,
        regions: [
          { id: "r1-a", kind: "calendar", size: 50 },
          { id: "r1-b", kind: "photos", size: 50 },
        ],
      },
    };
    const w = mountWith(region, {
      depth: 1,
      isSub: false,
      canSplit: false,
      canAddSub: true,
      splitDir: "column",
    });
    expect(toggleText(w).some(t => t.includes("Unsplit"))).toBe(true);
  });

  it("shows Split region for a splittable leaf", () => {
    const region = { id: "r1", kind: "calendar", size: 100 };
    const w = mountWith(region, {
      depth: 1,
      isSub: false,
      canSplit: true,
      canAddSub: false,
      splitDir: "row",
    });
    expect(toggleText(w).some(t => t === "Split region" || t.includes("Split region"))).toBe(true);
  });

  it("shows neither Split nor Unsplit for a depth-3 leaf", () => {
    const region = { id: "r1-a-a", kind: "service", size: 50 };
    const top = {
      id: "top",
      kind: "calendar",
      size: 100,
      split: { regions: [region, { id: "x", kind: "photos", size: 50 }] },
    };
    const w = mountWith(
      region,
      { depth: 3, isSub: true, canSplit: false, canAddSub: false, splitDir: "row" },
      [top],
    );
    const t = toggleText(w);
    expect(t.some(x => x.includes("Split region"))).toBe(false);
    expect(t.some(x => x.includes("Unsplit"))).toBe(false);
  });
});
