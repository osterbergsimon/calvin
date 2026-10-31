import { describe, it, expect } from "vitest";
import { fieldLabel, humanizeFieldKey, isHiddenField } from "@/utils/pluginFields";

describe("plugin field labels", () => {
  it("prefers the declared schema label", () => {
    const schema = { label: "Calendar address", description: "The .ics address" };
    expect(fieldLabel("ical_url", schema)).toBe("Calendar address");
  });

  it("humanises the key in sentence case when no label is declared", () => {
    expect(fieldLabel("feed_url", { description: "Where to read" })).toBe("Feed URL");
    expect(fieldLabel("showTime", {})).toBe("Show time");
    expect(fieldLabel("ical_url")).toBe("iCal URL");
  });

  it("keeps a non-blank label verbatim and ignores a blank one", () => {
    expect(humanizeFieldKey("display_order")).toBe("Display order");
    expect(fieldLabel("display_order", { label: "  " })).toBe("Display order");
  });
});

describe("hidden plugin fields", () => {
  it("honours hidden: true", () => {
    expect(isHiddenField("secret", { hidden: true })).toBe(true);
    expect(isHiddenField("secret", { hidden: false })).toBe(false);
  });

  it("never shows display_order, even without the hidden flag", () => {
    expect(isHiddenField("display_order", { type: "integer" })).toBe(true);
  });
});
