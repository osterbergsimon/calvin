import { describe, it, expect } from "vitest";
import { normalizeKeyCode } from "@/utils/keyCode";

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
