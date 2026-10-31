import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { useNotificationsStore } from "@/stores/notifications";

const AVAILABLE = "e4f5a6b7c8d9e0f1";
const OLD = "a1b2c3d4e5f6a7b8";

const config = {
  orientation: "landscape",
  orientationFlipped: false,
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [
      {
        id: "home",
        name: "Home",
        layout: {
          version: 1,
          direction: "row",
          regions: [{ id: "r1", kind: "calendar", size: 100 }],
        },
      },
    ],
  },
  displayScheduleEnabled: false,
  displaySchedule: [],
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  touchControls: "auto",
  onScreenKeyboard: "auto",
};

const kiosk = (over = {}) => ({
  id: "kitchen",
  hostname: "kitchen-pi",
  lastSeen: new Date().toISOString(),
  lastAppliedVersion: null,
  agentVersion: OLD,
  agentUpdateStatus: "ok",
  agentUpdateMessage: null,
  agentUpdateRequested: false,
  overrides: {},
  ...over,
});

function mountWith({ kiosks = [], availableVersion = AVAILABLE, fetchManifest } = {}) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.fetchOverrides = vi.fn(async () => ({}));
  store.setKioskOverrides = vi.fn();
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = fetchManifest || vi.fn(async () => availableVersion);
  store.triggerUpdate = vi.fn(async id => {
    const target = store.kiosks.find(k => k.id === id);
    if (target) target.agentUpdateRequested = true;
  });
  return {
    wrapper: mount(ScreensSettings, { props: { config } }),
    store,
  };
}

const summary = wrapper => wrapper.find('[data-test="kiosk-software-state"]');
const updateAll = wrapper => wrapper.find('[data-test="kiosk-software-update-all"]');
const card = (wrapper, index) => wrapper.findAll('[data-test="screen-card"]')[index];

async function openFirst(wrapper) {
  await wrapper.find('[data-test="screen-card"]').trigger("click");
  await flushPromises();
}

describe("ScreensSettings — kiosk software summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is hidden when no kiosk has an agent (browser-only setup)", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk({ agentVersion: null })] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-software-summary"]').exists()).toBe(false);
    expect(summary(wrapper).exists()).toBe(false);
  });

  it("shows Checking for updates… while the manifest is still loading", async () => {
    let resolve;
    const pending = new Promise(r => (resolve = r));
    const { wrapper } = mountWith({
      kiosks: [kiosk()],
      fetchManifest: vi.fn(() => pending),
    });
    await flushPromises();
    expect(summary(wrapper).text()).toBe("Checking for updates…");
    expect(updateAll(wrapper).exists()).toBe(false);

    resolve(AVAILABLE);
    await flushPromises();
    expect(summary(wrapper).text()).toContain("can be updated to");
  });

  it("explains a failed manifest check and retries it", async () => {
    const fetchManifest = vi.fn(async () => null);
    const { wrapper } = mountWith({ kiosks: [kiosk()], fetchManifest });
    await flushPromises();
    expect(summary(wrapper).text()).toBe(
      "Couldn't check for kiosk updates. The kiosks keep working."
    );

    fetchManifest.mockResolvedValue(AVAILABLE);
    await wrapper.find('[data-test="kiosk-software-retry"]').trigger("click");
    await flushPromises();
    expect(fetchManifest).toHaveBeenCalledTimes(2);
    expect(summary(wrapper).text()).toContain("1 kiosk can be updated to");
  });

  it("shows the all-up-to-date state in the available version", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk({ agentVersion: AVAILABLE })] });
    await flushPromises();
    expect(summary(wrapper).text()).toBe("All kiosks are up to date (e4f5a6b).");
    expect(updateAll(wrapper).exists()).toBe(false);
  });

  it("uses singular and plural copy", async () => {
    const one = mountWith({
      kiosks: [kiosk(), kiosk({ id: "hallway", agentVersion: AVAILABLE })],
    });
    await flushPromises();
    expect(summary(one.wrapper).text()).toBe("1 kiosk can be updated to e4f5a6b.");
    expect(updateAll(one.wrapper).text()).toBe("Update all");

    const two = mountWith({ kiosks: [kiosk(), kiosk({ id: "hallway" })] });
    await flushPromises();
    expect(summary(two.wrapper).text()).toBe("2 of 2 kiosks can be updated to e4f5a6b.");
  });

  it("shows the updating state with a disabled Update all", async () => {
    const { wrapper } = mountWith({
      kiosks: [kiosk({ agentUpdateRequested: true })],
    });
    await flushPromises();
    expect(summary(wrapper).text()).toBe("Updating 1 kiosk… It restarts its screen when done.");
    const btn = updateAll(wrapper);
    expect(btn.text()).toBe("Updating…");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("says no kiosk can be updated when every out-of-date kiosk is blocked", async () => {
    const { wrapper } = mountWith({
      kiosks: [
        kiosk({
          agentUpdateStatus: "error",
          agentUpdateMessage: "device python < 3.9; keeping current agent",
        }),
      ],
    });
    await flushPromises();
    expect(summary(wrapper).text()).toBe(
      "No kiosk can be updated right now. 1 needs a newer OS first."
    );
    expect(updateAll(wrapper).exists()).toBe(false);
  });

  it("calls triggerUpdate once per behind kiosk and skips blocked ones", async () => {
    const { wrapper, store } = mountWith({
      kiosks: [
        kiosk(),
        kiosk({ id: "hallway", agentUpdateRequested: false }),
        kiosk({ id: "garage", agentVersion: AVAILABLE }),
        kiosk({
          id: "attic",
          agentUpdateStatus: "error",
          agentUpdateMessage: "device python < 3.9; keeping current agent",
        }),
      ],
    });
    await flushPromises();
    await updateAll(wrapper).trigger("click");
    await flushPromises();

    expect(store.triggerUpdate.mock.calls.map(([id]) => id)).toEqual(["kitchen", "hallway"]);
    expect(store.loadKiosks).toHaveBeenCalledTimes(2); // mount + refresh
  });

  it("reports a rejected update with a toast and still updates the others", async () => {
    const { wrapper, store } = mountWith({
      kiosks: [kiosk(), kiosk({ id: "hallway" })],
    });
    await flushPromises();
    store.triggerUpdate.mockImplementationOnce(async () => {
      throw new Error("network");
    });

    await updateAll(wrapper).trigger("click");
    await flushPromises();

    expect(store.triggerUpdate).toHaveBeenCalledTimes(2);
    const notifications = useNotificationsStore();
    // The screen's name (hostname/display name), not its internal id.
    expect(notifications.items.map(n => n.message)).toContain(
      "Couldn't start the update on kitchen-pi."
    );
  });
});

