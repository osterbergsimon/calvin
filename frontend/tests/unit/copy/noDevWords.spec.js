/**
 * CLV-63 §4 — the copy guard.
 *
 * A release check that no developer words reach a screen: scans every template's
 * text and its label/description/title/placeholder/aria-label/message strings,
 * plus the System toasts in useSystem.js, and fails on the vocabulary the design
 * spec bans. It also keeps raw error objects out of dashboard interpolations.
 *
 * Rules live in docs/design/2026-10-31-no-developer-words.md.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { parse as parseDom } from "@vue/compiler-dom";

const COMPONENTS_DIR = "src/components";
const USE_SYSTEM = "src/composables/useSystem.js";

// "Say screen, page, source, plugin, Calvin (for the server)" — never these.
// `api` stays legal for "API keys", and `configuration` is not `config`.
const BANNED =
  /\b(backend|frontend|api(?! key)|instance|schema|payload|endpoint|branch|repository|healthy|config(?!m))\b/i;

const COPY_ATTRS = ["label", "description", "title", "placeholder", "aria-label", "message"];

// Spec-allowed exceptions: the `dev/` playground, the Docker command block and
// the dev-mode-only Local path copy are for the person running the server.
const SKIP_DIRS = ["src/components/dev/"];
const ALLOWED_COPY = [/docker compose/i, /\/absolute\/path\//i];

// The weather renderer prints the plugin's own `data.error` payload — the
// plugin's copy, not Calvin's error object. Everything else must not interpolate
// an error, so a raw message can never land on the wall (CLV-63 §1).
const RAW_ERROR_ALLOWLIST = new Set(["src/components/plugins/renderers/WeatherForecast.vue"]);

const toPosix = path => path.split("\\").join("/");

function vueFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) vueFiles(path, out);
    else if (path.endsWith(".vue")) out.push(toPosix(path));
  }
  return out.sort();
}

const stripPlaceholders = text => text.replace(/\$\{[^}]*\}/g, "");

// A dynamic attribute's copy: its quoted literals, plus template literals with
// their `${…}` parts removed (those are values, not words).
function stringsIn(expression) {
  const out = [];
  for (const match of expression.matchAll(
    /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g
  )) {
    out.push(match[1] ?? match[2]);
  }
  for (const match of expression.matchAll(/`([^`\\]*(?:\\.[^`\\]*)*)`/g)) {
    out.push(stripPlaceholders(match[1]));
  }
  return out;
}

function collectCopy(file) {
  const source = readFileSync(file, "utf8");
  const { descriptor } = parseSfc(source, { filename: file });
  if (!descriptor.template) return [];

  const hits = [];
  const visit = node => {
    if (node.type === 2) {
      const text = node.content.replace(/\s+/g, " ").trim();
      if (text) hits.push({ where: "text", text });
    }
    if (node.type === 1) {
      for (const prop of node.props || []) {
        let name;
        let values = [];
        if (prop.type === 6) {
          name = prop.name;
          values = prop.value ? [prop.value.content] : [];
        } else if (prop.type === 7) {
          name = prop.arg?.content;
          values = prop.exp?.content ? stringsIn(prop.exp.content) : [];
        }
        if (name && COPY_ATTRS.includes(name)) {
          for (const value of values) hits.push({ where: name, text: value });
        }
      }
    }
    for (const child of node.children || []) visit(child);
    for (const branch of node.branches || []) visit(branch);
  };
  visit(parseDom(descriptor.template.content, { comments: false }));
  return hits;
}

describe("copy: no developer words in the UI (CLV-63)", () => {
  const files = vueFiles(COMPONENTS_DIR).filter(
    file => !SKIP_DIRS.some(skip => file.startsWith(skip))
  );

  it("scans a non-trivial number of components", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("uses plain words in template text and labels", () => {
    const failures = [];
    for (const file of files) {
      for (const { where, text } of collectCopy(file)) {
        if (!BANNED.test(text)) continue;
        if (ALLOWED_COPY.some(allowed => allowed.test(text))) continue;
        failures.push(`${file} [${where}]: ${text}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("uses plain words in the System toasts", () => {
    const source = readFileSync(USE_SYSTEM, "utf8");
    const assignments = [...source.matchAll(/updateMessage\.value\s*=\s*(?:"([^"]*)"|`([^`]*)`)/g)];
    expect(assignments.length).toBeGreaterThan(10);

    const failures = [];
    for (const [, plain, template] of assignments) {
      const text = plain ?? template ?? "";
      if (BANNED.test(text)) failures.push(text);
    }
    expect(failures).toEqual([]);

    // Errors go through friendlyError; raw error text never becomes a toast.
    // (A server *progress* message like `data.message` is fine.)
    expect(source).not.toMatch(
      /updateMessage\.value\s*=\s*(?:errorDetailMessage|err\.message|error\.message)\b/
    );
  });

  it("never interpolates an error on the dashboard", () => {
    const failures = [];
    for (const file of files) {
      if (file.startsWith("src/components/settings/") || RAW_ERROR_ALLOWLIST.has(file)) continue;
      const source = readFileSync(file, "utf8");
      const { descriptor } = parseSfc(source, { filename: file });
      if (!descriptor.template) continue;
      const visit = node => {
        if (node.type === 5) {
          const expression = node.content.content;
          // `store.error`, `data.error`, `err.message` — an error object's text.
          if (/\.error\b/.test(expression) || /\berr(or)?\.message\b/.test(expression)) {
            failures.push(`${file}: {{ ${expression.trim()} }}`);
          }
        }
        for (const child of node.children || []) visit(child);
        for (const branch of node.branches || []) visit(branch);
      };
      visit(parseDom(descriptor.template.content, { comments: false }));
    }
    expect(failures).toEqual([]);
  });
});
