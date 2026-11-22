/**
 * StatusRail (M10): the rail is the one live region. A tile is plain content
 * with a click target and a close button; it is not a second live region and
 * not a stop in the Tab order.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import StatusRail from "@/components/StatusRail.vue";
import { useNotificationsStore } from "@/stores/notifications";

describe("StatusRail", () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useNotificationsStore();
  });

  const addSticky = () =>
    store.notify({ severity: "info", eyebrow: "System", message: "Backup finished" });

  it("keeps the rail as the single polite live region", () => {
    addSticky();
    const wrapper = mount(StatusRail);

    const rail = wrapper.get(".status-rail");
    expect(rail.attributes("role")).toBe("status");
    expect(rail.attributes("aria-live")).toBe("polite");
  });

  it("leaves each tile out of the live regions and the Tab order", () => {
    addSticky();
    const wrapper = mount(StatusRail);

    const tile = wrapper.get(".annunciator");
    expect(tile.attributes("role")).toBeUndefined();
    expect(tile.attributes("tabindex")).toBeUndefined();
  });

  it("keeps the close button as the keyboard path to dismiss a tile", async () => {
    const id = addSticky();
    const wrapper = mount(StatusRail);

    const close = wrapper.get(".annunciator__close");
    expect(close.attributes("aria-label")).toBe("Dismiss System");

    await close.trigger("click");
    expect(store.items.find(item => item.id === id)).toBeUndefined();
  });

  it("still dismisses on a tile click", async () => {
    const id = addSticky();
    const wrapper = mount(StatusRail);

    await wrapper.get(".annunciator").trigger("click");
    expect(store.items.find(item => item.id === id)).toBeUndefined();
  });
});
