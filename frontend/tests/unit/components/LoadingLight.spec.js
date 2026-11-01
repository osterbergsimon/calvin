/**
 * LoadingLight (CLV-115): mounts the screen's chosen indicator for one frame.
 * Timing comes from the progress store, so every style shares it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LoadingLight from "@/components/LoadingLight.vue";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import { useConfigStore } from "@/stores/config";
import { useConnectionStore } from "@/stores/connection";
import { useProgressStore } from "@/stores/progress";

const originalMatchMedia = window.matchMedia;

const preferReducedMotion = () => {
  window.matchMedia = vi.fn(query => ({
    matches: /prefers-reduced-motion:\s*reduce/.test(query),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
};

const indicator = wrapper => wrapper.find(".loading-indicator");

describe("LoadingLight (CLV-115)", () => {
  let progress;
  let config;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setActivePinia(createPinia());
    progress = useProgressStore();
    config = useConfigStore();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it("draws the comet by default, inactive until the store shows the light", async () => {
    const wrapper = mount(LoadingLight);
    expect(wrapper.attributes("data-loading-light")).toBe("comet");
    expect(wrapper.find(".comet").exists()).toBe(true);
    expect(indicator(wrapper).classes()).not.toContain("is-active");
    expect(indicator(wrapper).attributes("aria-hidden")).toBe("true");

    progress.begin("calendar");
    await vi.advanceTimersByTimeAsync(399);
    expect(indicator(wrapper).classes()).not.toContain("is-active");
    await vi.advanceTimersByTimeAsync(1);
    expect(indicator(wrapper).classes()).toContain("is-active");
  });

  it("never lights for a 300 ms load", async () => {
    const wrapper = mount(LoadingLight);
    progress.begin("calendar");
    await vi.advanceTimersByTimeAsync(300);
    progress.end("calendar");
    await vi.advanceTimersByTimeAsync(2000);
    expect(indicator(wrapper).classes()).not.toContain("is-active");
  });

  it("the setting picks Pulse", async () => {
    config.loadingLight = "pulse";
    const wrapper = mount(LoadingLight);
    expect(wrapper.attributes("data-loading-light")).toBe("pulse");
    expect(wrapper.find(".pulse").exists()).toBe(true);
    expect(wrapper.find(".comet").exists()).toBe(false);
  });

  it("Off renders nothing, even while loading", async () => {
    config.loadingLight = "off";
    const wrapper = mount(LoadingLight);
    progress.begin("calendar");
    await vi.advanceTimersByTimeAsync(1000);
    expect(indicator(wrapper).exists()).toBe(false);
  });

  it("an unknown value falls back to the comet", () => {
    config.loadingLight = "fireworks";
    const wrapper = mount(LoadingLight);
    expect(wrapper.attributes("data-loading-light")).toBe("comet");
  });

  it("this screen's own choice wins over the Default value", () => {
    config.loadingLight = "comet";
    localStorage.setItem("calvin-screen-loadingLight", "pulse");
    const wrapper = mount(LoadingLight);
    expect(wrapper.attributes("data-loading-light")).toBe("pulse");
  });

  describe("reduced motion", () => {
    beforeEach(preferReducedMotion);

    it("forces Pulse whatever the setting: no orbit", () => {
      config.loadingLight = "comet";
      const wrapper = mount(LoadingLight);
      expect(wrapper.attributes("data-loading-light")).toBe("pulse");
      expect(wrapper.find(".comet__bead").exists()).toBe(false);
    });

    it("keeps the same delay and minimum rules", async () => {
      const wrapper = mount(LoadingLight);
      progress.begin("calendar");
      await vi.advanceTimersByTimeAsync(399);
      expect(indicator(wrapper).classes()).not.toContain("is-active");
      await vi.advanceTimersByTimeAsync(51); // shown at 400
      progress.end("calendar");
      await vi.advanceTimersByTimeAsync(749);
      expect(indicator(wrapper).classes()).toContain("is-active");
      await vi.advanceTimersByTimeAsync(1);
      expect(indicator(wrapper).classes()).not.toContain("is-active");
    });

    it("leaves Off as Off", () => {
      config.loadingLight = "off";
      const wrapper = mount(LoadingLight);
      expect(indicator(wrapper).exists()).toBe(false);
    });
  });

  describe("frames", () => {
    it("a region light follows its own region's sources only", async () => {
      const r1 = mount(LoadingLight, { props: { regionId: "r1" } });
      const r2 = mount(LoadingLight, { props: { regionId: "r2" } });
      const app = mount(LoadingLight);

      progress.begin("calendar:r1", { regionId: "r1" });
      await vi.advanceTimersByTimeAsync(500);

      expect(indicator(r1).classes()).toContain("is-active");
      expect(indicator(r1).classes()).toContain("loading-indicator--region");
      expect(indicator(r2).classes()).not.toContain("is-active");
      expect(indicator(app).classes()).not.toContain("is-active");
    });

    it("two loading regions promote to the app light", async () => {
      const r1 = mount(LoadingLight, { props: { regionId: "r1" } });
      const r2 = mount(LoadingLight, { props: { regionId: "r2" } });
      const app = mount(LoadingLight);

      progress.begin("calendar:r1", { regionId: "r1" });
      progress.begin("photos:r2", { regionId: "r2" });
      await vi.advanceTimersByTimeAsync(500);

      expect(indicator(app).classes()).toContain("is-active");
      expect(indicator(app).classes()).toContain("loading-indicator--app");
      expect(indicator(r1).classes()).not.toContain("is-active");
      expect(indicator(r2).classes()).not.toContain("is-active");
    });
  });

  it("Off still lets the connection pill speak when a load fails", async () => {
    config.loadingLight = "off";
    config.timeFormat = "24h";
    const connection = useConnectionStore();
    connection.isOnline = true;
    connection.hasChecked = true;
    connection.consecutiveFailures = 2;
    connection.lastBackendCheck = new Date();

    const light = mount(LoadingLight);
    const pill = mount(ConnectionStatus, { attachTo: document.body });
    progress.begin("calendar");
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();

    expect(indicator(light).exists()).toBe(false);
    expect(pill.find('[data-test="connection-status"]').exists()).toBe(true);
    pill.unmount();
  });
});
