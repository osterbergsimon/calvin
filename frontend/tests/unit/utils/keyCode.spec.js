import { describe, it, expect } from "vitest";
import { normalizeKeyCode, formatKeyLabel } from "@/utils/keyCode";

describe("normalizeKeyCode", () => {
  it("maps digits", () => {
    expect(normalizeKeyCode({ code: "Digit3" })).toBe("KEY_3");
  });
  it("maps letters", () => {
    expect(normalizeKeyCode({ code: "KeyS" })).toBe("KEY_S");
  });
  it("maps function keys", () => {
    expect(normalizeKeyCode({ code: "F5" })).toBe("KEY_F5");
  });
  it("maps named specials", () => {
    expect(normalizeKeyCode({ code: "ArrowLeft" })).toBe("KEY_LEFT");
    expect(normalizeKeyCode({ code: "Space" })).toBe("KEY_SPACE");
    expect(normalizeKeyCode({ code: "Escape" })).toBe("KEY_ESCAPE");
  });
  it("uppercases unknown codes into KEY_ form", () => {
    expect(normalizeKeyCode({ code: "Comma" })).toBe("KEY_COMMA");
  });
});

describe("formatKeyLabel", () => {
  it("strips the KEY_ prefix for display", () => {
    expect(formatKeyLabel("KEY_1")).toBe("1");
    expect(formatKeyLabel("KEY_ENTER")).toBe("ENTER");
  });
  it("returns an empty string for falsy input", () => {
    expect(formatKeyLabel("")).toBe("");
    expect(formatKeyLabel(null)).toBe("");
    expect(formatKeyLabel(undefined)).toBe("");
  });
});
