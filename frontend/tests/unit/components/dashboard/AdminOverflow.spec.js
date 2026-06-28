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
});
