import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CategoryRail from "@/components/settings/shell/CategoryRail.vue";

const cats = [
  { id: "dashboard", label: "Display", subtitle: "Layout · appearance · regions" },
  { id: "clock-bar", label: "Clock bar", subtitle: "Time · weather · status tiles" },
];

describe("CategoryRail", () => {
  it("renders an entry per category and marks the active one", () => {
    const w = mount(CategoryRail, { props: { categories: cats, activeId: "dashboard" } });
    const btns = w.findAll(".category-rail__item");
    expect(btns).toHaveLength(2);
    expect(w.find(".category-rail__item.is-active").text()).toContain("Display");
    expect(w.text()).toContain("Layout · appearance · regions");
  });
  it("emits select on click", async () => {
    const w = mount(CategoryRail, { props: { categories: cats, activeId: "dashboard" } });
    await w.findAll(".category-rail__item")[1].trigger("click");
    expect(w.emitted("select")[0]).toEqual(["clock-bar"]);
  });
});
