import { describe, it, expect } from "vitest";
import { applyConfigPayload } from "@/stores/configRegistry";

describe("configRegistry — pluginRepositoryUrl", () => {
  it("defaults pluginRepositoryUrl to the Calvin plugins repo", () => {
    const refs = { pluginRepositoryUrl: { value: "" } };
    applyConfigPayload({}, refs, { useDefaults: true });
    expect(refs.pluginRepositoryUrl.value).toBe("https://github.com/osterbergsimon/calvin-plugins");
  });
});
