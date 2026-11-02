import { describe, it, expect, beforeEach } from "vitest";
import { useTypeTheme } from "@/composables/useTypeTheme";

describe("useTypeTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    localStorage.clear();
  });

  it("applies the requested theme's font roles to :root", () => {
    const { applyTypeTheme, current } = useTypeTheme();
    applyTypeTheme("marquee");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-display")).toContain("Space Grotesk");
    expect(root.style.getPropertyValue("--font-ui")).toContain("Inter");
    expect(root.style.getPropertyValue("--font-data")).toContain("JetBrains Mono");
    expect(current.value).toBe("marquee");
    expect(localStorage.getItem("calvin-type-theme")).toBe("marquee");
  });

  it("falls back to instrument for an unknown id", () => {
    const { applyTypeTheme, current } = useTypeTheme();
    applyTypeTheme("nonsense");
    expect(current.value).toBe("instrument");
    expect(document.documentElement.style.getPropertyValue("--font-display")).toContain(
      "Plex Sans Condensed"
    );
  });

  it("loadTypeTheme restores the persisted choice", () => {
    localStorage.setItem("calvin-type-theme", "station");
    const { loadTypeTheme, current } = useTypeTheme();
    loadTypeTheme();
    expect(current.value).toBe("station");
  });
});
