import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RegionInspector from "@/components/settings/shared/regions/RegionInspector.vue";

const mountWith = (region, context, screenRegions, extraProps = {}) =>
  mount(RegionInspector, {
    props: {
      region,
      screen: { name: "Home", layout: { regions: screenRegions ?? [region] } },
      layoutDir: "row",
      componentOptions: [],
      sourceOptions: [],
      context,
      ...extraProps,
    },
    global: {
      stubs: {
        SegmentedControl: true,
        ToggleSwitch: true,
        NumberStepper: true,
        SelectPill: true,
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
      [top]
    );
    const t = toggleText(w);
    expect(t.some(x => x.includes("Split region"))).toBe(false);
    expect(t.some(x => x.includes("Unsplit"))).toBe(false);
  });
});

describe("RegionInspector doctrine rows (CLV-87)", () => {
  const context = { depth: 1, isSub: false, canSplit: false, canAddSub: false, splitDir: "row" };
  const leaf = () => ({ id: "r1", kind: "calendar", size: 100, instanceIds: [] });
  const toggleRows = w =>
    w
      .findAllComponents({ name: "SettingRow" })
      .filter(row => row.findAllComponents({ name: "ToggleSwitch" }).length > 0);

  it("labels the picker once, under the Shows heading", () => {
    const w = mountWith(leaf(), context);
    expect(w.find(".ins-field .picker").exists()).toBe(true);
    expect(w.findAll(".setting-row__label").map(n => n.text())).not.toContain("Component");
  });

  it("keeps every toggle on the right of its label", () => {
    const rows = toggleRows(mountWith(leaf(), context));
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.classes()).toContain("ins-toggle-row");
  });

  it("lines the source chips up with their label", () => {
    const w = mountWith(leaf(), context, undefined, {
      sourceOptions: [{ id: "family", name: "Family" }],
    });
    expect(w.findComponent({ name: "ChipMultiSelect" }).classes()).toContain("ins-sources");
  });

  it("hides its heading when the phone sheet supplies one", () => {
    expect(mountWith(leaf(), context).find(".ins-mode").exists()).toBe(true);
    expect(
      mountWith(leaf(), context, undefined, { hideHeading: true }).find(".ins-mode").exists()
    ).toBe(false);
  });
});

describe("RegionInspector sources", () => {
  const sources = [
    { id: "family", name: "Family" },
    { id: "work", name: "Work" },
  ];
  const mountSources = region =>
    mount(RegionInspector, {
      props: {
        region,
        screen: { name: "Home", layout: { regions: [region] } },
        layoutDir: "row",
        componentOptions: [],
        sourceOptions: sources,
        context: { depth: 1, isSub: false, canSplit: false, canAddSub: false, splitDir: "row" },
      },
      global: {
        stubs: {
          SegmentedControl: true,
          ToggleSwitch: true,
          NumberStepper: true,
          SelectPill: true,
        },
      },
    });
  const chips = w => w.findAllComponents({ name: "ChipMultiSelect" })[0];

  it("marks All sources while the region inherits every source", () => {
    const w = mountSources({ id: "r1", kind: "calendar", size: 100, instanceIds: [] });
    expect(chips(w).props("modelValue")).toEqual(["__all__"]);
  });

  it("narrows to a picked source while All sources is on", () => {
    const w = mountSources({ id: "r1", kind: "calendar", size: 100, instanceIds: [] });
    chips(w).vm.$emit("update:modelValue", ["__all__", "family"]);
    expect(w.emitted("toggle-source")[0]).toEqual(["family", true]);
    expect(w.emitted("clear-sources")).toBeUndefined();
  });

  it("goes back to every source when All sources is picked", () => {
    const w = mountSources({ id: "r1", kind: "calendar", size: 100, instanceIds: ["family"] });
    chips(w).vm.$emit("update:modelValue", ["__all__"]);
    expect(w.emitted("clear-sources")?.length).toBe(1);
    expect(w.emitted("toggle-source")).toBeUndefined();
  });

  it("toggles one source off an explicit list", () => {
    const w = mountSources({
      id: "r1",
      kind: "calendar",
      size: 100,
      instanceIds: ["family", "work"],
    });
    chips(w).vm.$emit("update:modelValue", ["work"]);
    expect(w.emitted("toggle-source")[0]).toEqual(["family", false]);
  });
});

describe("RegionInspector display settings (CLV-49)", () => {
  const context = { depth: 1, isSub: false, canSplit: false, canAddSub: false, splitDir: "row" };
  const calendar = (view = {}) => ({
    id: "r1",
    kind: "calendar",
    size: 100,
    instanceIds: [],
    view: { mode: "month", rolling: true, weeks: 4, ...view },
  });

  it("writes week numbers to the region's view", async () => {
    const w = mountWith(calendar(), context);
    const toggle = w
      .findAllComponents({ name: "ToggleSwitch" })
      .find(c => c.props("ariaLabel") === "Week numbers");
    expect(toggle).toBeTruthy();
    toggle.vm.$emit("update:modelValue", true);
    expect(w.emitted("patch-view")[0][0]).toEqual({ weekNumbers: true });
  });

  it("offers Auto and the fixed events-per-day values, writing null for Auto", async () => {
    const w = mountWith(calendar(), context);
    const pill = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Events per day");
    expect(pill.props("options").map(o => o.label)).toEqual(["Auto", "1", "2", "3", "4", "6", "8"]);
    pill.vm.$emit("update:modelValue", "6");
    expect(w.emitted("patch-view")[0][0]).toEqual({ maxVisibleEvents: 6 });
    pill.vm.$emit("update:modelValue", "auto");
    expect(w.emitted("patch-view")[1][0]).toEqual({ maxVisibleEvents: undefined });
  });

  it("shows Auto when the region has no events-per-day value", () => {
    const w = mountWith(calendar({ maxVisibleEvents: undefined }), context);
    const pill = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Events per day");
    expect(pill.props("modelValue")).toBe("auto");
  });

  it("offers the four photo fit options and writes the region's fit", async () => {
    const w = mountWith({ id: "r1", kind: "photos", size: 100, instanceIds: [] }, context);
    const pill = w
      .findAllComponents({ name: "SelectPill" })
      .find(c => c.props("ariaLabel") === "Fit photos");
    expect(pill.props("options").map(o => o.label)).toEqual([
      "Smart",
      "Whole photo",
      "Fill",
      "Centre",
    ]);
    pill.vm.$emit("update:modelValue", "fit");
    expect(w.emitted("patch-view")[0][0]).toEqual({ fit: "fit" });
  });
});
