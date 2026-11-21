// Part F: the one-time install command in Add a screen (the Raspberry Pi card).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AddKioskPanel from "@/components/settings/shared/AddKioskPanel.vue";
import { useKiosksStore } from "@/stores/kiosks";

vi.mock("@/utils/serverUrl", () => ({
  resolveServerUrl: vi.fn(async () => "http://calvin.local:8000"),
}));

const READY = {
  code: "clv_pair_abc",
  expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
  command:
    "curl -fsSL 'http://calvin.local:8000/api/kiosks/install.sh?pair=clv_pair_abc' | sudo bash",
};

function mountPanel(props = {}) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.newInstallCode = vi.fn(async () => READY);
  const wrapper = mount(AddKioskPanel, {
    props: { timeFormat: "24h", timezone: null, ...props },
    attachTo: document.body,
  });
  return { wrapper, store };
}

beforeEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Add a screen: the one-time install code", () => {
  it("asks for a code when the panel opens and shows its command", async () => {
    const { wrapper, store } = mountPanel();
    expect(wrapper.get("[data-test='add-kiosk-command']").text()).toBe("Getting a one-time code…");
    expect(wrapper.get("[data-test='add-kiosk-copy']").attributes("disabled")).toBeDefined();
    await flushPromises();
    expect(store.newInstallCode).toHaveBeenCalledTimes(1);
    expect(wrapper.get("[data-test='add-kiosk-command']").text()).toBe(READY.command);
    const note = wrapper.get("[data-test='add-kiosk-code-note']");
    expect(note.text()).toContain("This command works once, for 30 minutes (until ");
    expect(note.text()).toContain("New code");
  });

  it("makes a new code and resets Copy", async () => {
    const { wrapper, store } = mountPanel();
    await flushPromises();
    await wrapper.get("[data-test='add-kiosk-copy']").trigger("click");
    expect(wrapper.get("[data-test='add-kiosk-copy']").text()).toBe("Copied");
    store.newInstallCode.mockResolvedValue({ ...READY, command: "curl new-command" });
    await wrapper.get("[data-test='install-new-code']").trigger("click");
    await flushPromises();
    expect(store.newInstallCode).toHaveBeenCalledTimes(2);
    expect(wrapper.get("[data-test='add-kiosk-copy']").text()).toBe("Copy");
    expect(wrapper.get("[data-test='add-kiosk-command']").text()).toBe("curl new-command");
  });

  it("says the code has run out once expiresAt passes", async () => {
    vi.useFakeTimers();
    const { wrapper, store } = mountPanel();
    store.newInstallCode.mockResolvedValue({
      ...READY,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    await flushPromises();
    expect(wrapper.get("[data-test='add-kiosk-code-note']").text()).not.toContain("run out");
    await vi.advanceTimersByTimeAsync(61000);
    const note = wrapper.get("[data-test='add-kiosk-code-note']");
    expect(note.text()).toContain(
      "This code has run out. Get a new one before you run the command."
    );
    expect(wrapper.get("[data-test='add-kiosk-command']").text()).toBe(READY.command);
  });

  it("falls back to today's plain command when the code cannot be made", async () => {
    const { wrapper, store } = mountPanel();
    store.newInstallCode.mockRejectedValue({ response: { status: 500, data: {} } });
    await flushPromises();
    expect(wrapper.get("[data-test='add-kiosk-command']").text()).toBe(
      "curl -fsSL http://calvin.local:8000/api/kiosks/install.sh | sudo bash"
    );
    const note = wrapper.get("[data-test='add-kiosk-code-note']");
    expect(note.text()).toContain(
      "Couldn't get a one-time code. This command still works: the screen then shows a code to type in Pair a screen."
    );
    expect(note.text()).toContain("Try again");
  });

  it("asks an admin to sign in when the server refuses", async () => {
    const { wrapper, store } = mountPanel();
    store.newInstallCode.mockRejectedValue({ response: { status: 403, data: {} } });
    await flushPromises();
    const note = wrapper.get("[data-test='add-kiosk-code-note']");
    expect(note.text()).toBe("You need to sign in as admin to make a one-time code.");
    expect(wrapper.find("[data-test='install-new-code']").exists()).toBe(false);
  });

  it("adds the pairing sentence to the browser card", async () => {
    const { wrapper } = mountPanel();
    await flushPromises();
    expect(wrapper.text()).toContain(
      "A few minutes later it shows a code at the bottom: type it in Pair a screen."
    );
  });
});
