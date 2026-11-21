// Part F: the Screens list's pairing lines, count line, waiting rows, the
// Pairing section, and one screen's Pairing section.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScreensSettings from "@/components/settings/categories/ScreensSettings.vue";
import BrightnessGroup from "@/components/settings/shared/BrightnessGroup.vue";
import { useKiosksStore } from "@/stores/kiosks";
import { formatKeyDate } from "@/utils/apiKeyFormat";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

const baseConfig = {
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  screenPower: "schedule",
  displayScheduleEnabled: true,
  displaySchedule: [],
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  touchControls: "auto",
  onScreenKeyboard: "auto",
  timeFormat: "24h",
  timezone: null,
  kioskPairing: "optional",
  dashboardScreens: {
    version: 2,
    activeScreenId: "home",
    screens: [{ id: "home", name: "Home", layout: { version: 1, direction: "row", regions: [] } }],
  },
};

const iso = date => date.toISOString();
const daysAgo = days => iso(new Date(Date.now() - days * 86400000));

function kiosk(overrides = {}) {
  return {
    id: "hall",
    hostname: "hall",
    lastSeen: iso(new Date()),
    agentVersion: "1.2.3",
    agentPairs: true,
    paired: false,
    pairedAt: null,
    overrides: { displayName: "Hall" },
    ...overrides,
  };
}

function mountScreens({
  kiosks = [kiosk()],
  pairings = [],
  config = {},
  saveConfig = vi.fn(async () => {}),
} = {}) {
  setActivePinia(createPinia());
  window.localStorage.clear();
  window.sessionStorage.clear();
  const store = useKiosksStore();
  store.kiosks = kiosks;
  store.pairings = pairings;
  store.loadKiosks = vi.fn(async () => {});
  store.refreshKiosks = vi.fn(async () => {});
  store.loadPairings = vi.fn(async () => {});
  store.fetchOverrides = vi.fn(
    async id => store.kiosks.find(item => item.id === id)?.overrides ?? {}
  );
  store.setKioskOverrides = vi.fn((id, next) => {
    const target = store.kiosks.find(item => item.id === id);
    if (target) target.overrides = next;
  });
  store.fetchDeviceConfigVersion = vi.fn(async () => null);
  store.fetchAvailableAgentVersion = vi.fn(async () => null);
  store.pairScreen = vi.fn();
  store.unpairScreen = vi.fn();
  store.newInstallCode = vi.fn(async () => ({
    code: "clv_pair_x",
    expiresAt: iso(new Date(Date.now() + 1800000)),
    command:
      "curl -fsSL 'http://calvin.local:8000/api/kiosks/install.sh?pair=clv_pair_x' | sudo bash",
  }));
  const wrapper = mount(ScreensSettings, {
    props: { config: { ...baseConfig, ...config } },
    global: { provide: { saveConfig } },
    attachTo: document.body,
  });
  return { wrapper, store, saveConfig };
}

async function openScreen(wrapper, index = 0) {
  await wrapper.findAll("[data-test='screen-card']")[index].trigger("click");
  await flushPromises();
}

const input = wrapper => wrapper.find("[data-test='pair-code-input']");

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Screens list: the pairing line", () => {
  it("shows Paired today for a screen paired today", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt: iso(new Date()) })],
    });
    await flushPromises();
    expect(wrapper.get("[data-test='screen-pairing-line']").text()).toBe("Paired today");
  });

  it("shows Paired since the date for an older pairing", async () => {
    const pairedAt = daysAgo(40);
    const { wrapper } = mountScreens({ kiosks: [kiosk({ paired: true, pairedAt })] });
    await flushPromises();
    expect(wrapper.get("[data-test='screen-pairing-line']").text()).toBe(
      `Paired since ${formatKeyDate(pairedAt)}`
    );
  });

  it("shows the can-pair line in optional mode", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    const line = wrapper.get("[data-test='screen-pairing-line']");
    expect(line.text()).toBe("Not paired. It shows a code to type in Pair a screen.");
    expect(line.classes().join(" ")).not.toContain("warn");
  });

  it("shows the required-mode can-pair line as a warning", async () => {
    const { wrapper } = mountScreens({ config: { kioskPairing: "required" } });
    await flushPromises();
    const line = wrapper.get("[data-test='screen-pairing-line']");
    expect(line.text()).toBe(
      "Not paired, so it can't report in or follow home automation. It shows a code to type in Pair a screen."
    );
    expect(line.classes().join(" ")).toContain("warn");
  });

  it("shows the needs-update line for old kiosk software", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: "1.0.0", agentPairs: false })],
    });
    await flushPromises();
    expect(wrapper.get("[data-test='screen-pairing-line']").text()).toBe(
      "Needs a software update before it can be paired."
    );
  });

  it("shows the required-mode needs-update line as a warning", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ agentVersion: "1.0.0", agentPairs: false })],
      config: { kioskPairing: "required" },
    });
    await flushPromises();
    const line = wrapper.get("[data-test='screen-pairing-line']");
    expect(line.text()).toBe(
      "Needs a software update before it can be paired. Until then it can't report in or follow home automation."
    );
    expect(line.classes().join(" ")).toContain("warn");
  });

  it("gives Default and This browser no pairing line", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    expect(
      wrapper
        .get("[data-test='screen-default-card']")
        .find("[data-test='screen-pairing-line']")
        .exists()
    ).toBe(false);
    expect(
      wrapper
        .get("[data-test='screen-browser-card']")
        .find("[data-test='screen-pairing-line']")
        .exists()
    ).toBe(false);
  });
});

