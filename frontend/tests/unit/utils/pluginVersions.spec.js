import { describe, it, expect } from "vitest";
import { compareVersions, isNewerVersion } from "@/utils/pluginVersions";

describe("compareVersions", () => {
  it("orders patch, minor and major bumps numerically", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("treats a missing component as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBe(-1);
  });

  it("ignores a leading v and surrounding whitespace", () => {
    expect(compareVersions(" v1.2.3 ", "1.2.3")).toBe(0);
  });

  it("ranks a pre-release below its release and orders pre-release parts", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1);
  });

  it("falls back to a string compare for non-semver values", () => {
    expect(compareVersions("same", "same")).toBe(0);
    expect(compareVersions("1.0.0b", "1.0.0a")).toBe(1);
  });
});

describe("isNewerVersion", () => {
  it("offers an update only for a strict upgrade", () => {
    expect(isNewerVersion("1.1.0", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    // A catalog older than what is installed must not read as an update.
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(false);
    expect(isNewerVersion("1.0.0-rc.1", "1.0.0")).toBe(false);
  });

  it("does not offer an update without both versions", () => {
    expect(isNewerVersion("", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", null)).toBe(false);
  });
});
