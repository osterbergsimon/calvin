import { describe, it, expect, vi, afterEach } from "vitest";
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
  it("roving tabindex: exactly one item has tabindex=0 after ArrowDown", async () => {
    const w = mount(CategoryRail, {
      props: { categories: cats, activeId: "dashboard" },
      attachTo: document.body,
    });
    await w.findAll(".category-rail__item")[0].trigger("keydown", { key: "ArrowDown" });
    const items = w.findAll(".category-rail__item");
    const withTabindex0 = items.filter(item => item.attributes("tabindex") === "0");
    expect(withTabindex0).toHaveLength(1);
    w.unmount();
  });

  describe("scrolling when the categories don't fit (calvin-g7v follow-up)", () => {
    let observerCallback;
    afterEach(() => vi.unstubAllGlobals());

    function mountWithHeights({ scrollHeight, clientHeight }) {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(cb) {
            observerCallback = cb;
          }
          observe() {}
          disconnect() {}
        }
      );
      const w = mount(CategoryRail, { props: { categories: cats, activeId: "dashboard" } });
      const rail = w.find(".category-rail").element;
      Object.defineProperty(rail, "scrollHeight", { configurable: true, value: scrollHeight });
      Object.defineProperty(rail, "clientHeight", { configurable: true, value: clientHeight });
      observerCallback([]);
      return w;
    }

    it("becomes a scroll container when its items overflow, at any viewport height", async () => {
      const w = mountWithHeights({ scrollHeight: 520, clientHeight: 468 });
      await w.vm.$nextTick();
      expect(w.find(".category-rail").classes()).toContain("is-scrollable");
    });

    it("stays a non-scrolling box when the items fit, so the selected glow isn't clipped", async () => {
      const w = mountWithHeights({ scrollHeight: 468, clientHeight: 468 });
      await w.vm.$nextTick();
      expect(w.find(".category-rail").classes()).not.toContain("is-scrollable");
    });
  });
});
