import { describe, it, expect } from "vitest";
import { getKioskId, configUrl } from "@/utils/kioskId";

function setLocation(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi-kitchen" },
    writable: true,
  });
}

describe("getKioskId", () => {
  it("returns null when no kiosk param is present", () => {
    setLocation("");
    expect(getKioskId()).toBeNull();
  });
});

describe("configUrl", () => {
  it("returns /api/config when no kiosk id", () => {
    setLocation("");
    expect(configUrl()).toBe("/api/config");
  });

  it("returns the kiosk effective-config URL with khost when scoped", () => {
    setLocation("?kiosk=kitchen-3f9a2c&khost=pi-kitchen");
    expect(configUrl()).toBe("/api/kiosks/kitchen-3f9a2c/config?khost=pi-kitchen");
  });

  it("falls back to location.hostname for khost when the param is absent", () => {
    setLocation("?kiosk=kitchen-3f9a2c"); // window.location.hostname is set by setLocation
    expect(configUrl()).toBe("/api/kiosks/kitchen-3f9a2c/config?khost=pi-kitchen");
  });

  it("percent-encodes special characters in kiosk id and khost", () => {
    setLocation("?kiosk=a%2Fb&khost=pi%20one");
    const url = configUrl();
    // The id "a/b" must be encoded as "a%2Fb" (not raw slash) and
    // the host "pi one" must be encoded as "pi%20one" (not raw space).
    expect(url).toContain("%2F");
    expect(url).toContain("%20");
    // Full URL shape check: would fail if encoding were removed
    expect(url).toBe("/api/kiosks/a%2Fb/config?khost=pi%20one");
  });
});