describe("Screens list: the count line", () => {
  it("shows nothing when no screen was seen this week", async () => {
    const { wrapper } = mountScreens({ kiosks: [kiosk({ lastSeen: daysAgo(8), paired: false })] });
    await flushPromises();
    expect(wrapper.find("[data-test='screens-count-line']").exists()).toBe(false);
  });

  it("shows All n screens paired", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", paired: true, pairedAt: iso(new Date()) }),
        kiosk({ id: "office", hostname: "office", paired: true, pairedAt: iso(new Date()) }),
        kiosk({ id: "landing", hostname: "landing", paired: true, pairedAt: iso(new Date()) }),
      ],
    });
    await flushPromises();
    const line = wrapper.get("[data-test='screens-count-line']");
    expect(line.text()).toBe("All 3 screens seen this week are paired.");
    expect(line.classes().join(" ")).not.toContain("warn");
  });

  it("uses the singular copy for one paired screen", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt: iso(new Date()) })],
    });
    await flushPromises();
    expect(wrapper.get("[data-test='screens-count-line']").text()).toBe(
      "The screen seen this week is paired."
    );
  });

  it("warns that an unpaired screen can be imitated in optional mode", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", paired: true, pairedAt: iso(new Date()) }),
        kiosk({
          id: "office",
          hostname: "office",
          paired: false,
          agentVersion: null,
          agentPairs: null,
        }),
      ],
    });
    await flushPromises();
    const line = wrapper.get("[data-test='screens-count-line']");
    expect(line.text()).toBe(
      "1 of 2 screens seen this week are paired. Another device on your home network could pretend to be an unpaired screen."
    );
    expect(line.classes().join(" ")).toContain("warn");
  });

  it("warns with the singular copy when the one recent screen is unpaired", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    expect(wrapper.get("[data-test='screens-count-line']").text()).toBe(
      "The screen seen this week isn't paired. Another device on your home network could pretend to be it."
    );
  });

  it("warns about every screen when none are paired", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall" }),
        kiosk({ id: "office", hostname: "office", agentVersion: null, agentPairs: null }),
      ],
    });
    await flushPromises();
    expect(wrapper.get("[data-test='screens-count-line']").text()).toBe(
      "None of the 2 screens seen this week are paired. Another device on your home network could pretend to be any of them."
    );
  });

  it("uses the required-mode copy", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", paired: true, pairedAt: iso(new Date()) }),
        kiosk({ id: "office", hostname: "office" }),
      ],
      config: { kioskPairing: "required" },
    });
    await flushPromises();
    expect(wrapper.get("[data-test='screens-count-line']").text()).toBe(
      "1 of 2 screens seen this week are paired. Only paired screens is on, so the others show the dashboard but can't report in or follow home automation."
    );
  });

  it("counts only screens seen in the last seven days", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", paired: true, pairedAt: iso(new Date()) }),
        kiosk({ id: "office", hostname: "office", lastSeen: daysAgo(9) }),
      ],
    });
    await flushPromises();
    expect(wrapper.get("[data-test='screens-count-line']").text()).toBe(
      "The screen seen this week is paired."
    );
  });
});

