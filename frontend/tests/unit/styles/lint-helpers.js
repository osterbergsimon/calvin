/**
 * Shared scanning for the doctrine lints (docs/design/frontend-doctrine.md §7).
 *
 * The lints read `<style>` blocks as rules, not lines, so a declaration split
 * over several lines is still checked. `tokenLint` owns colour/size/radius
 * literals; these three own the role migration, control restyling and settings
 * style blocks.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Vitest provides __dirname; a plain `node` script does not.
const HERE =
  typeof __dirname === "string" ? __dirname : fileURLToPath(new URL(".", import.meta.url));

export const SRC = resolve(HERE, "../../../src");

const walk = dir => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    // Dev-only galleries are the reference pages, not shipped components
    // (the audit excludes them too).
    else if (name.endsWith(".vue") && !relative(SRC, path).startsWith("dev/")) {
      out.push(relative(SRC, path));
    }
  }
  return out.sort();
};

export const VUE_FILES = walk(SRC);

const read = file => readFileSync(join(SRC, file), "utf-8");

const blankComments = css => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ""));

/** Every `<style>` block as { selector, body, declarations } rules. */
export function styleRules(file) {
  const source = read(file);
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  const rules = [];
  for (const block of blocks) {
    const css = blankComments(block[1]);
    for (const match of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const declarations = match[2]
        .split(";")
        .map(declaration => {
          const colon = declaration.indexOf(":");
          if (colon === -1) return null;
          return {
            prop: declaration.slice(0, colon).trim().toLowerCase(),
            value: declaration.slice(colon + 1).trim(),
          };
        })
        .filter(Boolean);
      rules.push({
        selector: match[1].split(/\s+/).join(" ").trim(),
        body: match[2],
        declarations,
      });
    }
  }
  return rules;
}

const PRIMITIVE = /var\(--(fs-[a-z0-9-]+|space-[a-z0-9-]+|radius-(?:xs|sm|md|lg|xl|2xl))\)/g;
const WEIGHT_IN_SHORTHAND = /(?:^|\s)([1-9]00)(?=\s)/;
const DURATION = /\d*\.?\d+m?s\b/;

/** Doctrine §7 item 2 + §2's fixed z-index / shadow / weight / duration sets. */
export function roleViolations(file) {
  const found = [];
  const push = (rule, kind, value) => found.push({ file, selector: rule.selector, kind, value });

  for (const rule of styleRules(file)) {
    for (const match of rule.body.matchAll(PRIMITIVE)) {
      push(rule, "primitive token", match[0]);
    }
    for (const { prop, value } of rule.declarations) {
      if (prop === "font-weight" && /\d/.test(value)) push(rule, "numeric font-weight", value);
      if (prop === "font" && WEIGHT_IN_SHORTHAND.test(value))
        push(rule, "numeric font-weight", value);
      if (prop === "z-index" && !value.includes("var(")) push(rule, "literal z-index", value);
      if (prop === "box-shadow" && !value.includes("var(") && value !== "none") {
        push(rule, "literal box-shadow", value);
      }
      if (
        (prop === "transition" ||
          prop.startsWith("transition-") ||
          prop === "animation" ||
          prop.startsWith("animation-")) &&
        DURATION.test(value) &&
        !value.includes("var(")
      ) {
        push(rule, "literal duration", value);
      }
    }
  }
  return found;
}

const BANNED = [
  /^background(-color)?$/,
  /^border(-|$)/,
  /^font(-size|-weight)?$/,
  /^color$/,
  /^padding(-|$)/,
];

const targetsControl = selector =>
  selector.split(",").some(part =>
    part.split(/\s*[>+~]\s*|\s+/).some(compound => {
      const bare = compound.replace(/::?[a-z-]+(\([^)]*\))?/gi, "");
      return (
        /(^|[^\w-])(button|input|select)([^\w-]|$)/i.test(bare) ||
        /\.[\w-]*(btn|button)[\w-]*/i.test(bare)
      );
    })
  );

/** Doctrine §7 item 3: no visual restyling of controls outside components/ui/. */
export function controlViolations(file) {
  if (file.startsWith("components/ui/")) return [];
  const found = [];
  for (const rule of styleRules(file)) {
    if (!targetsControl(rule.selector)) continue;
    for (const { prop, value } of rule.declarations) {
      if (BANNED.some(pattern => pattern.test(prop))) {
        found.push({
          file,
          selector: rule.selector,
          kind: "control restyle",
          value: `${prop}: ${value}`,
        });
      }
    }
  }
  return found;
}

/** Doctrine §3.1 rule 1: a settings category or tab carries no style of its own. */
export function settingsStyleViolations(file) {
  if (
    !file.startsWith("components/settings/categories/") &&
    !file.startsWith("components/settings/tabs/")
  ) {
    return [];
  }
  return /<style/.test(read(file))
    ? [{ file, selector: "<style>", kind: "settings style block", value: "" }]
    : [];
}

export const formatViolation = violation =>
  `${violation.file}: ${violation.selector} — ${violation.kind}${violation.value ? ` (${violation.value})` : ""}`;

export const unallowed = (violations, allowlist) =>
  violations.filter(violation => !allowlist.includes(violation.file));

/** Entries whose file is already clean must leave the allowlist (it only shrinks). */
export const staleEntries = (allowlist, violationsFor) =>
  allowlist.filter(file => violationsFor(file).length === 0);

/** A new file may never be added to an allowlist — only removed. */
export const addedToAllowlist = (allowlist, baseline) =>
  allowlist.filter(file => !baseline.includes(file));
