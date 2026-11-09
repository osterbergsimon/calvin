/** A failed renderer chunk shows a retry control in the clock bar (calvin-o8c1). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import PluginStatusbarItems from "@/components/PluginStatusbarItems.vue";
import { useWebServicesStore } from "@/stores/webServices";

const chunk = vi.hoisted(() => ({ fail: true }));

vi.mock("@/components/plugins/SchemaStatusbarItem.vue", async () => {
  if (chunk.fail) throw new Error("Failed to fetch dynamically imported module");
  const { h } = await import("vue");
  return {
    default: { name: "SchemaStatusbarItem", render: () => h("span", { class: "tile-ok" }) },
  };
});

const settle = async () => {
  await nextTick();
  await vi.dynamicImportSettled();
  await flushPromises();
  await nextTick();
};

describe("PluginStatusbarItems when the renderer chunk fails", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    setActivePinia(createPinia());
    const store = useWebServicesStore();
    vi.spyOn(store, "fetchServices").mockResolvedValue();
    store.services = [{ id: "weather", statusbar_schema: { kind: "status" }, config: {} }];
    chunk.fail = true;
  });
  afterEach(() => vi.useRealTimers());

  it("shows a retry control once the automatic retries run out", async () => {
    const wrapper = mount(PluginStatusbarItems, {
      global: { config: { errorHandler: () => {} } },
    });
    // Automatic retries run out first.
    for (let i = 0; i < 4; i++) {
      await settle();
      await vi.advanceTimersByTimeAsync(2000);
    }
    await settle();

    const retry = wrapper.find("[data-test='statusbar-retry']");
    expect(retry.exists()).toBe(true);

    wrapper.unmount();
  });
});
