import { describe, it, expect, beforeEach } from "vitest";
import { useUiScale } from "@/composables/useUiScale";

describe("useUiScale", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    localStorage.clear();
  });

  it("applies the preset's scale factor to --ui-scale on :root", () => {
    const { applyUiScale, current } = useUiScale();
    applyUiScale("large");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.15");
    expect(current.value).toBe("large");
    expect(localStorage.getItem("calvin-ui-size")).toBe("large");
  });

  it("falls back to default (scale 1) for an unknown preset", () => {
    const { applyUiScale, current } = useUiScale();
    applyUiScale("gigantic");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1");
    expect(current.value).toBe("default");
  });

  it("loadUiScale restores the persisted preset before mount", () => {
    localStorage.setItem("calvin-ui-size", "compact");
    const { loadUiScale, current } = useUiScale();
    loadUiScale();
    expect(current.value).toBe("compact");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("0.85");
  });

  it("loadUiScale defaults to scale 1 when nothing is cached", () => {
    const { loadUiScale, current } = useUiScale();
    loadUiScale();
    expect(current.value).toBe("default");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1");
  });
});
