import { describe, it, expect } from "vitest";
import { isIconFile, pluginIconLetter, pluginIconUrl } from "@/utils/pluginIcon";

describe("plugin icons", () => {
  it("tells an emoji from a file icon", () => {
    expect(isIconFile("🖼")).toBe(false);
    expect(isIconFile("icon.svg")).toBe(true);
    expect(isIconFile("frontend/logo.png")).toBe(true);
    expect(isIconFile("https://example.com/i.png")).toBe(true);
    expect(isIconFile("")).toBe(false);
    expect(isIconFile(null)).toBe(false);
  });

  it("builds the static URL for a file icon and keeps absolute URLs", () => {
    expect(pluginIconUrl({ id: "immich", icon: "icon.svg" })).toBe(
      "/api/plugins/immich/static/icon.svg"
    );
    expect(pluginIconUrl({ id: "immich", icon: "/icon.svg" })).toBe(
      "/api/plugins/immich/static/icon.svg"
    );
    expect(pluginIconUrl({ id: "immich", icon: "https://cdn.example/i.png" })).toBe(
      "https://cdn.example/i.png"
    );
  });

  it("falls back to the first letter of the name", () => {
    expect(pluginIconLetter({ id: "immich", name: "Immich" })).toBe("I");
    expect(pluginIconLetter({ id: "x", label: "frame art" })).toBe("F");
    expect(pluginIconLetter({ id: "x" })).toBe("X");
  });
});
