/** BarActionCluster (CLV-48): one connection pill, no healthy/error dot. */

import { describe, it, expect, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import BarActionCluster from "@/components/BarActionCluster.vue";
import { useConfigStore } from "@/stores/config";
import { useConnectionStore } from "@/stores/connection";

describe("BarActionCluster", () => {
  let configStore;
  let connectionStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    configStore = useConfigStore();
    configStore.showUI = true;
    connectionStore = useConnectionStore();
    connectionStore.isOnline = true;
    connectionStore.hasChecked = true;
  });

  it("renders neither of the old indicators", async () => {
    const wrapper = mount(BarActionCluster, {
      global: { stubs: { AdminOverflow: true, Teleport: true } },
    });
    await flushPromises();

    expect(wrapper.find(".connection-indicator").exists()).toBe(false);
    expect(wrapper.find(".status-indicator").exists()).toBe(false);
    expect(wrapper.find(".status-dot").exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/healthy|no connection|backend/i);
  });

  it("shows only the one connection pill when unreachable", async () => {
    connectionStore.consecutiveFailures = 2;
    connectionStore.lastBackendCheck = new Date(2026, 9, 30, 8, 41);

    const wrapper = mount(BarActionCluster, {
      global: { stubs: { AdminOverflow: true, Teleport: true } },
    });
    await flushPromises();

    expect(wrapper.findAll('[data-test="connection-pill"]')).toHaveLength(1);
    expect(wrapper.text()).toContain("Can't reach Calvin");
  });
});
