import { describe, it, expect } from "vitest";
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

  it("shows Applied when applied matches desired", () => {
    const w = mountHeader({ appliedVersion: "9f2a", desiredVersion: "9f2a" });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Applied");
  });

  it("shows online Pending copy when versions differ and online", () => {
    const w = mountHeader({ online: true, appliedVersion: "old", desiredVersion: "new" });
    const t = w.get("[data-test='hardware-config-status']").text();
    expect(t).toContain("Pending");
    expect(t).toContain("applies shortly");
  });

  it("shows reconnect Pending copy when versions differ and offline", () => {
    const w = mountHeader({ online: false, appliedVersion: "old", desiredVersion: "new" });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("reconnects");
  });

  it("shows Not yet reported when appliedVersion is null", () => {
    const w = mountHeader({ appliedVersion: null, desiredVersion: "new" });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Not yet reported");
  });

  it("fails open to Applied when desiredVersion is unknown", () => {
    const w = mountHeader({ appliedVersion: "9f2a", desiredVersion: null });
    expect(w.get("[data-test='hardware-config-status']").text()).toContain("Applied");
  });
});
