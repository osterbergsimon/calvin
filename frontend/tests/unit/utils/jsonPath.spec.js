/** Tests for the JSONPath-lite resolver used by the schema renderer. */

import { describe, it, expect } from "vitest";
import { resolvePath } from "@/utils/jsonPath";

describe("resolvePath", () => {
  const data = {
    current: {
      icon: "🌤",
      temperature: 12.4,
      units: { temperature: "°C" },
    },
    items: [
      { name: "first", value: 1 },
      { name: "second", value: 2 },
    ],
  };

  it("returns root for $", () => {
    expect(resolvePath(data, "$")).toBe(data);
  });

  it("returns root for empty path", () => {
    expect(resolvePath(data, "")).toBe(data);
    expect(resolvePath(data, undefined)).toBe(data);
  });

  it("resolves simple property", () => {
    expect(resolvePath(data, "$.current")).toBe(data.current);
  });

  it("resolves nested property", () => {
    expect(resolvePath(data, "$.current.units.temperature")).toBe("°C");
  });

  it("resolves array index", () => {
    expect(resolvePath(data, "$.items[0].name")).toBe("first");
    expect(resolvePath(data, "$.items[1].value")).toBe(2);
  });

  it("returns undefined for missing path", () => {
    expect(resolvePath(data, "$.nope")).toBeUndefined();
    expect(resolvePath(data, "$.current.missing.deeper")).toBeUndefined();
  });

  it("handles null/undefined data", () => {
    expect(resolvePath(null, "$.foo")).toBeUndefined();
    expect(resolvePath(undefined, "$.foo")).toBeUndefined();
  });

  it("handles paths without leading $", () => {
    expect(resolvePath(data, "current.icon")).toBe("🌤");
  });
});
