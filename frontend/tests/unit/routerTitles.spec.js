import { describe, it, expect, beforeEach } from "vitest";
import router from "@/router";
import { applyRouteTitle } from "@/router/titles";

describe("page titles (M9)", () => {
  beforeEach(() => {
    document.title = "";
  });

  it("names Settings in the title bar", () => {
    applyRouteTitle(router.resolve("/settings"));
    expect(document.title).toBe("Settings – Calvin");
  });

  it("names the guest share page", () => {
    applyRouteTitle(router.resolve("/share/example-token/"));
    expect(document.title).toBe("Shared photos – Calvin");
  });

  it("keeps the dashboard as plain Calvin", () => {
    applyRouteTitle(router.resolve("/"));
    expect(document.title).toBe("Calvin");
  });

  it("updates the title after a navigation", async () => {
    await router.push("/settings");
    expect(document.title).toBe("Settings – Calvin");
  });
});