describe("ScreensSettings — screen card software line", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks an up-to-date kiosk", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk({ agentVersion: AVAILABLE })] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-version-line"]').text()).toBe(
      "Kiosk software e4f5a6b · up to date"
    );
  });

  it("shows the available version", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk()] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-version-line"]').text()).toBe(
      "Kiosk software a1b2c3d · e4f5a6b available"
    );
  });

  it("shows Updating to the available version while requested", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk({ agentUpdateRequested: true })] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-version-line"]').text()).toBe("Updating to e4f5a6b…");
  });

  it("marks a python-too-old failure as needing a newer OS", async () => {
    const { wrapper } = mountWith({
      kiosks: [
        kiosk({
          agentUpdateStatus: "error",
          agentUpdateMessage: "device python < 3.9; keeping current agent",
        }),
      ],
    });
    await flushPromises();
    const line = wrapper.find('[data-test="kiosk-version-line"]');
    expect(line.text()).toBe("Kiosk software a1b2c3d · update needs a newer OS");
    expect(line.classes()).toContain("is-warn");
  });

  it("treats a rollback as a normal failure", async () => {
    const { wrapper } = mountWith({
      kiosks: [
        kiosk({
          agentUpdateStatus: "error",
          agentUpdateMessage: "rolled back to previous version",
        }),
      ],
    });
    await flushPromises();
    const line = wrapper.find('[data-test="kiosk-version-line"]');
    expect(line.text()).toBe("Kiosk software a1b2c3d · last update failed, kept this version");
    expect(line.classes()).toContain("is-err");
  });

  it("shows no software line for a kiosk without an agent", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk({ agentVersion: null })] });
    await flushPromises();
    expect(wrapper.find('[data-test="kiosk-version-line"]').exists()).toBe(false);
    expect(card(wrapper, 0).exists()).toBe(true);
  });
});

describe("ScreensSettings — update button in the screen's Software section", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls triggerUpdate when the update button is clicked", async () => {
    const { wrapper, store } = mountWith({ kiosks: [kiosk()] });
    await flushPromises();
    await openFirst(wrapper);

    const btn = wrapper.find('[data-test="kiosk-update-btn"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe("Update");

    await btn.trigger("click");
    await flushPromises();

    expect(store.triggerUpdate).toHaveBeenCalledWith("kitchen");
  });

  it("does not show the update button when agentVersion matches availableVersion", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk({ agentVersion: AVAILABLE })] });
    await flushPromises();
    await openFirst(wrapper);
    expect(wrapper.find('[data-test="kiosk-update-btn"]').exists()).toBe(false);
  });

  it("shows Updating… and disables the button when requested", async () => {
    const { wrapper } = mountWith({ kiosks: [kiosk({ agentUpdateRequested: true })] });
    await flushPromises();
    await openFirst(wrapper);

    const btn = wrapper.find('[data-test="kiosk-update-btn"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe("Updating…");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("does not show the update button when availableVersion is null", async () => {
    const { wrapper } = mountWith({
      kiosks: [kiosk()],
      availableVersion: null,
    });
    await flushPromises();
    await openFirst(wrapper);
    expect(wrapper.find('[data-test="kiosk-update-btn"]').exists()).toBe(false);
  });

  it("offers Try again after a failed update", async () => {
    const { wrapper } = mountWith({
      kiosks: [
        kiosk({
          agentUpdateStatus: "error",
          agentUpdateMessage: "rolled back to previous version",
        }),
      ],
    });
    await flushPromises();
    await openFirst(wrapper);
    expect(wrapper.find('[data-test="kiosk-update-btn"]').text()).toBe("Try again");
  });
});
