import { describe, it, expect, beforeEach } from "vitest";
import axios from "axios";
import {
  isLoopbackHost,
  pickServerUrl,
  resolveServerUrl,
  settingsLink,
  _resetServerUrlForTests,
} from "@/utils/serverUrl";

const loc = (origin, hostname) => ({ origin, hostname });

describe("pickServerUrl (F2 phone hand-off)", () => {
  it("prefers the server's PUBLIC_URL", () => {
    const url = pickServerUrl(
      { public_url: "http://calvin.lan:8000/", lan_urls: ["http://10.0.0.2:8000"] },
      loc("http://192.0.2.5:8000", "192.0.2.5")
    );
    expect(url).toBe("http://calvin.lan:8000");
  });

  it("uses the page origin when it was opened over the LAN", () => {
    const url = pickServerUrl(
      { public_url: null, lan_urls: ["http://10.0.0.2:8000"] },
      loc("http://192.0.2.5:8000", "192.0.2.5")
    );
    expect(url).toBe("http://192.0.2.5:8000");
  });

  it("swaps a localhost origin (all-in-one kiosk) for the detected LAN URL", () => {
    const url = pickServerUrl(
      { public_url: null, lan_urls: ["http://192.0.2.20:8000"] },
      loc("http://localhost:8000", "localhost")
    );
    expect(url).toBe("http://192.0.2.20:8000");
  });

  it("falls back to the origin when nothing better is known", () => {
    expect(pickServerUrl(null, loc("http://localhost:8000", "localhost"))).toBe(
      "http://localhost:8000"
    );
  });
});

describe("isLoopbackHost", () => {
  it.each(["localhost", "127.0.0.1", "127.0.1.1", "::1", "kiosk.localhost"])("%s", host => {
    expect(isLoopbackHost(host)).toBe(true);
  });
  it("is false for a LAN address", () => {
    expect(isLoopbackHost("192.0.2.5")).toBe(false);
  });
});

describe("resolveServerUrl", () => {
  beforeEach(() => _resetServerUrlForTests());

  it("asks the server once and caches the answer", async () => {
    Object.defineProperty(window, "location", {
      value: { origin: "http://localhost:8000", hostname: "localhost", search: "" },
      writable: true,
    });
    axios.get.mockResolvedValue({ data: { lan_urls: ["http://192.0.2.20:8000"] } });

    expect(await resolveServerUrl()).toBe("http://192.0.2.20:8000");
    await resolveServerUrl();
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get).toHaveBeenCalledWith("/api/system/network");
  });
});

describe("settingsLink", () => {
  it("deep-links to a setting", () => {
    expect(settingsLink("http://h:8000/", "content-calendars")).toBe(
      "http://h:8000/settings?setting=content-calendars"
    );
  });
});
