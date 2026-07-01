import { describe, it, expect } from "vitest";
import {
  HOT_CORNER_POSITIONS,
  normalizeHotCornerPosition,
  pointInHotCorner,
} from "@/utils/hotCorner";

describe("normalizeHotCornerPosition", () => {
  it("passes through valid corners", () => {
    HOT_CORNER_POSITIONS.forEach(p => expect(normalizeHotCornerPosition(p)).toBe(p));
  });

  it("falls back to bottom-left for legacy 'off' / junk (no lockout)", () => {
    expect(normalizeHotCornerPosition("off")).toBe("bottom-left");
    expect(normalizeHotCornerPosition(undefined)).toBe("bottom-left");
    expect(normalizeHotCornerPosition("nonsense")).toBe("bottom-left");
  });
});

describe("pointInHotCorner", () => {
  const vp = { viewportWidth: 1000, viewportHeight: 800 };

  it("detects a press inside the bottom-left box", () => {
    expect(pointInHotCorner({ x: 10, y: 790, position: "bottom-left", size: 64, ...vp })).toBe(
      true
    );
  });

  it("rejects a press outside the bottom-left box", () => {
    expect(pointInHotCorner({ x: 200, y: 790, position: "bottom-left", size: 64, ...vp })).toBe(
      false
    );
    expect(pointInHotCorner({ x: 10, y: 400, position: "bottom-left", size: 64, ...vp })).toBe(
      false
    );
  });

  it("anchors each corner to the right viewport edges", () => {
    expect(pointInHotCorner({ x: 990, y: 10, position: "top-right", size: 64, ...vp })).toBe(true);
    expect(pointInHotCorner({ x: 990, y: 790, position: "bottom-right", size: 64, ...vp })).toBe(
      true
    );
    expect(pointInHotCorner({ x: 10, y: 10, position: "top-left", size: 64, ...vp })).toBe(true);
  });

  it("grows the hit-box with size", () => {
    const at = size => pointInHotCorner({ x: 90, y: 710, position: "bottom-left", size, ...vp });
    expect(at(64)).toBe(false); // 90 > 64
    expect(at(96)).toBe(true); // 90 <= 96 and 710 >= 800-96
  });

  it("normalizes a legacy 'off' position to bottom-left", () => {
    expect(pointInHotCorner({ x: 10, y: 790, position: "off", size: 64, ...vp })).toBe(true);
  });
});
