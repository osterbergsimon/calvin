import { describe, it, expect, beforeEach, vi } from "vitest";
import { getKioskId, withKiosk } from "@/utils/kioskId";

function setLocation(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi-kitchen" },
    writable: true,
  });
}

describe("kioskId", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when no kiosk param", () => {
    setLocation("");
    expect(getKioskId()).toBeNull();
    expect(withKiosk("/api/config")).toBe("/api/config");
  });

  it("reads the kiosk param and appends it", () => {
    setLocation("?kiosk=kitchen-3f9a2c");
    expect(getKioskId()).toBe("kitchen-3f9a2c");
    expect(withKiosk("/api/config")).toBe(
      "/api/config?kiosk=kitchen-3f9a2c&khost=pi-kitchen",
    );
  });
});
