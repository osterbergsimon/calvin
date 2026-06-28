import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScreenDots from "@/components/ui/ScreenDots.vue";

const screens = [
  { id: "s1", name: "Home" },
  { id: "s2", name: "Second" },
  { id: "s3", name: "Third" },
];

describe("ScreenDots", () => {
  it("renders one dot per screen and marks the active one", () => {
    const w = mount(ScreenDots, { props: { screens, activeScreenId: "s2" } });
    const dots = w.findAll("button");
    expect(dots).toHaveLength(3);
    expect(dots[1].classes()).toContain("is-active");
    expect(dots[1].attributes("aria-current")).toBe("true");
  });

  it("emits select-screen with the screen id on tap", async () => {
    const w = mount(ScreenDots, { props: { screens, activeScreenId: "s1" } });
    await w.findAll("button")[2].trigger("click");
    expect(w.emitted("select-screen")[0]).toEqual(["s3"]);
  });

  it("renders nothing for a single screen", () => {
    const w = mount(ScreenDots, { props: { screens: [{ id: "s1", name: "Home" }], activeScreenId: "s1" } });
    expect(w.find("button").exists()).toBe(false);
  });
});
