import { describe, it, expect } from "vitest";
import { describeRegionLook, whereItShows } from "@/utils/whereItShows";

const screens = {
  activeScreenId: "home",
  screens: [
    {
      id: "home",
      name: "Home",
      layout: {
        regions: [
          {
            id: "cal",
            kind: "calendar",
            size: 70,
            instanceIds: ["family", "school"],
            view: { mode: "month", weekNumbers: true },
          },
          { id: "photos", kind: "photos", size: 30, view: { fit: "fit" } },
        ],
      },
    },
    {
      id: "kitchen",
      name: "Kitchen",
      layout: {
        regions: [{ id: "cal-2", kind: "calendar", size: 100, view: { mode: "week", days: 7 } }],
      },
    },
  ],
};

const sources = [
  { id: "family", name: "Family" },
  { id: "school", name: "School" },
];

describe("describeRegionLook", () => {
  it("summarises a calendar region", () => {
    expect(
      describeRegionLook({
        kind: "calendar",
        view: { mode: "month", weekNumbers: true, maxVisibleEvents: undefined },
      })
    ).toBe("Month · week numbers · Auto events");
  });

  it("describes the agenda and its day count", () => {
    expect(describeRegionLook({ kind: "calendar", view: { mode: "week", days: 7 } })).toBe(
      "Agenda, 7 days"
    );
  });

  it("names an explicit events-per-day count", () => {
    expect(
      describeRegionLook({ kind: "calendar", view: { mode: "month", maxVisibleEvents: 2 } })
    ).toBe("Month · 2 events");
  });

  it("summarises a photos region's fit", () => {
    expect(describeRegionLook({ kind: "photos", view: {} })).toBe("Smart fit");
    expect(describeRegionLook({ kind: "photos", view: { fit: "fit" } })).toBe("Whole photo");
    expect(describeRegionLook({ kind: "photos", view: { fit: "fill" } })).toBe("Fill");
    expect(describeRegionLook({ kind: "photos", view: { fit: "center" } })).toBe("Centre");
  });

  it("names the source a service region shows", () => {
    expect(
      describeRegionLook({ kind: "service", instanceIds: ["weather"] }, [
        { id: "weather", name: "Weather" },
      ])
    ).toBe("Weather");
  });
});

describe("whereItShows", () => {
  it("lists one line per region of the kind across every page", () => {
    const lines = whereItShows({ dashboardScreens: screens }, "calendar", sources);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      pageId: "home",
      pageName: "Home",
      regionId: "cal",
      regionLabel: "Calendar",
      summary: "Month · week numbers · Auto events",
      sourceNames: ["Family", "School"],
    });
    expect(lines[1]).toMatchObject({
      pageName: "Kitchen",
      regionId: "cal-2",
      summary: "Agenda, 7 days",
      sourceNames: [],
    });
  });

  it("lists photos regions with their fit", () => {
    const lines = whereItShows({ dashboardScreens: screens }, "photos", sources);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ pageName: "Home", summary: "Whole photo" });
  });

  it("uses source names for service regions and their filter", () => {
    const config = {
      dashboardScreens: {
        activeScreenId: "s",
        screens: [
          {
            id: "s",
            name: "Home",
            layout: {
              regions: [
                { id: "svc", kind: "service", size: 100, instanceIds: ["weather", "news"] },
              ],
            },
          },
        ],
      },
    };
    const lines = whereItShows(config, "service", [
      { id: "weather", name: "Weather" },
      { id: "news", name: "News" },
    ]);
    expect(lines[0]).toMatchObject({
      regionLabel: "Service",
      summary: "Weather",
      sourceNames: [],
    });
  });

  it("returns no lines when the kind is not on any page", () => {
    expect(whereItShows({ dashboardScreens: screens }, "service", sources)).toEqual([]);
  });
});
