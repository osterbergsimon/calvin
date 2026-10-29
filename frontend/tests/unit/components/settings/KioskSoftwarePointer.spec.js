import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KioskSoftwarePointer from "@/components/settings/shared/KioskSoftwarePointer.vue";
import { useKiosksStore } from "@/stores/kiosks";

const AVAILABLE = "e4f5a6b7c8d9e0f1";
const OLD = "a1b2c3d4e5f6a7b8";
const push = vi.fn();

vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

const kiosk = (over = {}) => ({
  id: "kitchen",
  hostname: "kitchen-pi",
  lastSeen: new Date().toISOString(),
  agentVersion: OLD,
  agentUpdateStatus: "ok",
  agentUpdateMessage: null,
  agentUpdateRequested: false,
  ...over,
});

function mountPointer({ kiosks, availableVersion = AVAILABLE }) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.fetchAvailableAgentVersion = vi.fn(async () => availableVersion);
  return mount(KioskSoftwarePointer);
}

describe("KioskSoftwarePointer (System › Updates)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    push.mockClear();
  });

  it("is hidden when every kiosk is up to date", async () => {
    const wrapper = mountPointer({ kiosks: [kiosk({ agentVersion: AVAILABLE })] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-software-pointer"]').exists()).toBe(false);
  });

  it("is hidden when no kiosk has an agent", async () => {
    const wrapper = mountPointer({ kiosks: [kiosk({ agentVersion: null })] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-software-pointer"]').exists()).toBe(false);
  });

  it("is hidden when the manifest could not be checked", async () => {
    const wrapper = mountPointer({ kiosks: [kiosk()], availableVersion: null });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-software-pointer"]').exists()).toBe(false);
  });

  it("shows the count and version while a kiosk is behind", async () => {
    const wrapper = mountPointer({
      kiosks: [kiosk(), kiosk({ id: "hallway", agentVersion: AVAILABLE })],
    });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-software-pointer-copy"]').text()).toBe(
      "1 kiosk can be updated to e4f5a6b."
    );
  });

  it("uses plural copy for several behind kiosks", async () => {
    const wrapper = mountPointer({ kiosks: [kiosk(), kiosk({ id: "hallway" })] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-software-pointer-copy"]').text()).toBe(
      "2 kiosks can be updated to e4f5a6b."
    );
  });

  it("does not count a python-blocked kiosk as updatable", async () => {
    const wrapper = mountPointer({
      kiosks: [
        kiosk({
          agentUpdateStatus: "error",
          agentUpdateMessage: "device python < 3.9; keeping current agent",
        }),
      ],
    });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-software-pointer"]').exists()).toBe(false);
  });

  it("routes to the Kiosks software destination", async () => {
    const wrapper = mountPointer({ kiosks: [kiosk()] });
    await flushPromises();
    await wrapper.find('[data-test="open-kiosks"]').trigger("click");
    expect(push).toHaveBeenCalledWith({
      path: "/settings",
      query: { setting: "kiosks-software" },
    });
  });
});
