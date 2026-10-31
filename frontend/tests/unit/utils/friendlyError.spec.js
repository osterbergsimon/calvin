import { describe, it, expect } from "vitest";
import { friendlyError } from "@/utils/friendlyError";

// CLV-63 §1 — the sentence table, verbatim.
const axiosError = (status, data) => ({
  isAxiosError: true,
  message: "Request failed",
  response: { status, data },
});

describe("friendlyError", () => {
  it("points at Calvin when the server can't be reached", () => {
    expect(
      friendlyError({ isAxiosError: true, message: "Network Error" }, "load your photos")
    ).toBe("Couldn't reach Calvin. Check that it's running and on the same network.");
    // No response object at all is the same case.
    expect(friendlyError(new Error("Network Error"), "load your photos")).toBe(
      "Couldn't reach Calvin. Check that it's running and on the same network."
    );
  });

  it("asks for admin sign-in on 401 and 403", () => {
    expect(friendlyError(axiosError(401, {}), "save your settings")).toBe(
      "You need to sign in as admin to save your settings."
    );
    expect(friendlyError(axiosError(403, {}), "restart Calvin")).toBe(
      "You need to sign in as admin to restart Calvin."
    );
  });

  it("says the thing is gone on 404", () => {
    expect(friendlyError(axiosError(404, {}), "load your photos")).toBe(
      "That's no longer there. Reload and try again."
    );
  });

  it("says it conflicts on 409, unless the caller has a specific line", () => {
    expect(friendlyError(axiosError(409, {}), "add this source")).toBe(
      "That conflicts with an existing one."
    );
    expect(
      friendlyError(axiosError(409, {}), "add this source", { conflict: "That name is taken." })
    ).toBe("That name is taken.");
  });

  it("passes through a validation detail written for people", () => {
    expect(friendlyError(axiosError(422, { detail: "Enter a folder name." }), "add a source")).toBe(
      "Enter a folder name."
    );
    expect(friendlyError(axiosError(400, { detail: "Pick at least one day." }), "save")).toBe(
      "Pick at least one day."
    );
    // Our own structured route messages are person-readable too.
    expect(
      friendlyError(
        axiosError(409, { detail: { code: "host_control_disabled", message: "Restart is off." } }),
        "restart Calvin",
        { conflict: "Restart is off." }
      )
    ).toBe("Restart is off.");
  });

  it("never shows FastAPI request-validation arrays", () => {
    expect(
      friendlyError(
        axiosError(422, { detail: [{ loc: ["body", "name"], msg: "field required", type: "x" }] }),
        "save your settings"
      )
    ).toBe("Something went wrong on the Calvin server while trying to save your settings.");
  });

  it("blames the Calvin server for 5xx and anything else", () => {
    expect(
      friendlyError(axiosError(500, { detail: "Traceback (most recent call last)" }), "save")
    ).toBe("Something went wrong on the Calvin server while trying to save.");
    expect(friendlyError(axiosError(503, {}), "load your calendars")).toBe(
      "Something went wrong on the Calvin server while trying to load your calendars."
    );
    // A thrown coding error still produces one friendly sentence, never its text.
    expect(friendlyError(new Error("Cannot read properties of null"), "load photos", {})).toBe(
      "Couldn't reach Calvin. Check that it's running and on the same network."
    );
  });

  it("never returns raw axios text", () => {
    const raw = "Request failed with status code 500";
    const text = friendlyError({ ...axiosError(500, {}), message: raw }, "save");
    expect(text).not.toContain(raw);
  });
});
