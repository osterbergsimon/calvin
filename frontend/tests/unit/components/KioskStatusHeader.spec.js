import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import KioskStatusHeader from "@/components/settings/shared/KioskStatusHeader.vue";

function mountHeader(props) {
  return mount(KioskStatusHeader, {
    props: { kioskId: "k1", online: true, lastSeenLabel: "12s ago", ...props },
  });
}

describe("KioskStatusHeader", () => {
  it("renders the kiosk id and presence", () => {
    const w = mountHeader({ online: true, lastSeenLabel: "12s ago" });
    expect(w.text()).toContain("k1");
    expect(w.text()).toContain("Online");
    expect(w.text()).toContain("12s ago");
  });

  it("shows the display stack beside the agent version", () => {
    const w = mountHeader({
      displayStack: "cog",
      agentVersion: "1ed916a4b5c6",
    });
    expect(w.get("[data-test='kiosk-display-stack']").text()).toBe("cog · agent 1ed916a");
  });

  it("falls back to unknown for an agent that does not report a stack", () => {
    const w = mountHeader({ displayStack: null, agentVersion: "1ed916a4b5c6" });
    expect(w.get("[data-test='kiosk-display-stack']").text()).toBe("unknown · agent 1ed916a");
  });

  it("shows no stack readout without an agent", () => {
    const w = mountHeader({ displayStack: null, agentVersion: null });
    expect(w.find("[data-test='kiosk-display-stack']").exists()).toBe(false);
  });

  it("reports Wi-Fi power saving, warning when it is on (calvin-grwq)", () => {
    const off = mountHeader({ wifiPowerSave: "off" });
    expect(off.get("[data-test='kiosk-wifi-power-save']").text()).toBe("Wi-Fi power saving off");
    const on = mountHeader({ wifiPowerSave: "on" });
    const tag = on.get("[data-test='kiosk-wifi-power-save']");
    expect(tag.text()).toContain("Wi-Fi power saving on");
    expect(tag.classes().join(" ")).toMatch(/warn/);
    const configured = mountHeader({ wifiPowerSave: "configured" });
    expect(configured.get("[data-test='kiosk-wifi-power-save']").text()).toBe(
      "Wi-Fi power saving set off, not verified"
    );
    const unknown = mountHeader({ wifiPowerSave: "unknown" });
    expect(unknown.get("[data-test='kiosk-wifi-power-save']").text()).toBe(
      "Wi-Fi power saving unknown"
    );
  });

  it("shows no Wi-Fi readout for a wired screen or an older agent", () => {
    expect(
      mountHeader({ wifiPowerSave: null }).find("[data-test='kiosk-wifi-power-save']").exists()
    ).toBe(false);
  });

  it("shows Applied when applied matches desired", () => {
    const w = mountHeader({ appliedVersion: "9f2a", desiredVersion: "9f2a" });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Applied");
  });

  it("shows online Pending copy when versions differ and online", () => {
    const w = mountHeader({ online: true, appliedVersion: "old", desiredVersion: "new" });
    const t = w.get("[data-test='hardware-config-status']").text();
    expect(t).toBe("Display settings · Applying…");
  });

  it("shows reconnect Pending copy when versions differ and offline", () => {
    const w = mountHeader({ online: false, appliedVersion: "old", desiredVersion: "new" });
    expect(w.get("[data-test='hardware-config-status']").text()).toBe(
      "Display settings · Applies when this screen comes back online"
    );
  });

  it("shows Not confirmed yet when appliedVersion is null", () => {
    const w = mountHeader({ appliedVersion: null, desiredVersion: "new" });
    expect(w.get("[data-test='hardware-config-status']").text()).toBe(
      "Display settings · Not confirmed yet"
    );
  });

  it("fails open to Applied when desiredVersion is unknown", () => {
    const w = mountHeader({ appliedVersion: "9f2a", desiredVersion: null });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Applied");
  });

  it("keeps the inline gap between the name and each tag", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../src/components/settings/shared/KioskStatusHeader.vue"),
      "utf-8"
    );
    expect(source).toMatch(
      /\.kiosk-status\s*:deep\(\.inline-note__text\)\s*\{[^}]*gap: var\(--gap-inline\)/s
    );
  });
});
