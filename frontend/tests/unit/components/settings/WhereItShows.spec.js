import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useRouter } from "vue-router";
import WhereItShows from "@/components/settings/specialized/WhereItShows.vue";
import { useRegionEditorRequest } from "@/composables/useRegionEditorRequest";
import { usePlacementRequest } from "@/composables/usePlacementRequest";

vi.mock("vue-router", () => ({
  useRouter: vi.fn(),
}));

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
        ],
      },
    },
  ],
};

const sources = [
  { id: "family", name: "Family" },
  { id: "school", name: "School" },
];

const mountWhere = (props = {}) =>
  mount(WhereItShows, {
    props: {
      kind: "calendar",
      title: "calendars",
      config: { dashboardScreens: screens },
      sources,
      ...props,
    },
  });

describe("WhereItShows", () => {
  let replace;

  beforeEach(() => {
    setActivePinia(createPinia());
    replace = vi.fn();
    useRouter.mockReturnValue({ replace });
    useRegionEditorRequest().clearRegionRequest();
    usePlacementRequest().clearPlacement();
  });

  it("lists one line per region with its look and source filter", () => {
    const w = mountWhere();
    expect(w.find(".where-shows__title").text()).toBe("Where calendars show");
    const rows = w.findAll('[data-test="where-shows-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain("Home · Calendar");
    expect(rows[0].text()).toContain("Month · week numbers · Auto events");
    expect(rows[0].text()).toContain("Family, School");
  });

  it("a line is a 44px button that opens the editor on that page with that region selected", async () => {
    const w = mountWhere();
    const row = w.find('[data-test="where-shows-row"]');
    expect(row.element.tagName).toBe("BUTTON");
    await row.trigger("click");
    expect(useRegionEditorRequest().regionRequest.value).toEqual({
      pageId: "home",
      regionId: "cal",
    });
    expect(replace).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "dashboard-regions" },
    });
  });

  it("says nothing is placed yet and offers Put it on a page", async () => {
    const w = mountWhere({ kind: "photos", title: "photos" });
    expect(w.text()).toContain("Not on any page yet.");
    const place = w.find('[data-test="where-shows-place"]');
    expect(place.text()).toBe("Put it on a page");
    await place.trigger("click");
    expect(usePlacementRequest().placement.value).toMatchObject({
      kind: "photos",
      name: "photos",
    });
    expect(replace).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "dashboard-regions" },
    });
  });
});