describe("Screens list: waiting to be paired", () => {
  it("lists a pending id that is not a row, named by hostname then id", async () => {
    const { wrapper } = mountScreens({
      pairings: [
        { kioskId: "landing", hostname: "landing-pi", createdAt: iso(new Date()), byAgent: true },
        { kioskId: "hall", hostname: "hall", createdAt: iso(new Date()), byAgent: true },
      ],
    });
    await flushPromises();
    const rows = wrapper.findAll("[data-test='screen-waiting-row']");
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain("landing-pi");
    expect(rows[0].text()).toContain(
      "Waiting to be paired. Type the code it shows in Pair a screen."
    );
  });

  it("is not focusable and never opens a page", async () => {
    const { wrapper } = mountScreens({
      pairings: [{ kioskId: "landing", hostname: null, createdAt: iso(new Date()), byAgent: true }],
    });
    await flushPromises();
    const row = wrapper.get("[data-test='screen-waiting-row']");
    expect(row.attributes("tabindex")).toBeUndefined();
    expect(row.attributes("role")).toBeUndefined();
    expect(row.text()).toContain("landing");
  });
});

describe("Pair a screen", () => {
  it("upper-cases the typed code and sends it normalized", async () => {
    const { wrapper, store } = mountScreens();
    store.pairScreen.mockResolvedValue({
      id: "hall",
      displayName: "Hall",
      pairedAt: iso(new Date()),
      replaced: false,
    });
    await flushPromises();
    await input(wrapper).setValue("k7q-4md ");
    expect(input(wrapper).element.value).toBe("K7Q-4MD ");
    await wrapper.get("[data-test='pair-form']").trigger("submit");
    await flushPromises();
    expect(store.pairScreen).toHaveBeenCalledWith("K7Q4MD");
  });

  it("checks the code before sending anything", async () => {
    const { wrapper, store } = mountScreens();
    await flushPromises();
    const form = wrapper.get("[data-test='pair-form']");
    await form.trigger("submit");
    await flushPromises();
    expect(store.pairScreen).not.toHaveBeenCalled();
    // One result line carries every message, so the button stays beside the
    // field instead of dropping under a separate error line (PR #387 F2).
    expect(wrapper.get("[data-test='pair-result']").text()).toBe(
      "Type the code shown on the screen."
    );
    expect(input(wrapper).attributes("aria-invalid")).toBe("true");

    await input(wrapper).setValue("K7Q");
    await form.trigger("submit");
    await flushPromises();
    expect(store.pairScreen).not.toHaveBeenCalled();
    expect(wrapper.get("[data-test='pair-result']").text()).toBe(
      "A code has 6 letters and numbers, like K7Q-4MD."
    );

    // The next keystroke clears it.
    await input(wrapper).setValue("K7Q4");
    expect(wrapper.find("[data-test='pair-result']").exists()).toBe(false);
    expect(input(wrapper).attributes("aria-invalid")).toBe("false");
  });

  it("reports the paired screen and clears the field", async () => {
    const { wrapper, store } = mountScreens();
    store.pairScreen.mockResolvedValue({
      id: "hall",
      displayName: "Hall",
      pairedAt: iso(new Date()),
      replaced: false,
    });
    await flushPromises();
    await input(wrapper).setValue("K7Q4MD");
    await wrapper.get("[data-test='pair-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[data-test='pair-result']").text()).toContain("Hall is paired.");
    expect(wrapper.get("[data-test='pair-result']").text()).not.toContain("✓");
    expect(wrapper.get("[data-test='pair-result'] .inline-note__action").text()).toContain(
      "Open Hall"
    );
    expect(input(wrapper).element.value).toBe("");
    expect(store.loadKiosks).toHaveBeenCalled();
    expect(store.loadPairings).toHaveBeenCalled();
    expect(document.activeElement).toBe(input(wrapper).element);
  });

  it("says so when the screen was paired again", async () => {
    const { wrapper, store } = mountScreens();
    store.pairScreen.mockResolvedValue({
      id: "hall",
      displayName: "Hall",
      pairedAt: iso(new Date()),
      replaced: true,
    });
    await flushPromises();
    await input(wrapper).setValue("K7Q4MD");
    await wrapper.get("[data-test='pair-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[data-test='pair-result']").text()).toContain(
      "Hall is paired again. Its old pairing no longer works."
    );
  });

  it("keeps the code and flags the field when the code matches no screen", async () => {
    const { wrapper, store } = mountScreens();
    store.pairScreen.mockRejectedValue({ response: { status: 404, data: {} } });
    await flushPromises();
    await input(wrapper).setValue("K7Q4ND");
    await wrapper.get("[data-test='pair-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[data-test='pair-result']").text()).toBe(
      "No screen is showing that code. Check the screen and type the code it shows now."
    );
    expect(input(wrapper).element.value).toBe("K7Q4ND");
    expect(input(wrapper).attributes("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input(wrapper).element);

    await input(wrapper).setValue("K7Q4ND2");
    expect(wrapper.find("[data-test='pair-result']").exists()).toBe(false);
  });

  it("turns Retry-After into minutes and dims Pair until the wait ends", async () => {
    vi.useFakeTimers();
    const { wrapper, store } = mountScreens();
    store.pairScreen.mockRejectedValue({
      response: { status: 429, data: {}, headers: { "retry-after": "90" } },
    });
    await flushPromises();
    await input(wrapper).setValue("K7Q4ND");
    await wrapper.get("[data-test='pair-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[data-test='pair-result']").text()).toBe(
      "Too many wrong codes. Try again in 2 minutes."
    );
    const button = wrapper.get("[data-test='pair-screen-btn']");
    expect(button.attributes("aria-disabled")).toBe("true");

    // Typing does not clear the cooldown line.
    await input(wrapper).setValue("K7Q4ND2");
    expect(wrapper.find("[data-test='pair-result']").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(90000);
    expect(wrapper.find("[data-test='pair-result']").exists()).toBe(false);
    expect(button.attributes("aria-disabled")).toBeUndefined();
    vi.useRealTimers();
  });

  it("uses friendly sign-in copy for 401", async () => {
    const { wrapper, store } = mountScreens();
    store.pairScreen.mockRejectedValue({ response: { status: 401, data: {} } });
    await flushPromises();
    await input(wrapper).setValue("K7Q4MD");
    await wrapper.get("[data-test='pair-form']").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[data-test='pair-result']").text()).toBe(
      "You need to sign in as admin to pair a screen."
    );
  });
});

