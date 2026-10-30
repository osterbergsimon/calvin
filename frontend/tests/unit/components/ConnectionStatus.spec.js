/**
 * ConnectionStatus (CLV-48): one pill for "can't reach Calvin"/"no network",
 * with a tap-to-explain popover, plus the transient connecting/connected lines.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import { useConfigStore } from "@/stores/config";
import { useConnectionStore } from "@/stores/connection";

const lastSuccess = new Date(2026, 9, 30, 8, 41); // 30 Oct 2026, 08:41 local

const mountedWrappers = [];

const mountStatus = props => {
  const wrapper = mount(ConnectionStatus, {
    props,
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

const popoverEl = () => document.querySelector('[data-test="connection-popover"]');
const tryNowEl = () => document.querySelector('[data-test="connection-try-now"]');

const clickElement = async element => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flushPromises();
};

const setUnreachable = store => {
  store.isOnline = true;
  store.hasChecked = true;
  store.consecutiveFailures = 2;
  store.lastBackendCheck = lastSuccess;
};

describe("ConnectionStatus", () => {
  let configStore;
  let connectionStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 9, 7));
    configStore = useConfigStore();
    configStore.timeFormat = "24h";
    connectionStore = useConnectionStore();
    connectionStore.isOnline = true;
  });

  afterEach(() => {
    while (mountedWrappers.length) mountedWrappers.pop().unmount();
    vi.useRealTimers();
  });

  describe("states", () => {
    it("shows nothing while the backend is OK", async () => {
      connectionStore.hasChecked = true;
      connectionStore.consecutiveFailures = 0;

      const wrapper = mountStatus();
      await flushPromises();

      expect(wrapper.find('[data-test="connection-status"]').exists()).toBe(false);
      expect(wrapper.text()).toBe("");
    });

    it("shows nothing for the first 5s of starting, then Connecting…", async () => {
      const wrapper = mountStatus();

      expect(wrapper.text()).not.toContain("Connecting");

      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(wrapper.text()).toContain("Connecting…");
    });

    it("ignores one failed check", async () => {
      connectionStore.hasChecked = true;
      connectionStore.consecutiveFailures = 1;
      connectionStore.lastBackendCheck = lastSuccess;

      const wrapper = mountStatus();
      await flushPromises();

      expect(wrapper.find('[data-test="connection-pill"]').exists()).toBe(false);
    });

    it("shows the unreachable pill with the time of the last success", async () => {
      setUnreachable(connectionStore);

      const wrapper = mountStatus();
      await flushPromises();

      expect(wrapper.get('[data-test="connection-pill"]').text()).toBe(
        "Can't reach Calvin · data from 08:41"
      );
    });

    it("shows the offline pill immediately", async () => {
      connectionStore.isOnline = false;
      connectionStore.hasChecked = true;
      connectionStore.lastBackendCheck = lastSuccess;

      const wrapper = mountStatus();
      await flushPromises();

      expect(wrapper.get('[data-test="connection-pill"]').text()).toBe(
        "No network · data from 08:41"
      );
    });

    it("drops 'data from' when there was never a successful check", async () => {
      connectionStore.isOnline = false;
      connectionStore.hasChecked = true;

      const wrapper = mountStatus();
      await flushPromises();

      expect(wrapper.get('[data-test="connection-pill"]').text()).toBe("No network");
    });

    it("shows ✓ Connected for 3s after coming back, then nothing", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
      connectionStore.isOnline = true;
      connectionStore.hasChecked = true;
      connectionStore.consecutiveFailures = 2;
      await connectionStore.checkBackend();

      const wrapper = mountStatus();
      await flushPromises();

      expect(wrapper.get('[data-test="connection-connected"]').text()).toContain("Connected");

      await vi.advanceTimersByTimeAsync(3000);
      await flushPromises();

      expect(wrapper.find('[data-test="connection-connected"]').exists()).toBe(false);
      vi.unstubAllGlobals();
    });

    it("never renders the retired healthy/backend/no-internet wording", async () => {
      setUnreachable(connectionStore);
      const wrapper = mountStatus();
      await flushPromises();

      const text = wrapper.text();
      expect(text).not.toMatch(/healthy/i);
      expect(text).not.toMatch(/backend/i);
      expect(text).not.toMatch(/no internet/i);
      expect(text).not.toMatch(/no connection/i);
    });

    it("announces changes politely for screen readers", async () => {
      setUnreachable(connectionStore);
      const wrapper = mountStatus();
      await flushPromises();

      const live = wrapper.get('[role="status"]');
      expect(live.attributes("aria-live")).toBe("polite");
      expect(live.text()).toBe("Can't reach Calvin.");
    });
  });

  describe("popover", () => {
    it("opens with the unreachable explanation and focuses Try now", async () => {
      setUnreachable(connectionStore);
      const wrapper = mountStatus();
      await flushPromises();

      await wrapper.get('[data-test="connection-pill"]').trigger("click");
      await flushPromises();

      const dialog = popoverEl();
      expect(dialog).not.toBeNull();
      expect(dialog.getAttribute("role")).toBe("dialog");
      expect(dialog.textContent).toContain("Can't reach Calvin");
      expect(dialog.textContent).toContain("This screen is showing what it last got at 08:41.");
      expect(dialog.textContent).toContain(
        "Check that the Calvin server is on and that this screen is on the same network."
      );
      expect(document.activeElement).toBe(tryNowEl());
    });

    it("uses the offline copy when the screen is off the network", async () => {
      connectionStore.isOnline = false;
      connectionStore.hasChecked = true;
      const wrapper = mountStatus();
      await flushPromises();

      await wrapper.get('[data-test="connection-pill"]').trigger("click");
      await flushPromises();

      const dialog = popoverEl();
      expect(dialog.textContent).toContain("This screen is offline");
      expect(dialog.textContent).toContain(
        "It isn't connected to the network. Check its Wi-Fi or cable."
      );
    });

    it("Try now runs a check and reports that it still fails", async () => {
      setUnreachable(connectionStore);
      const check = vi.spyOn(connectionStore, "checkBackend").mockResolvedValue(false);
      const wrapper = mountStatus();
      await flushPromises();

      await wrapper.get('[data-test="connection-pill"]').trigger("click");
      await flushPromises();
      await clickElement(tryNowEl());

      expect(check).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[data-test="connection-try-failed"]').textContent.trim()).toBe(
        "Still can't reach it."
      );
    });

    it("closes on Escape", async () => {
      setUnreachable(connectionStore);
      const wrapper = mountStatus();
      await flushPromises();

      await wrapper.get('[data-test="connection-pill"]').trigger("click");
      await flushPromises();
      expect(popoverEl()).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await flushPromises();

      expect(popoverEl()).toBeNull();
    });

    it("closes on an outside tap", async () => {
      setUnreachable(connectionStore);
      const wrapper = mountStatus();
      await flushPromises();

      await wrapper.get('[data-test="connection-pill"]').trigger("click");
      await flushPromises();

      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await flushPromises();

      expect(popoverEl()).toBeNull();
    });

    it("closes when the connection comes back", async () => {
      setUnreachable(connectionStore);
      const wrapper = mountStatus();
      await flushPromises();

      await wrapper.get('[data-test="connection-pill"]').trigger("click");
      await flushPromises();
      expect(popoverEl()).not.toBeNull();

      connectionStore.consecutiveFailures = 0;
      connectionStore.reconnected = true;
      await flushPromises();

      expect(popoverEl()).toBeNull();
      expect(wrapper.find('[data-test="connection-connected"]').exists()).toBe(true);
    });
  });

  describe("compact (vertical clock bar)", () => {
    it("shows the icon only, with the time below it", async () => {
      setUnreachable(connectionStore);
      const wrapper = mountStatus({ compact: true });
      await flushPromises();

      const pill = wrapper.get('[data-test="connection-pill"]');
      expect(pill.attributes("aria-label")).toBe("Can't reach Calvin · data from 08:41");
      expect(wrapper.find(".connection-status__text").exists()).toBe(false);
      expect(wrapper.get(".connection-status__compact-time").text()).toBe("08:41");
    });
  });

  describe("floating placement", () => {
    it("only shows while not OK", async () => {
      connectionStore.hasChecked = true;
      const okWrapper = mountStatus({ floating: true });
      await flushPromises();
      expect(okWrapper.find('[data-test="connection-status"]').exists()).toBe(false);

      setUnreachable(connectionStore);
      const downWrapper = mountStatus({ floating: true });
      await flushPromises();
      expect(downWrapper.get('[data-test="connection-status"]').classes()).toContain(
        "connection-status--floating"
      );
    });

    it("sits bottom-left, or top-left when the show-controls corner is bottom-left", async () => {
      setUnreachable(connectionStore);

      configStore.hotCornerPosition = "bottom-right";
      const bottom = mountStatus({ floating: true });
      await flushPromises();
      expect(bottom.get('[data-test="connection-status"]').classes()).toContain(
        "connection-status--bottom-left"
      );

      configStore.hotCornerPosition = "bottom-left";
      const top = mountStatus({ floating: true });
      await flushPromises();
      expect(top.get('[data-test="connection-status"]').classes()).toContain(
        "connection-status--top-left"
      );
    });
  });
});
