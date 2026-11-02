#!/usr/bin/env node
// Pre-compress the Vite build output for the FastAPI static handler.
//
// The backend serves `<file>.br` or `<file>.gz` next to the raw file when the
// request's Accept-Encoding allows it (see app/services/frontend_static.py).
// Compressing at build time keeps the Pi from doing it per request and avoids
// a new runtime dependency.
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const COMPRESSIBLE_EXTENSIONS = new Set([".js", ".css", ".svg", ".json"]);

const BROTLI_OPTIONS = {
  params: {
    [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
    [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
  },
};

export function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

export function compressFile(filePath) {
  const source = readFileSync(filePath);
  const brotli = brotliCompressSync(source, BROTLI_OPTIONS);
  const gzip = gzipSync(source, { level: 9 });

  writeFileSync(`${filePath}.br`, brotli);
  writeFileSync(`${filePath}.gz`, gzip);

  return { source: source.length, brotli: brotli.length, gzip: gzip.length };
}

export function compressDist(distDir) {
  const targets = listFiles(distDir).filter(filePath =>
    COMPRESSIBLE_EXTENSIONS.has(extname(filePath).toLowerCase())
  );

  return targets.map(filePath => ({
    file: filePath,
    ...compressFile(filePath),
  }));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const defaultDist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  const distDir = resolve(process.argv[2] ?? defaultDist);

  if (!existsSync(distDir)) {
    console.error(`[compress-dist] dist directory not found: ${distDir}`);
    process.exitCode = 1;
    return;
  }

  const results = compressDist(distDir);
  const totals = results.reduce(
    (sum, result) => ({
      source: sum.source + result.source,
      brotli: sum.brotli + result.brotli,
      gzip: sum.gzip + result.gzip,
    }),
    { source: 0, brotli: 0, gzip: 0 }
  );

  console.log(
    `[compress-dist] ${results.length} files: ${formatBytes(totals.source)} raw -> ` +
      `${formatBytes(totals.brotli)} brotli, ${formatBytes(totals.gzip)} gzip`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main();
}
