import { describe, it, expect, vi } from "vitest";
import { isChunkLoadError, recoverFromChunkLoadError } from "@/router/chunkRecovery";

// A dynamic-import failure, worded as each engine reports it.
const ENGINE_MESSAGES = [
  "Failed to fetch dynamically imported module: http://localhost:5173/assets/js/Settings-BvJtCE1M.js",
  "error loading dynamically imported module: http://localhost:5173/assets/js/Settings-BvJtCE1M.js",
  "Importing a module script failed.",
];

const fakeLocation = (pathname = "/", search = "") => ({
  pathname,
  search,
  assign: vi.fn(),
});

describe("isChunkLoadError", () => {
  it.each(ENGINE_MESSAGES)("recognises %s", message => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("ignores unrelated navigation failures", () => {
    expect(isChunkLoadError(new Error("Navigation aborted"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("recoverFromChunkLoadError", () => {
  it.each(ENGINE_MESSAGES)("full-navigates to the target route for %s", message => {
    const loc = fakeLocation("/");
    const recovered = recoverFromChunkLoadError(
      new TypeError(message),
      { fullPath: "/settings" },
      loc
    );
    expect(recovered).toBe(true);
    expect(loc.assign).toHaveBeenCalledWith("/settings");
  });

  it("keeps the target's query (settings deep links)", () => {
    const loc = fakeLocation("/");
    recoverFromChunkLoadError(
      new TypeError(ENGINE_MESSAGES[0]),
      { fullPath: "/settings?setting=content-calendars" },
      loc
    );
    expect(loc.assign).toHaveBeenCalledWith("/settings?setting=content-calendars");
  });

  it("does not reload when the browser is already on the target route", () => {
    // The retry after a full navigation must not loop: the same chunk fails
    // again, but we are already on /settings.
    const loc = fakeLocation("/settings", "");
    const recovered = recoverFromChunkLoadError(
      new TypeError(ENGINE_MESSAGES[0]),
      { fullPath: "/settings" },
      loc
    );
    expect(recovered).toBe(false);
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it("does nothing for errors that are not chunk-load failures", () => {
    const loc = fakeLocation("/");
    const recovered = recoverFromChunkLoadError(new Error("boom"), { fullPath: "/settings" }, loc);
    expect(recovered).toBe(false);
    expect(loc.assign).not.toHaveBeenCalled();
  });
});
