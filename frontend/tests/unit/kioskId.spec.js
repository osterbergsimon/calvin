import { describe, it, expect } from "vitest";
import { getKioskId, withKiosk } from "@/utils/kioskId";

function setLocation(search) {
  Object.defineProperty(window, "location", {
    value: { search, hostname: "pi-kitchen" },
    writable: true,
  });
}

describe("kioskId", () => {
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

  it("prefers the khost URL param over window.location.hostname", () => {
    setLocation("?kiosk=kitchen-3f9a2c&khost=pi-kitchen");
    // window.location.hostname is 'pi-kitchen' too, but the param must win —
    // use a distinct value to prove the param is the source.
    setLocation("?kiosk=x&khost=pi-livingroom");
    expect(withKiosk("/api/config")).toBe(
      "/api/config?kiosk=x&khost=pi-livingroom",
    );
  });

  it("falls back to window.location.hostname when khost is absent", () => {
    setLocation("?kiosk=kitchen-3f9a2c");
    expect(withKiosk("/api/config")).toBe(
      "/api/config?kiosk=kitchen-3f9a2c&khost=pi-kitchen",
    );
  });

  it("appends with & when the URL already has a query string", () => {
    setLocation("?kiosk=kitchen-3f9a2c");
    expect(withKiosk("/api/config?foo=bar")).toBe(
      "/api/config?foo=bar&kiosk=kitchen-3f9a2c&khost=pi-kitchen",
    );
  });
});
