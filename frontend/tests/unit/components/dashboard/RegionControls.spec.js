import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";

const handleAction = vi.fn();

/**
 * Create a module-scoped fake ref that can be flipped between tests.
 * vi.hoisted() runs before any imports so the factory is in scope when
 * vi.mock() factories run (which are also hoisted).
 * Setting __v_isRef: true makes Vue's template engine treat this as a
 * proper ref and auto-unwrap it in v-if expressions.
 */
const { isTouchRef } = vi.hoisted(() => ({
  isTouchRef: { __v_isRef: true, value: true },
}));

vi.mock("@/composables/useKeyboardActions", () => ({
  useKeyboardActions: () => ({ handleAction }),
}));

vi.mock("@/composables/useTouchCapability", () => ({
  useTouchCapability: () => ({ isTouch: isTouchRef }),
}));

import RegionControls from "@/components/dashboard/RegionControls.vue";

describe("RegionControls", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    handleAction.mockClear();
    isTouchRef.value = true; // reset to touch mode before each test
  });

  it("calendar renders prev/next/refresh (no expand — tap an event to open)", async () => {
    const w = mount(RegionControls, { props: { regionKind: "calendar" } });
    const buttons = w.findAll("button");
    expect(buttons).toHaveLength(3);
    expect(w.find('[data-action="expand"]').exists()).toBe(false);
    await w.get('[data-action="prev"]').trigger("click");
    await w.get('[data-action="next"]').trigger("click");
    await w.get('[data-action="refresh"]').trigger("click");
    expect(handleAction.mock.calls.map(c => c[0])).toEqual([
      "calendar_prev",
      "calendar_next",
      "calendar_refresh",
    ]);
  });

  it("photos omits refresh and uses image/photo actions", async () => {
    const w = mount(RegionControls, { props: { regionKind: "photos" } });
    expect(w.find('[data-action="refresh"]').exists()).toBe(false);
    await w.get('[data-action="expand"]').trigger("click");
    expect(handleAction).toHaveBeenCalledWith("photos_enter_fullscreen");
  });

  it("service wires to web_service actions", async () => {
    const w = mount(RegionControls, { props: { regionKind: "service" } });
    await w.get('[data-action="next"]').trigger("click");
    await w.get('[data-action="refresh"]').trigger("click");
    expect(handleAction).toHaveBeenCalledWith("web_service_next");
    expect(handleAction).toHaveBeenCalledWith("service_refresh");
  });

  it("renders nothing on a non-touch device", () => {
    // Flip the shared ref to false BEFORE mounting so the component sees
    // isTouch=false at construction time and the v-if gate omits the root element.
    isTouchRef.value = false;
    const w = mount(RegionControls, { props: { regionKind: "calendar" } });
    expect(w.find(".region-controls").exists()).toBe(false);
  });

  it("applies the configured size class (default medium)", () => {
    const def = mount(RegionControls, { props: { regionKind: "calendar" } });
    expect(def.find(".region-controls").classes()).toContain("region-controls--medium");

    useConfigStore().touchControlSize = "small";
    const small = mount(RegionControls, { props: { regionKind: "calendar" } });
    expect(small.find(".region-controls").classes()).toContain("region-controls--small");

    useConfigStore().touchControlSize = "large";
    const large = mount(RegionControls, { props: { regionKind: "calendar" } });
    expect(large.find(".region-controls").classes()).toContain("region-controls--large");
  });
});
