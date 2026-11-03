import { describe, it, expect } from "vitest";
import { applyConfigPayload } from "@/stores/configRegistry";

describe("configRegistry — pluginRepositoryUrl", () => {
  it("defaults pluginRepositoryUrl to the Calvin plugins repo", () => {
    const refs = { pluginRepositoryUrl: { value: "" } };
    applyConfigPayload({}, refs, { useDefaults: true });
    expect(refs.pluginRepositoryUrl.value).toBe("https://github.com/osterbergsimon/calvin-plugins");
  });
});

describe("configRegistry — typeTheme", () => {
  it("defaults typeTheme to None so a browser can migrate its old font once", () => {
    const refs = { typeTheme: { value: "marquee" } };
    applyConfigPayload({}, refs, { useDefaults: true });
    expect(refs.typeTheme.value).toBeNull();
  });

  it("maps the snake_case type_theme key onto typeTheme", () => {
    const refs = { typeTheme: { value: null } };
    applyConfigPayload({ type_theme: "station" }, refs, { useDefaults: true });
    expect(refs.typeTheme.value).toBe("station");
  });

  it("rejects an unknown font id from the config", () => {
    const refs = { typeTheme: { value: null } };
    applyConfigPayload({ typeTheme: "comic-sans" }, refs, { useDefaults: true });
    expect(refs.typeTheme.value).toBeNull();
  });
});

describe("configRegistry — uiSize", () => {
  it("defaults uiSize to 'default' when absent", () => {
    const refs = { uiSize: { value: null } };
    applyConfigPayload({}, refs, { useDefaults: true });
    expect(refs.uiSize.value).toBe("default");
  });

  it("maps the snake_case ui_size key onto uiSize", () => {
    const refs = { uiSize: { value: "default" } };
    applyConfigPayload({ ui_size: "large" }, refs, { useDefaults: true });
    expect(refs.uiSize.value).toBe("large");
  });
});
