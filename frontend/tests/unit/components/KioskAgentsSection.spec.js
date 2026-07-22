import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import KioskAgentsSection from "@/components/settings/shared/KioskAgentsSection.vue";
import { useKiosksStore } from "@/stores/kiosks";

function setupStore({ kiosks = [], availableVersion = null } = {}) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.fetchAvailableAgentVersion = vi.fn(async () => availableVersion);
  store.triggerUpdate = vi.fn(async () => {});
  return store;
}

const kiosk = (over = {}) => ({
  id: "kitchen",
  hostname: "pi",
  lastSeen: new Date().toISOString(),
  agentVersion: "0.1.0",
  agentUpdateStatus: "ok",
  agentUpdateRequested: false,
  ...over,
});

describe("KioskAgentsSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when no kiosks are registered", async () => {
    setupStore();
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    expect(wrapper.find('[data-test="agent-row"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("lists kiosks with agent and available versions", async () => {
    setupStore({ kiosks: [kiosk()], availableVersion: "0.2.0" });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    const row = wrapper.find('[data-test="agent-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("kitchen");
    expect(row.text()).toContain("0.1.0");
    expect(row.text()).toContain("0.2.0");
  });

  it("triggers the agent update from the row button", async () => {
    const store = setupStore({ kiosks: [kiosk()], availableVersion: "0.2.0" });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    await wrapper.find('[data-test="agent-update-btn"]').trigger("click");
    await flushPromises();
    expect(store.triggerUpdate).toHaveBeenCalledWith("kitchen");
  });

  it("hides the update button when the agent is current", async () => {
    setupStore({ kiosks: [kiosk({ agentVersion: "0.2.0" })], availableVersion: "0.2.0" });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    expect(wrapper.find('[data-test="agent-update-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="agent-row"]').text()).toContain("up to date");
  });

  it("shows Updating… disabled while an update is requested", async () => {
    setupStore({
      kiosks: [kiosk({ agentUpdateRequested: true })],
      availableVersion: "0.2.0",
    });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    const btn = wrapper.find('[data-test="agent-update-btn"]');
    expect(btn.text()).toBe("Updating…");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("surfaces an agent update error state", async () => {
    setupStore({
      kiosks: [kiosk({ agentUpdateStatus: "error: device python < 3.9" })],
      availableVersion: "0.2.0",
    });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    expect(wrapper.find('[data-test="agent-row"]').text()).toContain("needs OS update");
  });
});
