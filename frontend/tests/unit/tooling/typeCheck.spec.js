/**
 * Guards for the `type-check` script (CLV-58).
 *
 * It used to be an alias for lint, so nothing ever type-checked the typed API
 * layer while the docs and the Makefile claimed vue-tsc ran. These assertions
 * keep the script, its narrow scope, and its CI wiring honest.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendRoot = resolve(__dirname, "../../..");

const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, "package.json"), "utf-8"));
const tsconfig = JSON.parse(
  readFileSync(resolve(frontendRoot, "tsconfig.typecheck.json"), "utf-8")
);
const ciWorkflow = readFileSync(resolve(frontendRoot, "../.github/workflows/ci.yml"), "utf-8");

describe("type-check tooling", () => {
  it("runs vue-tsc --noEmit instead of aliasing lint", () => {
    expect(packageJson.scripts["type-check"]).toContain("vue-tsc");
    expect(packageJson.scripts["type-check"]).toContain("--noEmit");
    expect(packageJson.scripts["type-check"]).not.toBe(packageJson.scripts.lint);
  });

  it("checks only the typed API layer, with JS checking off", () => {
    expect(tsconfig.compilerOptions.checkJs).toBe(false);
    expect(tsconfig.compilerOptions.noEmit).toBe(true);
    expect(tsconfig.include).toEqual(["src/api/**/*.ts"]);
    expect(tsconfig.include.some(glob => glob.includes(".vue"))).toBe(false);
  });

  it("is wired into the frontend CI job", () => {
    const frontendJob = ciWorkflow.slice(ciWorkflow.indexOf("frontend:"));
    expect(frontendJob).toContain("npm run type-check");
  });
});
