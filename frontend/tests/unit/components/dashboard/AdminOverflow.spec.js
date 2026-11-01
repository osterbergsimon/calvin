import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AdminOverflow from "@/components/dashboard/AdminOverflow.vue";
import { useConfigStore } from "@/stores/config";

const panel = () => document.querySelector(".popover__panel");
const menuItems = () =>
  Array.from(document.querySelectorAll(".menu [role='menuitem']")).map(item =>
    item.textContent.trim()
  );
const itemByText = text =>
  Array.from(document.querySelectorAll(".menu [role='menuitem']")).find(
    item => item.textContent.trim() === text
  );

const mountedWrappers = [];

const mountOverflow = () => {
  const wrapper = mount(AdminOverflow, { attachTo: document.body });
  mountedWrappers.push(wrapper);
  return wrapper;
};

const openMenu = async wrapper => {
  await wrapper.get(".admin-overflow__trigger").trigger("click");
  await flushPromises();
};

describe("AdminOverflow", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const store = useConfigStore();
    store.showUI = true;
  });

  afterEach(() => {
    while (mountedWrappers.length) mountedWrappers.pop().unmount();
    document.body.innerHTML = "";
  });

  it("popover is closed initially and opens on trigger click", async () => {
    const w = mountOverflow();
    expect(panel()).toBeNull();
    await openMenu(w);
    expect(panel()).not.toBeNull();
    expect(panel().getAttribute("role")).toBe("menu");
    w.unmount();
  });

  it("offers only Settings + Hide controls; legacy mode/side-view/orientation items are gone (calvin-ayr, calvin-7nm)", async () => {
    const w = mountOverflow();
    await openMenu(w);
    expect(menuItems()).toContain("Settings");
    expect(menuItems()).toContain("Hide controls");
    // these are no-ops / belong in Display settings now — removed from the ⋯ menu
    expect(menuItems()).not.toContain("Mode");
    expect(menuItems()).not.toContain("Side view");
    expect(menuItems()).not.toContain("Orientation");
    w.unmount();
  });

  it("Hide controls asks first, naming the scope and the reveal corner (F7)", async () => {
    const store = useConfigStore();
    store.hotCornerPosition = "top-right";
    const spy = vi.spyOn(store, "toggleUI").mockResolvedValue();
    const w = mountOverflow();
    await openMenu(w);
    itemByText("Hide controls").click();
    await flushPromises();

    expect(panel()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    const text = document.body.textContent;
    expect(text).toContain("on this screen");
    expect(text).not.toContain("every screen");
    expect(text).toContain("press and hold the top right corner");
    w.unmount();
  });

  it("confirming the dialog hides the controls; cancelling does not", async () => {
    const store = useConfigStore();
    const spy = vi.spyOn(store, "toggleUI").mockResolvedValue();
    const w = mountOverflow();
    const modal = () => w.findComponent({ name: "ConfirmModal" });

    await openMenu(w);
    itemByText("Hide controls").click();
    await flushPromises();
    modal().vm.$emit("cancel");
    await w.vm.$nextTick();
    expect(spy).not.toHaveBeenCalled();
    expect(modal().props("show")).toBe(false);

    await openMenu(w);
    itemByText("Hide controls").click();
    await flushPromises();
    modal().vm.$emit("confirm");
    expect(spy).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("offers Unlock layout only with >1 region, and toggles the lock (calvin-fou)", async () => {
    const store = useConfigStore();
    store.regionsLocked = true;
    store.dashboardScreens = {
      activeScreenId: "s1",
      screens: [
        {
          id: "s1",
          name: "Home",
          layout: {
            direction: "row",
            regions: [
              { id: "r1", kind: "calendar", instanceIds: [], size: 60 },
              { id: "r2", kind: "photos", instanceIds: [], size: 40 },
            ],
          },
        },
      ],
    };
    const spy = vi.spyOn(store, "toggleRegionsLock").mockResolvedValue();
    const w = mountOverflow();
    await openMenu(w);
    expect(menuItems()).toContain("Unlock layout");
    itemByText("Unlock layout").click();
    await flushPromises();
    expect(spy).toHaveBeenCalled();
    expect(panel()).toBeNull();
    w.unmount();
  });

  it("hides Unlock layout when the screen has a single region", async () => {
    const store = useConfigStore();
    store.dashboardScreens = {
      activeScreenId: "s1",
      screens: [
        {
          id: "s1",
          name: "Home",
          layout: {
            direction: "row",
            regions: [{ id: "r1", kind: "calendar", instanceIds: [], size: 100 }],
          },
        },
      ],
    };
    const w = mountOverflow();
    await openMenu(w);
    expect(menuItems()).not.toContain("Unlock layout");
    w.unmount();
  });

  it("Escape closes the popover", async () => {
    const w = mountOverflow();
    await openMenu(w);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(panel()).toBeNull();
    w.unmount();
  });

  it("opens upward for a bottom-left trigger (vertical bar) so it stays on-screen (calvin-37g)", async () => {
    const w = mountOverflow();
    const trigger = w.get(".popover");
    trigger.element.getBoundingClientRect = () => ({
      top: window.innerHeight - 50,
      left: 8,
      width: 46,
      height: 46,
      bottom: window.innerHeight - 4,
      right: 54,
    });
    await openMenu(w);
    expect(panel().classList).toContain("popover__panel--above");
    expect(panel().style.bottom).not.toBe("");
    expect(panel().style.top).toBe("");
    w.unmount();
  });

  it("opens down for a top-right trigger (horizontal bar)", async () => {
    const w = mountOverflow();
    const trigger = w.get(".popover");
    trigger.element.getBoundingClientRect = () => ({
      top: 8,
      left: window.innerWidth - 60,
      width: 46,
      height: 46,
      bottom: 54,
      right: window.innerWidth - 14,
    });
    await openMenu(w);
    expect(panel().classList).not.toContain("popover__panel--above");
    expect(panel().style.top).not.toBe("");
    expect(panel().style.bottom).toBe("");
    w.unmount();
  });
});
