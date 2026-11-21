/**
 * The boot fragment hand-off (Task 13, calvin-0xns; review of PR #386, minor 1).
 *
 * kioskBoot captures the identity and the `#pair=` secret as the first import
 * of main.js. The secret must leave the module as soon as it is taken: no
 * module-level binding may keep the screen's credential for the session.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SECRET = `clv_kiosk_${"C".repeat(43)}`;

function setLocation({
  search = "?kiosk=kitchen&khost=k",
  hash = "",
  hostname = "pi-kitchen",
} = {}) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { search, hash, pathname: "/", hostname },
  });
}

let replaceState;

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {
    window.location.hash = "";
  });
});

afterEach(() => {
  replaceState.mockRestore();
});

describe("takeBootPairSecret", () => {
  it("returns the fragment secret once, then null", async () => {
    setLocation({ hash: `#pair=${SECRET}` });
    const boot = await import("@/utils/kioskBoot");

    // The module exports the taker only: the secret itself is not a binding
    // another module can read after the hand-off.
    expect(Object.keys(boot)).toEqual(["takeBootPairSecret"]);
    expect(boot.takeBootPairSecret()).toBe(SECRET);
    expect(boot.takeBootPairSecret()).toBeNull();
    expect(boot.takeBootPairSecret()).toBeNull();
  });

  it("returns null when the start URL had no fragment", async () => {
    setLocation({ hash: "" });
    const { takeBootPairSecret } = await import("@/utils/kioskBoot");

    expect(takeBootPairSecret()).toBeNull();
  });

  it("reads the secret and removes the fragment before it is taken", async () => {
    setLocation({ hash: `#pair=${SECRET}` });
    const { takeBootPairSecret } = await import("@/utils/kioskBoot");

    expect(window.location.hash).toBe("");
    expect(replaceState).toHaveBeenCalled();
    expect(takeBootPairSecret()).toBe(SECRET);
  });
});
