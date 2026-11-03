import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { compressDist } from "../../scripts/compress-dist.mjs";

const tempDirs = [];

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), "calvin-compress-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "assets", "js"), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("compressDist", () => {
  it("writes brotli and gzip siblings for JS, CSS, SVG and JSON", () => {
    const dist = makeDist();
    const sources = {
      [join(dist, "assets", "js", "index-AbCd1234.js")]: "console.log('calvin');\n".repeat(40),
      [join(dist, "assets", "css", "index-AbCd1234.css")]: ".region { color: red; }\n".repeat(40),
      [join(dist, "assets", "logo-AbCd1234.svg")]: "<svg><rect /></svg>".repeat(40),
      [join(dist, "assets", "data-AbCd1234.json")]: '{"region":"kitchen"}'.repeat(40),
    };
    mkdirSync(join(dist, "assets", "css"), { recursive: true });
    for (const [path, contents] of Object.entries(sources)) {
      writeFileSync(path, contents);
    }

    const results = compressDist(dist);

    expect(results).toHaveLength(Object.keys(sources).length);
    for (const [path, contents] of Object.entries(sources)) {
      expect(existsSync(`${path}.br`)).toBe(true);
      expect(existsSync(`${path}.gz`)).toBe(true);
      expect(brotliDecompressSync(readFileSync(`${path}.br`)).toString()).toBe(contents);
      expect(gunzipSync(readFileSync(`${path}.gz`)).toString()).toBe(contents);
    }
  });

  it("leaves HTML and binary assets alone", () => {
    const dist = makeDist();
    const html = join(dist, "index.html");
    const png = join(dist, "assets", "icon-AbCd1234.png");
    writeFileSync(html, "<!doctype html>");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    compressDist(dist);

    expect(existsSync(`${html}.br`)).toBe(false);
    expect(existsSync(`${html}.gz`)).toBe(false);
    expect(existsSync(`${png}.br`)).toBe(false);
    expect(existsSync(`${png}.gz`)).toBe(false);
  });

  it("ignores siblings written by an earlier run", () => {
    const dist = makeDist();
    writeFileSync(join(dist, "assets", "app-AbCd1234.js"), "x".repeat(200));

    const first = compressDist(dist);
    const second = compressDist(dist);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});
