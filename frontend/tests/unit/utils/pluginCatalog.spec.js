import { describe, it, expect } from "vitest";
import {
  OFFICIAL_PLUGIN_CATALOG_REPO,
  isOfficialCatalogRepo,
  pickerCatalogRepo,
} from "@/utils/pluginCatalog";

describe("plugin catalog allowlist", () => {
  it("accepts the official catalog with trailing slash or .git", () => {
    expect(isOfficialCatalogRepo(OFFICIAL_PLUGIN_CATALOG_REPO)).toBe(true);
    expect(isOfficialCatalogRepo(`${OFFICIAL_PLUGIN_CATALOG_REPO}/`)).toBe(true);
    expect(isOfficialCatalogRepo(`${OFFICIAL_PLUGIN_CATALOG_REPO}.git`)).toBe(true);
    expect(isOfficialCatalogRepo(" HTTPS://GitHub.com/OsterbergSimon/Calvin-Plugins ")).toBe(true);
  });

  it("rejects any other repository, an empty value and look-alike hosts", () => {
    expect(isOfficialCatalogRepo("https://github.com/someone/evil-plugins")).toBe(false);
    expect(isOfficialCatalogRepo("https://github.com/osterbergsimon/calvin")).toBe(false);
    expect(isOfficialCatalogRepo("https://evil.example/osterbergsimon/calvin-plugins")).toBe(false);
    expect(isOfficialCatalogRepo("")).toBe(false);
    expect(isOfficialCatalogRepo(null)).toBe(false);
  });

  it("only ever returns the official catalog for the picker", () => {
    expect(pickerCatalogRepo("https://github.com/someone/evil-plugins")).toBe("");
    expect(pickerCatalogRepo("")).toBe("");
    expect(pickerCatalogRepo(OFFICIAL_PLUGIN_CATALOG_REPO)).toBe(OFFICIAL_PLUGIN_CATALOG_REPO);
  });
});
