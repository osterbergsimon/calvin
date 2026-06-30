import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AdminOverflow from "@/components/dashboard/AdminOverflow.vue";
import { useConfigStore } from "@/stores/config";

describe("AdminOverflow", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const store = useConfigStore();
    store.showUI = true;
  });

  it("popover is closed initially and opens on trigger click", async () => {
    const w = mount(AdminOverflow, { attachTo: document.body });
    expect(w.find(".admin-overflow__menu").exists()).toBe(false);
    await w.get(".admin-overflow__trigger").trigger("click");
    expect(w.find(".admin-overflow__menu").exists()).toBe(true);
    w.unmount();
  });

  it("offers Settings / orientation / Hide UI and not the dead side-view + mode items (calvin-ayr)", async () => {
    const w = mount(AdminOverflow, { attachTo: document.body });
    await w.get(".admin-overflow__trigger").trigger("click");
    expect(w.find('[data-admin="settings"]').exists()).toBe(true);
    expect(w.find('[data-admin="orientation"]').exists()).toBe(true);
    expect(w.find('[data-admin="hide-ui"]').exists()).toBe(true);
    // legacy side-view-model actions are no-ops in the region layout — removed
    expect(w.find('[data-admin="mode"]').exists()).toBe(false);
    expect(w.find('[data-admin="side-view"]').exists()).toBe(false);
    w.unmount();
  });

  it("toggles orientation and closes after the action", async () => {
    const store = useConfigStore();
    const spy = vi.spyOn(store, "setOrientation");
    const w = mount(AdminOverflow, { attachTo: document.body });
    await w.get(".admin-overflow__trigger").trigger("click");
    await w.get('[data-admin="orientation"]').trigger("click");
    expect(spy).toHaveBeenCalled();
    expect(w.find(".admin-overflow__menu").exists()).toBe(false);
    w.unmount();
  });

  it("Escape closes the popover", async () => {
    const w = mount(AdminOverflow, { attachTo: document.body });
    await w.get(".admin-overflow__trigger").trigger("click");
    await w.get(".admin-overflow__trigger").trigger("keydown", { key: "Escape" });
    expect(w.find(".admin-overflow__menu").exists()).toBe(false);
    w.unmount();
  });

  it("opens upward + left-anchored for a bottom-left trigger (vertical bar) so it stays on-screen (calvin-37g)", async () => {
    const w = mount(AdminOverflow, { attachTo: document.body });
    const trigger = w.get(".admin-overflow__trigger");
    trigger.element.getBoundingClientRect = () => ({
      top: window.innerHeight - 50, left: 8, width: 46, height: 46,
      bottom: window.innerHeight - 4, right: 54,
    });
    await trigger.trigger("click");
    const menu = w.get(".admin-overflow__menu");
    expect(menu.classes()).toContain("admin-overflow__menu--up");
    expect(menu.classes()).toContain("admin-overflow__menu--left");
    w.unmount();
  });

  it("opens down/right (default) for a top-right trigger (horizontal bar)", async () => {
    const w = mount(AdminOverflow, { attachTo: document.body });
    const trigger = w.get(".admin-overflow__trigger");
    trigger.element.getBoundingClientRect = () => ({
      top: 8, left: window.innerWidth - 60, width: 46, height: 46,
      bottom: 54, right: window.innerWidth - 14,
    });
    await trigger.trigger("click");
    const menu = w.get(".admin-overflow__menu");
    expect(menu.classes()).not.toContain("admin-overflow__menu--up");
    expect(menu.classes()).not.toContain("admin-overflow__menu--left");
    w.unmount();
  });
});
