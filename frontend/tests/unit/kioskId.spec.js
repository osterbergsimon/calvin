import { describe, it, expect } from "vitest";
import { getKioskId, configUrl } from "@/utils/kioskId";

function setLocation(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi-kitchen" },
    writable: true,
  });
}

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
});
