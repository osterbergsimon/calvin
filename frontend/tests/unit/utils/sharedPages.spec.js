import { describe, it, expect } from "vitest";
import { addPagePlan, pageDeletePlan, pageTogglePlan } from "@/utils/sharedPages";

const pages = [{ id: "home" }, { id: "photos" }];

describe("addPagePlan", () => {
  it("pins Default's all list and gives only the screen the new page", () => {
    expect(
      addPagePlan({
        scopeId: "kitchen",
        defaultList: null,
        pages,
        screenOverrides: {},
        pageId: "news",
      })
    ).toEqual({
      defaultList: ["home", "photos"],
      screenList: ["home", "photos", "news"],
    });
  });

  it("keeps Default's all list when the page is added from Default", () => {
    expect(
      addPagePlan({
        scopeId: null,
        defaultList: null,
        pages,
        screenOverrides: {},
        pageId: "news",
      })
    ).toEqual({ defaultList: null, screenList: null });
  });

  it("appends to Default's restricted list when added from Default", () => {
    expect(
      addPagePlan({
        scopeId: null,
        defaultList: ["home"],
        pages,
        screenOverrides: {},
        pageId: "news",
      })
    ).toEqual({ defaultList: ["home", "news"], screenList: null });
  });

  it("gives the screen its effective restricted list plus the new page", () => {
    expect(
      addPagePlan({
        scopeId: "kitchen",
        defaultList: ["home"],
        pages,
        screenOverrides: {},
        pageId: "news",
      })
    ).toEqual({ defaultList: ["home"], screenList: ["home", "news"] });
  });
});

describe("pageDeletePlan", () => {
  it("strips the page from Default and every screen, dropping empty overrides", () => {
    const plan = pageDeletePlan({
      pageId: "photos",
      pages: [...pages, { id: "news" }],
      defaultList: ["home", "photos"],
      screens: [
        { id: "kitchen", overrides: { availableScreens: ["photos"], defaultScreenId: "photos" } },
        { id: "hall", overrides: { availableScreens: ["photos", "news"] } },
        { id: "office", overrides: { availableScreens: ["home"] } },
      ],
    });

    expect(plan.defaultList).toEqual(["home"]);
    expect(plan.screens[0]).toEqual({
      id: "kitchen",
      overrides: {},
      changed: true,
    });
    expect(plan.screens[1]).toEqual({
      id: "hall",
      overrides: { availableScreens: ["news"] },
      changed: true,
    });
    expect(plan.screens[2]).toEqual({
      id: "office",
      overrides: { availableScreens: ["home"] },
      changed: false,
    });
  });

  it("leaves an all-pages Default list null and clears a matching start page", () => {
    const plan = pageDeletePlan({
      pageId: "photos",
      pages,
      defaultList: null,
      screens: [{ id: "hall", overrides: { defaultScreenId: "photos" } }],
    });
    expect(plan.defaultList).toBeNull();
    expect(plan.screens[0].overrides).toEqual({});
  });
});

describe("pageTogglePlan", () => {
  it("adds a page to Default, and every page stores null", () => {
    expect(
      pageTogglePlan({
        pageId: "photos",
        checked: true,
        targetIsDefault: true,
        defaultList: ["home"],
        pages,
      })
    ).toEqual({ availableScreens: null });
  });

  it("removes a page from a screen and becomes Changed here", () => {
    expect(
      pageTogglePlan({
        pageId: "home",
        checked: false,
        targetOverrides: {},
        defaultList: null,
        pages,
      })
    ).toEqual({ overrides: { availableScreens: ["photos"] } });
  });

  it("drops a screen override that matches Default again", () => {
    expect(
      pageTogglePlan({
        pageId: "photos",
        checked: true,
        targetOverrides: { availableScreens: ["home"] },
        defaultList: null,
        pages,
      })
    ).toEqual({ overrides: {} });
  });

  it("keeps an explicit all-pages screen list when Default is restricted", () => {
    expect(
      pageTogglePlan({
        pageId: "photos",
        checked: true,
        targetOverrides: { availableScreens: ["home"] },
        defaultList: ["home"],
        pages,
      })
    ).toEqual({ overrides: { availableScreens: ["home", "photos"] } });
  });

  it("refuses to turn off the last shown page", () => {
    expect(
      pageTogglePlan({
        pageId: "home",
        checked: false,
        targetOverrides: { availableScreens: ["home"] },
        defaultList: null,
        pages,
      })
    ).toEqual({ error: "Pick at least one page." });
  });

  it("ignores ghost ids when refusing the last real page on a screen", () => {
    expect(
      pageTogglePlan({
        pageId: "home",
        checked: false,
        targetOverrides: { availableScreens: ["ghost", "home"] },
        defaultList: null,
        pages,
      })
    ).toEqual({ error: "Pick at least one page." });
  });

  it("ignores ghost ids when refusing the last real page on Default", () => {
    expect(
      pageTogglePlan({
        pageId: "home",
        checked: false,
        targetIsDefault: true,
        defaultList: ["ghost", "home"],
        pages,
      })
    ).toEqual({ error: "Pick at least one page." });
  });
});