describe("Only paired screens", () => {
  async function toggle(wrapper) {
    await wrapper.get("[data-test='only-paired-toggle']").trigger("click");
    await flushPromises();
  }

  it("asks first and names one unpaired screen", async () => {
    const { wrapper, saveConfig } = mountScreens();
    await flushPromises();
    await toggle(wrapper);
    expect(saveConfig).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Turn on Only paired screens?");
    expect(wrapper.text()).toContain(
      "Hall isn't paired. It'll keep showing the dashboard, but stop reporting in and following home automation."
    );
    await wrapper.get("[data-test='confirm-accept']").trigger("click");
    await flushPromises();
    expect(saveConfig).toHaveBeenCalledWith({ kioskPairing: "required" });
  });

  it("names two screens as A and B", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", hostname: "hall" }),
        kiosk({ id: "office", hostname: "office", overrides: { displayName: "Office" } }),
      ],
    });
    await flushPromises();
    await toggle(wrapper);
    expect(wrapper.text()).toContain("Hall and Office aren't paired.");
  });

  it("names three screens as A, B and C", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", hostname: "hall" }),
        kiosk({ id: "office", hostname: "office", overrides: { displayName: "Office" } }),
        kiosk({ id: "landing", hostname: "landing", overrides: { displayName: "Landing" } }),
      ],
    });
    await flushPromises();
    await toggle(wrapper);
    expect(wrapper.text()).toContain("Hall, Office and Landing aren't paired.");
  });

  it("names the first three and the rest for five screens", async () => {
    const { wrapper } = mountScreens({
      kiosks: [
        kiosk({ id: "hall", hostname: "hall" }),
        kiosk({ id: "office", hostname: "office", overrides: { displayName: "Office" } }),
        kiosk({ id: "landing", hostname: "landing", overrides: { displayName: "Landing" } }),
        kiosk({ id: "kitchen", hostname: "kitchen" }),
        kiosk({ id: "garage", hostname: "garage" }),
      ],
    });
    await flushPromises();
    await toggle(wrapper);
    expect(wrapper.text()).toContain("Hall, Office, Landing and 2 more aren't paired.");
  });

  it("saves at once when every recent screen is paired", async () => {
    const { wrapper, saveConfig } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt: iso(new Date()) })],
    });
    await flushPromises();
    await toggle(wrapper);
    expect(wrapper.text()).not.toContain("Turn on Only paired screens?");
    expect(saveConfig).toHaveBeenCalledWith({ kioskPairing: "required" });
  });

  it("turns off without asking", async () => {
    const { wrapper, saveConfig } = mountScreens({ config: { kioskPairing: "required" } });
    await flushPromises();
    await toggle(wrapper);
    expect(wrapper.find("[data-test='confirm-accept']").exists()).toBe(false);
    expect(saveConfig).toHaveBeenCalledWith({ kioskPairing: "optional" });
  });

  it("turns back and explains when the save fails", async () => {
    const saveConfig = vi.fn(async () => {
      throw { response: { status: 500, data: {} } };
    });
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt: iso(new Date()) })],
      saveConfig,
    });
    await flushPromises();
    await toggle(wrapper);
    await flushPromises();
    expect(wrapper.get("[data-test='only-paired-toggle']").attributes("aria-checked")).toBe(
      "false"
    );
    expect(wrapper.get("[data-test='pairing-mode-error']").text()).toBe(
      "Something went wrong on the Calvin server while trying to change Only paired screens."
    );
  });
});

