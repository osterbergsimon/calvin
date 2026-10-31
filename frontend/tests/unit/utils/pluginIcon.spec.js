import { describe, it, expect } from "vitest";
import { mdiCast, mdiGauge } from "@mdi/js";
import {
  PLUGIN_ICON_PATHS,
  isIconFile,
  isMdiIcon,
  pluginIconLetter,
  pluginIconPath,
  pluginIconUrl,
} from "@/utils/pluginIcon";

describe("plugin icons", () => {
  it("tells an emoji or MDI name from a file icon", () => {
    expect(isIconFile("🖼")).toBe(false);
    expect(isIconFile("mdi:cast")).toBe(false);
    expect(isIconFile("icon.svg")).toBe(true);
    expect(isIconFile("frontend/logo.png")).toBe(true);
    expect(isIconFile("https://example.com/i.png")).toBe(true);
    expect(isIconFile("")).toBe(false);
    expect(isIconFile(null)).toBe(false);
  });

  it("recognises the mdi: form", () => {
    expect(isMdiIcon("mdi:cast")).toBe(true);
    expect(isMdiIcon("MDI:Gauge")).toBe(true);
    expect(isMdiIcon("icon.svg")).toBe(false);
    expect(isMdiIcon("🖼")).toBe(false);
    expect(isMdiIcon(null)).toBe(false);
  });

  it("resolves a curated mdi name to its SVG path", () => {
    expect(pluginIconPath({ icon: "mdi:cast" })).toBe(mdiCast);
    expect(pluginIconPath({ icon: " mdi:gauge " })).toBe(mdiGauge);
    expect(PLUGIN_ICON_PATHS["weather-partly-cloudy"]).toBeTruthy();
  });

  it("falls back to nothing for an unknown mdi name, an emoji or no icon", () => {
    expect(pluginIconPath({ icon: "mdi:no-such-icon" })).toBe("");
    expect(pluginIconPath({ icon: "MDI:Nope" })).toBe("");
    expect(pluginIconPath({ icon: "🖼" })).toBe("");
    expect(pluginIconPath({ icon: "icon.svg" })).toBe("");
    expect(pluginIconPath({})).toBe("");
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
