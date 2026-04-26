/** Tests for schema-driven formatters. */

import { describe, it, expect } from "vitest";
import { applyFormat, listFormatters } from "@/utils/formatters";

describe("applyFormat", () => {
  it("returns value unchanged when no format specified", () => {
    expect(applyFormat(42, undefined)).toBe(42);
    expect(applyFormat("hello", null)).toBe("hello");
  });

  it("returns value unchanged for unknown format", () => {
    expect(applyFormat(42, "not-a-format")).toBe(42);
  });

  it("rounds to one decimal", () => {
    expect(applyFormat(12.456, "round-1")).toBe("12.5");
    expect(applyFormat(0, "round-1")).toBe("0.0");
  });

  it("formats percent from 0..1 ratio", () => {
    expect(applyFormat(0.42, "percent")).toBe("42%");
    expect(applyFormat(1, "percent")).toBe("100%");
  });

  it("formats percent-raw from 0..100 number", () => {
    expect(applyFormat(73.4, "percent-raw")).toBe("73%");
  });

  it("formats bytes", () => {
    expect(applyFormat(0, "bytes")).toBe("0 B");
    expect(applyFormat(1024, "bytes")).toBe("1.0 KB");
    expect(applyFormat(1024 * 1024 * 5, "bytes")).toBe("5.0 MB");
  });

  it("capitalizes strings", () => {
    expect(applyFormat("DINNER", "capitalize")).toBe("Dinner");
    expect(applyFormat("", "capitalize")).toBe("");
  });

  it("handles bad inputs gracefully", () => {
    expect(applyFormat(null, "round-1")).toBe("");
    expect(applyFormat("not a number", "bytes")).toBe("");
    expect(applyFormat("invalid date", "weekday-short")).toBe("");
  });

  it("exposes the formatter list", () => {
    const names = listFormatters();
    expect(names).toContain("weekday-short");
    expect(names).toContain("bytes");
    expect(names).toContain("percent");
  });
});