describe("One screen's Pairing section", () => {
  it("sits between Behaviour and Software in the section index", async () => {
    const { wrapper } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt: iso(new Date()) })],
    });
    await flushPromises();
    await openScreen(wrapper);
    const index = wrapper.findAll("[data-test^='section-index-']").map(node => node.text());
    expect(index.indexOf("Behaviour")).toBeLessThan(index.indexOf("Pairing"));
    expect(index.indexOf("Pairing")).toBeLessThan(index.indexOf("Software"));
    const sections = wrapper.findAll("section.settings-section").map(node => node.attributes("id"));
    expect(sections.indexOf("section-screen-behaviour")).toBeLessThan(
      sections.indexOf("section-screen-pairing")
    );
    expect(sections.indexOf("section-screen-pairing")).toBeLessThan(
      sections.indexOf("section-screen-software")
    );
  });

  it("shows the paired state and unpairs after a confirmation", async () => {
    const pairedAt = daysAgo(3);
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt })],
    });
    store.unpairScreen.mockResolvedValue({ id: "hall", changed: true });
    await flushPromises();
    await openScreen(wrapper);
    store.loadKiosks.mockImplementation(async () => {
      const row = store.kiosks.find(item => item.id === "hall");
      if (row) {
        row.paired = false;
        row.pairedAt = null;
      }
    });
    store.loadKiosks.mockClear();
    const section = wrapper.get("#section-screen-pairing");
    expect(section.text()).toContain("Paired");
    expect(section.text()).toContain(
      `Since ${formatKeyDate(pairedAt)}. Only this screen can report in for itself.`
    );

    await section.get("[data-test='unpair-screen-btn']").trigger("click");
    expect(wrapper.text()).toContain("Unpair Hall?");
    expect(wrapper.text()).toContain(
      "Hall will show a new code and stop reporting in until you pair it again."
    );
    await wrapper.get("[data-test='confirm-accept']").trigger("click");
    await flushPromises();
    expect(store.unpairScreen).toHaveBeenCalledWith("hall");
    // The list's localStorage cache is refreshed from the server too, so an
    // offline reload cannot show the old paired state (PR #387 review).
    expect(store.loadKiosks).toHaveBeenCalled();
    expect(section.text()).toContain("Not paired");
    expect(section.get("[data-test='unpair-result']").text()).toBe(
      "Hall is unpaired. It shows a new code within a minute."
    );
    expect(document.activeElement).toBe(section.get("[data-test='pair-screen-link']").element);
  });

  it("says when the screen was not paired", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt: iso(new Date()) })],
    });
    store.unpairScreen.mockResolvedValue({ id: "hall", changed: false });
    await flushPromises();
    await openScreen(wrapper);
    store.loadKiosks.mockImplementation(async () => {
      const row = store.kiosks.find(item => item.id === "hall");
      if (row) {
        row.paired = false;
        row.pairedAt = null;
      }
    });
    await wrapper.get("[data-test='unpair-screen-btn']").trigger("click");
    await wrapper.get("[data-test='confirm-accept']").trigger("click");
    await flushPromises();
    expect(wrapper.get("#section-screen-pairing").get("[data-test='unpair-result']").text()).toBe(
      "Hall wasn't paired."
    );
  });

  it("keeps the paired state and explains a failed unpair", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ paired: true, pairedAt: iso(new Date()) })],
    });
    store.unpairScreen.mockRejectedValue({ response: { status: 500, data: {} } });
    await flushPromises();
    await openScreen(wrapper);
    await wrapper.get("[data-test='unpair-screen-btn']").trigger("click");
    await wrapper.get("[data-test='confirm-accept']").trigger("click");
    await flushPromises();
    const section = wrapper.get("#section-screen-pairing");
    expect(section.text()).toContain("Paired");
    expect(section.get("[data-test='unpair-result']").text()).toBe(
      "Something went wrong on the Calvin server while trying to unpair Hall."
    );
  });

  it("keeps the screen page open and focuses the Code field on a wide layout", async () => {
    const { wrapper } = mountScreens();
    await flushPromises();
    await openScreen(wrapper);
    const section = wrapper.get("#section-screen-pairing");
    expect(section.text()).toContain("Not paired");
    expect(section.text()).toContain(
      "This screen shows a code at the bottom. Type it in Pair a screen."
    );
    await section.get("[data-test='pair-screen-link']").trigger("click");
    await flushPromises();
    // The two-pane layout already shows the list: don't empty the right pane
    // (PR #387 F4).
    expect(wrapper.find("[data-test='screens-detail']").exists()).toBe(true);
    expect(document.activeElement).toBe(input(wrapper).element);
  });

  it("goes back to the list and focuses the Code field on a phone", async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = vi.fn(query => ({
      matches: /\(max-width: 900px\)/.test(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      const { wrapper } = mountScreens();
      await flushPromises();
      await openScreen(wrapper);
      await wrapper.get("[data-test='pair-screen-link']").trigger("click");
      await flushPromises();
      expect(wrapper.find("[data-test='screens-detail']").exists()).toBe(false);
      expect(document.activeElement).toBe(input(wrapper).element);
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it("adds the required-mode warning under a screen that is not paired", async () => {
    const { wrapper } = mountScreens({ config: { kioskPairing: "required" } });
    await flushPromises();
    await openScreen(wrapper);
    const section = wrapper.get("#section-screen-pairing");
    expect(section.text()).toContain(
      "Only paired screens is on, so until it is paired this screen can't report in or follow home automation."
    );
  });

  it("shows the Update action for old kiosk software", async () => {
    const { wrapper, store } = mountScreens({
      kiosks: [kiosk({ agentVersion: "1.0.0", agentPairs: false })],
    });
    await flushPromises();
    await openScreen(wrapper);
    const section = wrapper.get("#section-screen-pairing");
    expect(section.text()).toContain("Needs a software update before it can be paired.");
    await section.get("[data-test='pairing-update-btn']").trigger("click");
    expect(store.triggerUpdate).toBeDefined();
  });

  it("hides the hold lines when presence is hidden", async () => {
    const { wrapper } = mountScreens({ kiosks: [kiosk({ presenceHidden: true })] });
    await flushPromises();
    await openScreen(wrapper);
    const power = wrapper.get("#section-screen-power");
    expect(power.find("[data-test='screen-now-state']").exists()).toBe(false);
    expect(power.find("[data-test='screen-now-until']").exists()).toBe(false);
    expect(power.get("[data-test='screen-now-hidden']").text()).toBe(
      "Sign in as admin to see whether this screen is on or off, and who set it."
    );
  });

  it("never infers 'no command' from a hidden presence row", async () => {
    // With presence hidden, the command fields are absent whether or not one
    // exists. The controls must stay neutral: neither button disabled by the
    // schedule, a way back to the schedule, and no assumed wake state (§3.4).
    const { wrapper } = mountScreens({ kiosks: [kiosk({ presenceHidden: true })] });
    await flushPromises();
    await openScreen(wrapper);
    const power = wrapper.get("#section-screen-power");
    expect(power.find("[data-test='screen-now-on']").attributes("aria-disabled")).toBeUndefined();
    expect(power.find("[data-test='screen-now-off']").attributes("aria-disabled")).toBeUndefined();
    expect(power.find("[data-test='screen-now-follow']").exists()).toBe(true);
    expect(wrapper.findComponent(BrightnessGroup).props("asleep")).toBe(false);
  });
});

describe("the waiting list refreshes with the kiosk list", () => {
  it("loads pairings on open and after a successful pair", async () => {
    const { wrapper, store } = mountScreens();
    await flushPromises();
    expect(store.loadPairings).toHaveBeenCalledTimes(1);
    store.pairScreen.mockResolvedValue({
      id: "hall",
      displayName: "Hall",
      pairedAt: iso(new Date()),
      replaced: false,
    });
    await input(wrapper).setValue("K7Q4MD");
    await wrapper.get("[data-test='pair-form']").trigger("submit");
    await flushPromises();
    expect(store.loadPairings).toHaveBeenCalledTimes(2);
  });
});
