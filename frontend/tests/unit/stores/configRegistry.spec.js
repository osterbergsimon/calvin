import { describe, it, expect } from "vitest";
import { applyConfigPayload } from "@/stores/configRegistry";

describe("configRegistry — pluginRepositoryUrl", () => {
  it("defaults pluginRepositoryUrl to the Calvin plugins repo", () => {
    const refs = { pluginRepositoryUrl: { value: "" } };
    applyConfigPayload({}, refs, { useDefaults: true });
    expect(refs.pluginRepositoryUrl.value).toBe("https://github.com/osterbergsimon/calvin-plugins");
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
