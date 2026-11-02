#!/usr/bin/env node
/**
 * Initial-bundle budget for the dashboard entry (calvin-0fm6).
 *
 * `vite build` emits dist/bundle-graph.json (see the calvin-bundle-graph
 * plugin in vite.config.js): every emitted chunk with the modules it contains
 * and its static imports. This walks the entry chunk's static import graph and
 * fails when a module that the dashboard does not need on first paint rides
 * along:
 *
 *   - Settings components (the settings chunk: ~187 kB gzip)
 *   - plugin renderers (the plugins chunk: ~135 kB gzip)
 *   - simple-keyboard (the on-screen keyboard vendor code)
 *
 * It also prints the initial JS and CSS gzip sizes, so a regression is visible
 * in CI instead of only on a Pi.
 *
 * Run automatically at the end of `npm run build`; can also be run on its own
 * after a build.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(HERE, "..");
const DIST_DIR = process.env.CALVIN_DIST_DIR
  ? resolve(process.env.CALVIN_DIST_DIR)
  : join(FRONTEND_DIR, "dist");
const GRAPH_PATH = join(DIST_DIR, "bundle-graph.json");
const INDEX_PATH = join(DIST_DIR, "index.html");

const FORBIDDEN = [
  {
    label: "settings",
    why: "Settings must load only when it is opened",
    matches: id =>
      id.includes("/src/views/Settings.vue") || id.includes("/src/components/settings/"),
  },
  {
    label: "plugins",
    why: "plugin renderers must load only for a plugin that needs one",
    matches: id => id.includes("/src/components/plugins/"),
  },
  {
    label: "simple-keyboard",
    why: "the on-screen keyboard must load only when a field is focused",
    matches: id => id.includes("/node_modules/simple-keyboard/"),
  },
];

const formatBytes = bytes => {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${bytes} B`;
};

const fail = message => {
  console.error(`\n✗ bundle budget: ${message}`);
  process.exitCode = 1;
};

const main = () => {
  if (!existsSync(GRAPH_PATH)) {
    fail(`missing ${GRAPH_PATH}. Run \`npm run build\` first.`);
    return;
  }

  const graph = JSON.parse(readFileSync(GRAPH_PATH, "utf-8"));
  const files = graph.files || graph.chunks || {};
  const entry = Object.entries(files).find(([, chunk]) => chunk.isEntry);
  if (!entry) {
    fail("the build graph has no entry chunk.");
    return;
  }

  // Static imports only: dynamic imports are exactly what gets deferred.
  const initial = new Set();
  const visit = file => {
    if (initial.has(file) || !files[file]) return;
    initial.add(file);
    for (const imported of files[file].imports || []) visit(imported);
  };
  visit(entry[0]);

  let jsRaw = 0;
  let jsGzip = 0;
  for (const file of initial) {
    const buffer = readFileSync(join(DIST_DIR, file));
    jsRaw += buffer.length;
    jsGzip += gzipSync(buffer).length;
  }

  let cssRaw = 0;
  let cssGzip = 0;
  if (existsSync(INDEX_PATH)) {
    const html = readFileSync(INDEX_PATH, "utf-8");
    const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(
      match => match[1].replace(/^\//, "")
    );
    for (const file of styles) {
      const path = join(DIST_DIR, file);
      if (!existsSync(path)) continue;
      const buffer = readFileSync(path);
      cssRaw += buffer.length;
      cssGzip += gzipSync(buffer).length;
    }
  }

  const violations = [];
  for (const file of initial) {
    for (const moduleId of files[file].modules || []) {
      for (const rule of FORBIDDEN) {
        if (rule.matches(moduleId)) {
          violations.push({ file, moduleId, rule });
        }
      }
    }
  }

  console.log("Initial JS graph (dashboard entry, raw / gzip):");
  for (const file of [...initial].sort()) {
    const buffer = readFileSync(join(DIST_DIR, file));
    console.log(`  ${file.padEnd(46)} ${formatBytes(buffer.length)} / ${formatBytes(gzipSync(buffer).length)}`);
  }
  console.log(
    `  ${"total".padEnd(46)} ${formatBytes(jsRaw)} / ${formatBytes(jsGzip)} gzip`
  );
  console.log(`Initial CSS: ${formatBytes(cssRaw)} / ${formatBytes(cssGzip)} gzip`);

  if (violations.length) {
    for (const violation of violations) {
      fail(
        `${violation.rule.label} module in the initial graph (${violation.file}): ` +
          `${violation.moduleId}\n    ${violation.rule.why}.`
      );
    }
    return;
  }

  console.log("✓ bundle budget: no settings, plugin or simple-keyboard modules on first paint.");
};

main();
