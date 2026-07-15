import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import KiosksSettings from "@/components/settings/categories/KiosksSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";

describe("KiosksSettings — update button", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls triggerUpdate when the update button is clicked", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        {
          id: "k1",
          hostname: "pi",
          lastSeen: new Date().toISOString(),
          agentVersion: "0.1.0",
          agentUpdateStatus: "ok",
          agentUpdateRequested: false,
        },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    store.fetchAvailableAgentVersion = vi.fn(async () => "0.2.0");
    store.triggerUpdate = vi.fn(async () => {});

    const wrapper = mount(KiosksSettings);
    await flushPromises();

    const btn = wrapper.find('[data-test="kiosk-update-btn"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe("Update");

    await btn.trigger("click");
    await flushPromises();

    expect(store.triggerUpdate).toHaveBeenCalledWith("k1");
  });

  it("does not show the update button when agentVersion matches availableVersion", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        {
          id: "k1",
          hostname: "pi",
          lastSeen: new Date().toISOString(),
          agentVersion: "0.2.0",
          agentUpdateStatus: "ok",
          agentUpdateRequested: false,
        },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    store.fetchAvailableAgentVersion = vi.fn(async () => "0.2.0");
    store.triggerUpdate = vi.fn(async () => {});

    const wrapper = mount(KiosksSettings);
    await flushPromises();

    expect(wrapper.find('[data-test="kiosk-update-btn"]').exists()).toBe(false);
  });

  it("shows Updating… and disables the button when agentUpdateRequested is true", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        {
          id: "k1",
          hostname: "pi",
          lastSeen: new Date().toISOString(),
          agentVersion: "0.1.0",
          agentUpdateStatus: "ok",
          agentUpdateRequested: true,
        },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    store.fetchAvailableAgentVersion = vi.fn(async () => "0.2.0");
    store.triggerUpdate = vi.fn(async () => {});

    const wrapper = mount(KiosksSettings);
    await flushPromises();

    const btn = wrapper.find('[data-test="kiosk-update-btn"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe("Updating…");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("does not show the update button when availableVersion is null", async () => {
    setActivePinia(createPinia());
    const store = useKiosksStore();
    store.loadKiosks = vi.fn(async () => {
      store.kiosks = [
        {
          id: "k1",
          hostname: "pi",
          lastSeen: new Date().toISOString(),
          agentVersion: "0.1.0",
          agentUpdateStatus: "ok",
          agentUpdateRequested: false,
        },
      ];
    });
    store.fetchOverrides = vi.fn(async () => ({}));
    store.fetchDeviceConfigVersion = vi.fn(async () => null);
    store.fetchAvailableAgentVersion = vi.fn(async () => null);
    store.triggerUpdate = vi.fn(async () => {});

    const wrapper = mount(KiosksSettings);
    await flushPromises();

    expect(wrapper.find('[data-test="kiosk-update-btn"]').exists()).toBe(false);
  });
});
