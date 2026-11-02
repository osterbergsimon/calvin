import { describe, expect, it } from "vitest";
import { buildComponentOptions, filterComponentOptions } from "@/utils/componentPicker";

// A service instance as shaped by the webServices store: the human-facing
// `name` is the *instance* name (e.g. "Hem"), while `plugin_name` carries the
// service *type* name (e.g. "Yr.no Weather").
const yr = { id: "yr_weather-5df1d86a", name: "Hem", plugin_name: "Yr.no Weather" };
const mealie = { id: "mealie-9a4251d5", name: "Mat", plugin_name: "Mealie Meal Plan" };

describe("buildComponentOptions", () => {
  it("always offers the built-in calendar and photos components", () => {
    const options = buildComponentOptions([]);
    expect(options.map(o => o.value)).toEqual(["calendar", "photos"]);
  });

  it("maps service instances to options carrying both instance and plugin names", () => {
    const [yrOption] = buildComponentOptions([yr]).filter(o => o.kind === "service");
    expect(yrOption).toMatchObject({
      value: "service:yr_weather-5df1d86a",
      label: "Hem",
      pluginName: "Yr.no Weather",
      kind: "service",
      instanceIds: ["yr_weather-5df1d86a"],
    });
  });
});

describe("filterComponentOptions", () => {
  const options = buildComponentOptions([yr, mealie]);

  it("returns everything when the query is blank", () => {
    expect(filterComponentOptions(options, "  ")).toHaveLength(options.length);
  });

  it("finds a service by its instance name", () => {
    expect(filterComponentOptions(options, "hem").map(o => o.label)).toEqual(["Hem"]);
  });

  // The regression: searching by the service *type* ("yr" / "weather") must still
  // surface the instance even though its label is the unrelated name "Hem".
  it("finds a service by its plugin type name", () => {
    expect(filterComponentOptions(options, "yr").map(o => o.label)).toEqual(["Hem"]);
    expect(filterComponentOptions(options, "weather").map(o => o.label)).toEqual(["Hem"]);
  });

  it("still matches the built-in components by label", () => {
    expect(filterComponentOptions(options, "cal").map(o => o.value)).toEqual(["calendar"]);
  });
});
